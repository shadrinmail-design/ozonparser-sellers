import argparse
import json
import time
from typing import Dict, List, Set

from playwright.sync_api import sync_playwright

from .client import OzonClient
from .utils import setup_logger


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Scrape Ozon using real browser (Playwright)")
    ap.add_argument("--start-url", default="/highlight/tovary-iz-kitaya-935133/?from_global=true")
    ap.add_argument("--max-pages", type=int, default=3)
    ap.add_argument("--headless", action="store_true")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    log = setup_logger()

    start_url = args.start_url
    if not start_url.startswith("/"):
        raise SystemExit("--start-url must start with /")

    products: List[Dict] = []
    seen: Set = set()

    def handle_response(response):
        try:
            url = response.url
            if "composer-api.bx/page/json" not in url:
                return
            if response.status != 200:
                return
            data = response.json()
        except Exception:
            return
        ws = data.get("widgetStates", {})
        if not isinstance(ws, dict):
            return
        for state in OzonClient._iter_widget_json(ws):
            key = state.get("__state_key", "")
            if isinstance(key, str):
                lk = key.lower()
                if not any(s in lk for s in ("search", "catalog", "collection", "product", "shelf", "list")):
                    continue
            items = OzonClient._extract_items(state)
            for it in items:
                prod = OzonClient._extract_product(it)
                if not prod:
                    continue
                pid = prod.get("ozon_id")
                if pid in seen:
                    continue
                seen.add(pid)
                if prod.get("url_path"):
                    prod["url"] = OzonClient.BASE_URL + prod["url_path"]
                products.append(prod)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        context = browser.new_context(locale="ru-RU")
        page = context.new_page()
        page.on("response", handle_response)

        page.goto(OzonClient.BASE_URL + start_url, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=15000)

        # Scroll loops
        for i in range(max(1, args.max_pages)):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2.0)
            page.wait_for_load_state("networkidle", timeout=15000)
            log.info("Scrolled page", extra={"loop": i + 1, "collected": len(products)})

        context.close()
        browser.close()

    print(json.dumps({"count": len(products)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

