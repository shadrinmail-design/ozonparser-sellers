#!/usr/bin/env python3
"""
Import products from all_products.json to MongoDB
"""
import json
import sys
from pymongo import MongoClient, UpdateOne
from datetime import datetime
import re

def extract_name_from_url(url):
    """Extract product name from Ozon URL"""
    if not url:
        return ''

    try:
        # URL format: /product/product-name-with-dashes-123456789/
        match = re.search(r'/product/([^/]+)-\d+/', url)
        if match:
            name_slug = match.group(1)
            # Replace dashes with spaces and capitalize
            name = name_slug.replace('-', ' ').title()
            return name
    except:
        pass

    return ''

def parse_delivery_days(delivery_text):
    """Parse delivery text to extract number of days"""
    if not delivery_text:
        return None

    text = delivery_text.lower()

    # "Завтра" or "завтра" = 1 day
    if 'завтра' in text:
        return 1

    # "Сегодня" = 0 days
    if 'сегодня' in text:
        return 0

    # Try to extract date and calculate days from now
    months = {
        'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4,
        'май': 5, 'июн': 6, 'июл': 7, 'авг': 8,
        'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12
    }

    for month_name, month_num in months.items():
        if month_name in text:
            # Extract day number
            day_match = re.search(r'(\d+)', text)
            if day_match:
                day = int(day_match.group(1))
                now = datetime.utcnow()
                # Simple estimation (not accounting for year change properly)
                if month_num >= now.month:
                    days_diff = (month_num - now.month) * 30 + (day - now.day)
                else:
                    # Next year
                    days_diff = (12 - now.month + month_num) * 30 + (day - now.day)
                return max(0, days_diff)

    return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_products.py <json_file>")
        sys.exit(1)

    json_file = sys.argv[1]

    # MongoDB connection
    mongo_uri = "mongodb://localhost:27017/"
    db_name = "ozon"
    collection_name = "products"

    print(f"📦 Загрузка данных из {json_file}...")
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    products = data.get('products', [])
    print(f"✅ Загружено {len(products)} товаров")

    print(f"\n🔌 Подключение к MongoDB: {mongo_uri}")
    client = MongoClient(mongo_uri)
    db = client[db_name]
    collection = db[collection_name]

    print(f"💾 Импорт в коллекцию '{collection_name}'...")

    # Prepare bulk upsert operations
    operations = []
    for product in products:
        # Map fields to match web app expectations
        delivery_text = product.get('delivery_days', '')
        product_url = product.get('url', '')

        # Get name from title, if empty try to extract from URL
        product_name = product.get('title', '')
        if not product_name or len(product_name.strip()) == 0:
            product_name = extract_name_from_url(product_url)

        mapped_product = {
            'id': product.get('id'),
            'ozon_id': product.get('id'),  # Alias
            'name': product_name,  # title -> name, with fallback to URL
            'url': product_url,
            'price_text': product.get('price', ''),  # Keep original price text
            'rating_value': float(product.get('rating', 0)) if product.get('rating') else None,
            'reviews_count': int(product.get('reviews_count', 0)) if product.get('reviews_count') else 0,
            'delivery_text': delivery_text,
            'delivery_days': parse_delivery_days(delivery_text),  # Parse to days (int)
            'picture': product.get('image', ''),  # Add image
            'updated_at': datetime.utcnow(),
        }

        # Keep created_at if exists, otherwise set to now
        if 'created_at' not in product:
            mapped_product['created_at'] = datetime.utcnow()

        # Only upsert if we have a valid ID
        if mapped_product['id']:
            operations.append(
                UpdateOne(
                    {'id': mapped_product['id']},
                    {'$set': mapped_product},
                    upsert=True
                )
            )

    # Execute bulk write
    if operations:
        result = collection.bulk_write(operations)
        print(f"\n✅ Импорт завершен!")
        print(f"   Вставлено новых: {result.upserted_count}")
        print(f"   Обновлено: {result.modified_count}")
        print(f"   Всего в коллекции: {collection.count_documents({})}")
    else:
        print("⚠️  Нет данных для импорта")

    client.close()

if __name__ == '__main__':
    main()
