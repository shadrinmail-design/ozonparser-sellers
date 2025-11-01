import argparse
import os
from typing import Optional

from .client import OzonClient
from .storage import MongoStore
from .utils import setup_logger


DEFAULT_START_PATH = "/highlight/tovary-iz-kitaya-935133/?from_global=true"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Parse Ozon products and store to MongoDB",
    )
    ap.add_argument(
        "--start-url",
        default=os.getenv("OZON_START_URL", DEFAULT_START_PATH),
        help="Start URL path on ozon.ru (beginning with /)",
    )
    ap.add_argument(
        "--mongo-uri",
        default=os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
        help="MongoDB connection URI",
    )
    ap.add_argument(
        "--db",
        default=os.getenv("MONGO_DB", "ozon"),
        help="MongoDB database name",
    )
    ap.add_argument(
        "--collection",
        default=os.getenv("MONGO_COLLECTION", "products"),
        help="MongoDB collection name",
    )
    ap.add_argument(
        "--metrics",
        action="store_true",
        help="Store daily metrics snapshot (reviews, rating, delivery days)",
    )
    ap.add_argument(
        "--metrics-collection",
        default=os.getenv("MONGO_METRICS_COLLECTION", "products_metrics"),
        help="MongoDB collection for daily metrics",
    )
    ap.add_argument(
        "--max-pages",
        type=int,
        default=int(os.getenv("MAX_PAGES", "0")),
        help="Optional limit of pages to parse (0 = no limit)",
    )
    ap.add_argument(
        "--timeout",
        type=float,
        default=float(os.getenv("REQUEST_TIMEOUT", "15")),
        help="HTTP request timeout seconds",
    )
    ap.add_argument(
        "--sleep-min",
        type=float,
        default=float(os.getenv("SLEEP_MIN", "1.0")),
        help="Min sleep between requests",
    )
    ap.add_argument(
        "--sleep-max",
        type=float,
        default=float(os.getenv("SLEEP_MAX", "2.5")),
        help="Max sleep between requests",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write to Mongo, just print count",
    )
    ap.add_argument(
        "--no-details",
        action="store_true",
        help="Disable per-product details fetch (card page)",
    )
    return ap.parse_args()


def main() -> None:
    log = setup_logger()
    args = parse_args()

    proxies = None
    # Respect standard proxy envs
    http_proxy = os.getenv("HTTP_PROXY") or os.getenv("http_proxy")
    https_proxy = os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")
    if http_proxy or https_proxy:
        proxies = {k: v for k, v in (('http', http_proxy), ('https', https_proxy)) if v}

    client = OzonClient(
        timeout=args.timeout,
        sleep_range=(args.sleep_min, args.sleep_max),
        proxies=proxies,
        logger=log,
    )

    max_pages: Optional[int] = args.max_pages if args.max_pages > 0 else None

    if args.dry_run:
        count = 0
        for prod in client.iter_products(args.start_url, max_pages=max_pages):
            if not args.no_details and prod.get("url_path"):
                try:
                    details = client.get_product_details(prod["url_path"])
                    prod.update(details)
                except Exception as e:
                    log.warning("Details failed", extra={"error": str(e), "url": prod.get("url_path")})
            count += 1
        log.info("Dry run: products found", extra={"count": count})
        return

    store = MongoStore(args.mongo_uri, args.db, args.collection, metrics_collection=args.metrics_collection)
    buffer = []
    metrics_buffer = []
    total_written = 0
    BATCH = 100

    for prod in client.iter_products(args.start_url, max_pages=max_pages):
        # Enrich with details unless disabled
        if not args.no_details and prod.get("url_path"):
            try:
                details = client.get_product_details(prod["url_path"])
                prod.update(details)
            except Exception as e:
                log.warning("Details failed", extra={"error": str(e), "url": prod.get("url_path")})
        buffer.append(prod)
        if args.metrics:
            metrics_buffer.append(prod)
        if len(buffer) >= BATCH:
            written = store.upsert_products(buffer)
            total_written += written
            log.info("Batch upserted", extra={"written": written, "total": total_written})
            buffer.clear()
            if args.metrics and metrics_buffer:
                mw = store.upsert_daily_metrics(metrics_buffer)
                log.info("Metrics upserted", extra={"written": mw})
                metrics_buffer.clear()

    if buffer:
        written = store.upsert_products(buffer)
        total_written += written
        log.info("Final upserted", extra={"written": written, "total": total_written})
    if args.metrics and metrics_buffer:
        mw = store.upsert_daily_metrics(metrics_buffer)
        log.info("Final metrics upserted", extra={"written": mw})


if __name__ == "__main__":
    main()
