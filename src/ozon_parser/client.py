import json
import logging
import random
import time
import re
import datetime as dt
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from .utils import build_default_headers


class OzonClient:
    """
    Lightweight client for Ozon composer API pagination.

    It calls:
      GET https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=<PATH>
    where <PATH> is a URL path like '/highlight/.../?category=7500&page=2'.
    """

    BASE_URL = "https://www.ozon.ru"
    COMPOSER_ENDPOINT = BASE_URL + "/api/composer-api.bx/page/json/v2"

    def __init__(
        self,
        *,
        user_agent: Optional[str] = None,
        timeout: float = 15.0,
        sleep_range: Tuple[float, float] = (1.0, 2.5),
        proxies: Optional[Dict[str, str]] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self.session = requests.Session()
        self.session.headers.update(build_default_headers(user_agent))
        self.timeout = timeout
        self.sleep_range = sleep_range
        self.proxies = proxies
        self.log = logger or logging.getLogger("ozon-parser.client")

    def _sleep_backoff(self) -> None:
        mn, mx = self.sleep_range
        delay = random.uniform(mn, mx)
        time.sleep(delay)

    def warmup(self, url_path: str) -> None:
        """Fetch HTML pages to let ozon set cookies before composer calls."""
        try:
            # Hit home first
            self.session.get(
                self.BASE_URL + "/",
                timeout=self.timeout,
                proxies=self.proxies,
            )
            # Then the actual listing HTML
            self.session.get(
                self.BASE_URL + url_path,
                timeout=self.timeout,
                proxies=self.proxies,
            )
            self.log.info("Warmup completed", extra={"path": url_path})
        except Exception as e:
            self.log.warning("Warmup failed", extra={"error": str(e)})

    @retry(wait=wait_exponential_jitter(initial=1, max=8), stop=stop_after_attempt(3))
    def _get(self, url_path: str) -> Dict:
        params = {"url": url_path}
        self.log.debug("GET composer", extra={"url": url_path})
        resp = self.session.get(
            self.COMPOSER_ENDPOINT,
            params=params,
            timeout=self.timeout,
            proxies=self.proxies,
        )
        if resp.status_code != 200:
            self.log.warning(
                "Non-200 from composer",
                extra={"status": resp.status_code, "path": url_path},
            )
            resp.raise_for_status()
        as_json = resp.json()
        if not isinstance(as_json, dict) or "widgetStates" not in as_json:
            raise ValueError("Unexpected composer response structure")
        return as_json

    def _get_widget_states(self, url_path: str) -> List[Dict]:
        data = self._get(url_path)
        widget_states: Dict[str, str] = data.get("widgetStates", {})
        return list(self._iter_widget_json(widget_states))

    @staticmethod
    def _iter_widget_json(widget_states: Dict[str, str]) -> Generator[Dict, None, None]:
        for key, val in widget_states.items():
            if not isinstance(val, str):
                continue
            try:
                parsed = json.loads(val)
            except Exception:
                continue
            if isinstance(parsed, dict):
                parsed["__state_key"] = key
                yield parsed

    @staticmethod
    def _extract_items(state: Dict) -> List[Dict]:
        items = state.get("items")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
        # Some widgets may nest under 'data' or 'widget'
        data = state.get("data")
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return [x for x in data["items"] if isinstance(x, dict)]
        return []

    @staticmethod
    def _get_next_page_url(state: Dict) -> Optional[str]:
        # Try common locations first
        np = state.get("nextPage")
        if isinstance(np, dict):
            url = np.get("url") or np.get("link") or np.get("href")
            if isinstance(url, str) and url:
                return url
        data = state.get("data")
        if isinstance(data, dict):
            np = data.get("nextPage") or data.get("next") or data.get("loadMore")
            if isinstance(np, dict):
                url = np.get("url") or np.get("link") or np.get("href")
                if isinstance(url, str) and url:
                    return url
        # Deep search for a nested object that looks like a next link
        for path, val in OzonClient._walk(state):
            if isinstance(val, dict):
                key_join = "/".join(path).lower()
                if any(k in key_join for k in ("next", "loadmore", "pagination", "more")):
                    url = val.get("url") or val.get("link") or val.get("href")
                    if isinstance(url, str) and url:
                        return url
        return None

    @staticmethod
    def _get_first_nonempty(*candidates: Optional[str]) -> Optional[str]:
        for c in candidates:
            if isinstance(c, str) and c.strip():
                return c.strip()
        return None

    @staticmethod
    def _get_nested(obj: Dict, path: List[str]) -> Optional[str]:
        cur = obj
        for p in path:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(p)
        return cur if isinstance(cur, str) else None

    @staticmethod
    def _to_float(v: Any) -> Optional[float]:
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v.replace(",", ".").strip())
            except Exception:
                return None
        return None

    @staticmethod
    def _to_int(v: Any) -> Optional[int]:
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        if isinstance(v, str):
            s = v.strip()
            if s.isdigit():
                return int(s)
        return None

    @classmethod
    def _extract_product(cls, item: Dict) -> Optional[Dict]:
        # Try to capture ID from multiple places
        cell = item.get("cellTrackingInfo") or {}
        tile = item.get("tile") or {}
        action = item.get("action") or {}

        pid = (
            cell.get("id")
            or cell.get("productId")
            or item.get("id")
            or item.get("sku")
            or item.get("skuId")
        )
        if isinstance(pid, str) and pid.isdigit():
            pid = int(pid)
        if not isinstance(pid, (int, str)):
            # Some tiles embed id under tile.sku or tile.id
            pid = tile.get("sku") or tile.get("id")

        # Title/name
        name = cls._get_first_nonempty(
            cls._get_nested(tile, ["title", "text"]),
            cls._get_nested(item, ["title", "text"]),
            item.get("name"),
        )

        # URL path
        url = cls._get_first_nonempty(
            action.get("link"),
            item.get("link"),
            tile.get("link"),
        )

        # Price text; we keep numeric parsing simple since Ozon uses complex models
        price_text = None
        price_sources = [
            (tile.get("price") or {}).get("price"),
            (tile.get("price") or {}).get("priceString"),
            (item.get("price") or {}).get("priceString"),
            (item.get("price") or {}).get("price"),
        ]
        for p in price_sources:
            if isinstance(p, str) and p.strip():
                price_text = p
                break

        # Rating and reviews count (if present on listing tiles)
        rating_value = None
        reviews_count = None
        rating_sources = [
            (tile.get("rating") or {}).get("value"),
            item.get("ratingValue"),
            item.get("rating"),
        ]
        for rv in rating_sources:
            f = cls._to_float(rv)
            if f is not None and 0.0 <= f <= 5.0:
                rating_value = f
                break

        reviews_sources = [
            (tile.get("rating") or {}).get("count"),
            item.get("reviewsCount"),
            item.get("feedbackCount"),
            item.get("reviewCount"),
            cell.get("feedbackCount"),
        ]
        for rc in reviews_sources:
            iv = cls._to_int(rc)
            if iv is not None:
                reviews_count = iv
                break

        if not pid and not url:
            return None

        result = {
            "ozon_id": pid,
            "name": name,
            "url_path": url,
            "price_text": price_text,
        }
        if rating_value is not None:
            result["rating_value"] = rating_value
        if reviews_count is not None:
            result["reviews_count"] = reviews_count
        return result

    # -----------------
    # Details extraction
    # -----------------

    @staticmethod
    def _walk(obj: Any, parents: Optional[List[str]] = None) -> Generator[Tuple[List[str], Any], None, None]:
        parents = parents or []
        if isinstance(obj, dict):
            for k, v in obj.items():
                path = parents + [str(k)]
                yield path, v
                yield from OzonClient._walk(v, path)
        elif isinstance(obj, list):
            for idx, v in enumerate(obj):
                path = parents + [str(idx)]
                yield path, v
                yield from OzonClient._walk(v, path)

    @staticmethod
    def _collect_by_key_contains(states: List[Dict], keys: List[str], want_type: Optional[type] = None) -> List[Any]:
        res: List[Any] = []
        keys_l = [k.lower() for k in keys]
        for st in states:
            for path, val in OzonClient._walk(st):
                last = path[-1].lower() if path else ""
                if any(k in last for k in keys_l):
                    if want_type is None or isinstance(val, want_type):
                        res.append(val)
        return res

    @staticmethod
    def _collect_texts_near(states: List[Dict], scope_keys: List[str]) -> List[str]:
        texts: List[str] = []
        scope_l = [k.lower() for k in scope_keys]
        for st in states:
            for path, val in OzonClient._walk(st):
                joined = "/".join(path).lower()
                if any(k in joined for k in scope_l):
                    if isinstance(val, str):
                        s = val.strip()
                        if s:
                            texts.append(s)
        # Deduplicate preserving order
        seen = set()
        uniq = []
        for t in texts:
            if t not in seen:
                uniq.append(t)
                seen.add(t)
        return uniq

    @staticmethod
    def _select_rating(values: List[Any]) -> Optional[float]:
        nums: List[float] = []
        for v in values:
            if isinstance(v, (int, float)):
                nums.append(float(v))
            elif isinstance(v, str):
                try:
                    nums.append(float(v.replace(",", ".")))
                except Exception:
                    pass
        # choose a plausible rating between 0 and 5
        candidates = [x for x in nums if 0.0 <= x <= 5.0]
        if not candidates:
            return None
        # prefer the max plausible rating value
        return max(candidates)

    @staticmethod
    def _select_int(values: List[Any]) -> Optional[int]:
        for v in values:
            if isinstance(v, int):
                return v
            if isinstance(v, str) and v.isdigit():
                return int(v)
        return None

    @staticmethod
    def _collect_images(states: List[Dict]) -> List[str]:
        imgs: List[str] = []
        candidates = OzonClient._collect_by_key_contains(
            states, ["image", "images", "picture", "pictures", "gallery"]
        )
        for c in candidates:
            if isinstance(c, str) and c.strip():
                if c.startswith("http"):
                    imgs.append(c)
            elif isinstance(c, list):
                for it in c:
                    if isinstance(it, str) and it.startswith("http"):
                        imgs.append(it)
                    elif isinstance(it, dict):
                        for k in ("url", "src", "image", "preview"):
                            u = it.get(k)
                            if isinstance(u, str) and u.startswith("http"):
                                imgs.append(u)
            elif isinstance(c, dict):
                for k in ("url", "src", "image", "preview"):
                    u = c.get(k)
                    if isinstance(u, str) and u.startswith("http"):
                        imgs.append(u)
        # dedupe while preserving order
        seen = set()
        uniq = []
        for u in imgs:
            if u not in seen:
                uniq.append(u)
                seen.add(u)
        return uniq

    @staticmethod
    def _collect_characteristics(states: List[Dict]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        # Gather typical structures used by characteristics/specs widgets
        cands = OzonClient._collect_by_key_contains(
            states,
            ["characteristic", "spec", "property", "attribute", "param"],
        )
        def push(name: Any, value: Any):
            if isinstance(name, str):
                vs: Optional[str] = None
                if isinstance(value, str):
                    vs = value
                elif isinstance(value, list):
                    vs = ", ".join([str(v) for v in value if v is not None])
                elif value is not None:
                    vs = str(value)
                if vs is not None and vs != "":
                    out.append({"name": name, "value": vs})

        for c in cands:
            if isinstance(c, list):
                for it in c:
                    if isinstance(it, dict):
                        name = it.get("name") or it.get("title") or it.get("key")
                        value = it.get("value") or it.get("values") or it.get("text")
                        if name is not None and value is not None:
                            push(name, value)
            elif isinstance(c, dict):
                # Sometimes groups
                items = c.get("items") or c.get("list") or c.get("rows")
                if isinstance(items, list):
                    for it in items:
                        if isinstance(it, dict):
                            name = it.get("name") or it.get("title") or it.get("key")
                            value = it.get("value") or it.get("values") or it.get("text")
                            if name is not None and value is not None:
                                push(name, value)
        return out

    @staticmethod
    def _collect_delivery_info(states: List[Dict]) -> Dict[str, Any]:
        # Extract delivery-related texts and earliest ISO date if present
        texts = OzonClient._collect_texts_near(states, ["deliver", "eta", "slot", "date", "period", "time"])
        # Find dates like 2025-01-02 or 02.11.2025
        iso_date = None
        for t in texts:
            m = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", t)
            if m:
                iso_date = m.group(1)
                break
            m = re.search(r"\b(\d{2}\.\d{2}\.20\d{2})\b", t)
            if m:
                # convert dd.mm.yyyy → yyyy-mm-dd
                dd, mm, yyyy = m.group(1).split(".")
                iso_date = f"{yyyy}-{mm}-{dd}"
                break
        return {
            "delivery_texts": texts[:20],  # cap for sanity
            "delivery_min_date": iso_date,
        }

    @staticmethod
    def _collect_title(states: List[Dict]) -> Optional[str]:
        candidates = []
        for st in states:
            # common places: title.text, heading.title, productTitle
            t = (
                ((st.get("title") or {}).get("text") if isinstance(st.get("title"), dict) else None)
                or st.get("productTitle")
                or st.get("name")
            )
            if isinstance(t, str) and t.strip():
                candidates.append(t.strip())
        return candidates[0] if candidates else None

    @staticmethod
    def _collect_price(states: List[Dict]) -> Dict[str, Any]:
        texts = OzonClient._collect_by_key_contains(states, ["price", "finalPrice", "originalPrice", "priceString"])
        # pick first non-empty string for display price
        price_text = None
        for t in texts:
            if isinstance(t, str) and t.strip():
                price_text = t.strip()
                break
            if isinstance(t, dict):
                for k in ("price", "priceString", "finalPrice", "originalPrice"):
                    v = t.get(k)
                    if isinstance(v, str) and v.strip():
                        price_text = v.strip()
                        break
                if price_text:
                    break
        return {"price_text": price_text}

    @staticmethod
    def _collect_brand(states: List[Dict]) -> Optional[str]:
        vals = OzonClient._collect_by_key_contains(states, ["brand", "brandName"])
        for v in vals:
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, dict):
                for k in ("name", "title", "brandName", "text"):
                    s = v.get(k)
                    if isinstance(s, str) and s.strip():
                        return s.strip()
        return None

    @staticmethod
    def _collect_seller(states: List[Dict]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        vals = OzonClient._collect_by_key_contains(states, ["seller"])
        for v in vals:
            if isinstance(v, dict):
                name = v.get("name") or v.get("title") or v.get("sellerName")
                sid = v.get("id") or v.get("sellerId")
                rating = v.get("rating") or v.get("score")
                if name and not out.get("seller_name") and isinstance(name, str):
                    out["seller_name"] = name
                if sid and not out.get("seller_id"):
                    out["seller_id"] = sid
                if rating and not out.get("seller_rating"):
                    try:
                        out["seller_rating"] = float(rating)
                    except Exception:
                        pass
        return out

    def get_product_details(self, url_path: str) -> Dict[str, Any]:
        """
        Fetch product card page via composer API and extract visible data like
        rating, reviews count, delivery info, images, brand, seller, specs.
        """
        self._sleep_backoff()
        states = self._get_widget_states(url_path)

        # Rating and reviews
        rating_values = self._collect_by_key_contains(states, ["rating", "averageRating", "ratingValue"])
        rating_value = self._select_rating(rating_values)
        reviews_values = self._collect_by_key_contains(states, ["reviewsCount", "feedbackCount", "reviewCount", "ratingCount"])
        reviews_count = self._select_int(reviews_values)
        # Some pages surface votes under 'count' near rating; as a fallback, pick first int 'count'
        if reviews_count is None:
            count_candidates = self._collect_by_key_contains(states, ["count"])
            reviews_count = self._select_int(count_candidates)

        # Delivery info
        delivery = self._collect_delivery_info(states)
        delivery_days = None
        if delivery.get("delivery_min_date"):
            try:
                today = dt.datetime.utcnow().date()
                y, m, d = [int(x) for x in delivery["delivery_min_date"].split("-")]
                target = dt.date(y, m, d)
                delivery_days = (target - today).days
            except Exception:
                delivery_days = None

        # Images
        images = self._collect_images(states)

        # Title and price
        title = self._collect_title(states)
        price_info = self._collect_price(states)

        # Brand and seller
        brand = self._collect_brand(states)
        seller = self._collect_seller(states)

        # Characteristics/specs
        characteristics = self._collect_characteristics(states)

        details: Dict[str, Any] = {
            "name": title,
            "rating_value": rating_value,
            "reviews_count": reviews_count,
            "images": images[:50],  # cap gallery size
            "brand": brand,
            **price_info,
            **seller,
            **delivery,
            "delivery_days": delivery_days,
            "characteristics": characteristics[:200],
        }
        # remove None entries
        details = {k: v for k, v in details.items() if v is not None}
        return details

    def iter_products(
        self, start_url_path: str, max_pages: Optional[int] = None
    ) -> Generator[Dict, None, None]:
        """
        Iterate products across composer pages. Emits product dicts.
        """
        visited: set = set()
        seen_ids: set = set()
        url_path = start_url_path
        page_num = 1

        # Do a warmup to get initial cookies
        try:
            self.warmup(url_path)
        except Exception:
            pass

        while url_path:
            if url_path in visited:
                self.log.debug("Seen page, stopping to avoid loop", extra={"url": url_path})
                break
            visited.add(url_path)

            self._sleep_backoff()
            data = self._get(url_path)
            widget_states: Dict[str, str] = data.get("widgetStates", {})

            # Extract items
            found_items: List[Dict] = []
            next_page_candidates: List[str] = []
            for state in self._iter_widget_json(widget_states):
                key = state.get("__state_key")
                # Be permissive: accept typical product list widgets
                if isinstance(key, str):
                    lk = key.lower()
                    if not any(s in lk for s in ("search", "catalog", "collection", "product", "shelf", "list")):
                        continue
                items = self._extract_items(state)
                if items:
                    found_items.extend(items)
                nxt = self._get_next_page_url(state)
                if nxt:
                    next_page_candidates.append(nxt)

            emitted = 0
            for it in found_items:
                prod = self._extract_product(it)
                if prod:
                    # Enrich absolute URL if possible
                    if prod.get("url_path"):
                        prod["url"] = self.BASE_URL + prod["url_path"]
                    pid = prod.get("ozon_id")
                    if pid is not None:
                        if pid in seen_ids:
                            continue
                        seen_ids.add(pid)
                    yield prod
                    emitted += 1

            self.log.info(
                "Parsed page",
                extra={"page": page_num, "items": emitted, "path": url_path},
            )

            # Next page decision
            url_path = None
            for cand in next_page_candidates:
                if isinstance(cand, str) and cand.startswith("/"):
                    url_path = cand
                    break

            page_num += 1
            if max_pages and page_num > max_pages:
                break
