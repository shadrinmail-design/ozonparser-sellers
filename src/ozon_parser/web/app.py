import os
from typing import Any, Dict, Optional, Tuple

from flask import Flask, abort, render_template, request, url_for, redirect
from werkzeug.middleware.proxy_fix import ProxyFix
from pymongo import MongoClient, ASCENDING, DESCENDING


def _mongo_params() -> Tuple[str, str, str]:
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    db = os.getenv("MONGO_DB", "ozon")
    col = os.getenv("MONGO_COLLECTION", "products")
    return uri, db, col


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    # Respect reverse proxy headers including X-Forwarded-Prefix for subpath hosting (/ozon)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
    # Initialize single Mongo client/collection per app instance
    uri, db_name, col_name = _mongo_params()
    _client = MongoClient(uri)
    _col = _client[db_name][col_name]

    @app.get("/")
    def index():
        col = _col

        # Query params
        q = (request.args.get("q") or "").strip()
        brand = (request.args.get("brand") or "").strip()
        min_rating = request.args.get("min_rating")
        sort = request.args.get("sort") or "updated"
        try:
            page = max(1, int(request.args.get("page", "1")))
        except Exception:
            page = 1
        try:
            per_page = int(request.args.get("per_page", "20"))
        except Exception:
            per_page = 20
        per_page = max(1, min(100, per_page))

        filters: Dict[str, Any] = {}
        ands = []
        if q:
            ands.append({
                "$or": [
                    {"name": {"$regex": q, "$options": "i"}},
                    {"brand": {"$regex": q, "$options": "i"}},
                    {"seller_name": {"$regex": q, "$options": "i"}},
                ]
            })
        if brand:
            ands.append({"brand": {"$regex": f"^{brand}$", "$options": "i"}})
        if min_rating:
            try:
                ands.append({"rating_value": {"$gte": float(min_rating)}})
            except Exception:
                pass
        if ands:
            filters = {"$and": ands}

        # Sorting
        if sort == "rating":
            order = [("rating_value", DESCENDING), ("reviews_count", DESCENDING)]
        elif sort == "reviews":
            order = [("reviews_count", DESCENDING)]
        elif sort == "name":
            order = [("name", ASCENDING)]
        else:  # updated
            order = [("updated_at", DESCENDING)]

        error = None
        items = []
        total = 0
        pages = 0
        try:
            total = col.count_documents(filters)
            pages = (total + per_page - 1) // per_page
            skip = (page - 1) * per_page

            proj = {
                "name": 1,
                "brand": 1,
                "price_text": 1,
                "rating_value": 1,
                "reviews_count": 1,
                "images": 1,
                "url": 1,
            }
            cursor = (
                col.find(filters, proj)
                .sort(order)
                .skip(max(0, skip))
                .limit(per_page)
            )
            items = list(cursor)
            for it in items:
                imgs = it.get("images") or []
                it["thumb"] = imgs[0] if imgs else None
        except Exception as e:
            error = str(e)

        return render_template(
            "index.html",
            items=items,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            q=q,
            brand=brand,
            min_rating=min_rating or "",
            sort=sort,
            error=error,
        )

    @app.get("/product/<path:doc_id>")
    def product(doc_id: str):
        col = _col
        doc = None
        # Try by _id (int)
        try:
            as_int = int(doc_id)
            doc = col.find_one({"_id": as_int})
            if not doc:
                doc = col.find_one({"ozon_id": as_int})
        except Exception:
            pass
        if not doc:
            # Try by _id as string (may contain /)
            doc = col.find_one({"_id": doc_id})
        if not doc:
            abort(404)

        return render_template("product.html", p=doc)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


if __name__ == "__main__":
    # Allow running with: PYTHONPATH=src python -m ozon_parser.web.app
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
