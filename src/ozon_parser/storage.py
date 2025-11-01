import datetime as dt
import datetime as dt
from typing import Iterable, Optional, List, Dict, Any

from pymongo import MongoClient, ReplaceOne


class MongoStore:
    def __init__(self, uri: str, db_name: str, collection: str, metrics_collection: Optional[str] = None) -> None:
        self.client = MongoClient(uri)
        self.db = self.client[db_name]
        self.col = self.db[collection]
        self.metrics_col = self.db[metrics_collection or f"{collection}_metrics"]
        # Ensure helpful indexes
        try:
            self.col.create_index("ozon_id", unique=True, sparse=True)
            self.col.create_index("url", sparse=True)
            self.col.create_index("reviews_count")
            self.col.create_index("rating_value")
            self.metrics_col.create_index("_id", unique=True)
            self.metrics_col.create_index([("date", 1), ("ozon_id", 1)])
        except Exception:
            # Index creation errors should not block runtime
            pass

    def upsert_products(self, products: Iterable[dict]) -> int:
        ops = []
        now = dt.datetime.utcnow()
        count = 0
        for p in products:
            doc = {**p, "updated_at": now}
            # Prefer ozon_id for idempotency; fallback to URL
            pid = p.get("ozon_id") or p.get("url") or p.get("url_path")
            if not pid:
                continue
            # Use ozon_id as _id if present to dedupe strongly
            if p.get("ozon_id"):
                doc["_id"] = p["ozon_id"]
            ops.append(
                ReplaceOne({"_id": doc.get("_id", pid)}, doc, upsert=True)
            )
            count += 1
        if not ops:
            return 0
        res = self.col.bulk_write(ops, ordered=False)
        return res.upserted_count + res.modified_count

    def upsert_daily_metrics(self, products: Iterable[dict], date: Optional[dt.date] = None) -> int:
        day = (date or dt.datetime.utcnow().date()).isoformat()
        ops = []
        count = 0
        for p in products:
            pid = p.get("ozon_id") or p.get("url") or p.get("url_path")
            if not pid:
                continue
            metrics = {
                "_id": f"{day}:{pid}",
                "date": day,
                "ozon_id": p.get("ozon_id"),
                "name": p.get("name"),
                "price_text": p.get("price_text"),
                "rating_value": p.get("rating_value"),
                "reviews_count": p.get("reviews_count"),
                "delivery_min_date": p.get("delivery_min_date"),
                "delivery_days": p.get("delivery_days"),
                "url": p.get("url"),
                "brand": p.get("brand"),
                "seller_id": p.get("seller_id"),
                "seller_name": p.get("seller_name"),
            }
            ops.append(ReplaceOne({"_id": metrics["_id"]}, metrics, upsert=True))
            count += 1
        if not ops:
            return 0
        res = self.metrics_col.bulk_write(ops, ordered=False)
        return res.upserted_count + res.modified_count
