from flask import jsonify, request, Blueprint
from pymongo.collection import Collection
from typing import Any, Dict, List
from bson import ObjectId
from datetime import datetime

api_bp = Blueprint('api', __name__, url_prefix='/api')

def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert MongoDB document to JSON-serializable dict"""
    if not doc:
        return {}
    
    # Convert ObjectId to string
    if '_id' in doc:
        doc['_id'] = str(doc['_id'])
    
    # Convert datetime to ISO string
    for key, val in doc.items():
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
        elif isinstance(val, ObjectId):
            doc[key] = str(val)
    
    return doc

def get_collection() -> Collection:
    """Get MongoDB collection from current app"""
    from flask import current_app
    return current_app.config['MONGO_COLLECTION']

@api_bp.route('/products', methods=['GET'])
def api_products():
    """Get list of products with filtering and pagination"""
    col = get_collection()
    
    # Query params
    q = request.args.get('q', '').strip()
    brand = request.args.get('brand', '').strip()
    min_rating = request.args.get('min_rating')
    sort = request.args.get('sort', 'updated')
    
    try:
        page = max(1, int(request.args.get('page', '1')))
    except:
        page = 1
    
    try:
        per_page = int(request.args.get('per_page', '20'))
    except:
        per_page = 20
    
    per_page = max(1, min(100, per_page))
    
    # Build filters
    filters = {}
    ands = []
    
    if q:
        ands.append({
            '$or': [
                {'name': {'$regex': q, '$options': 'i'}},
                {'brand': {'$regex': q, '$options': 'i'}},
                {'seller_name': {'$regex': q, '$options': 'i'}},
            ]
        })
    
    if brand:
        ands.append({'brand': {'$regex': f'^{brand}$', '$options': 'i'}})
    
    if min_rating:
        try:
            ands.append({'rating_value': {'$gte': float(min_rating)}})
        except:
            pass
    
    if ands:
        filters = {'$and': ands}
    
    # Sorting
    from pymongo import ASCENDING, DESCENDING
    if sort == 'rating':
        order = [('rating_value', DESCENDING), ('reviews_count', DESCENDING)]
    elif sort == 'reviews':
        order = [('reviews_count', DESCENDING)]
    elif sort == 'name':
        order = [('name', ASCENDING)]
    else:  # updated
        order = [('updated_at', DESCENDING)]
    
    try:
        total = col.count_documents(filters)
        pages = (total + per_page - 1) // per_page
        skip = (page - 1) * per_page
        
        cursor = col.find(filters).sort(order).skip(max(0, skip)).limit(per_page)
        items = [serialize_doc(doc) for doc in cursor]
        
        return jsonify({
            'success': True,
            'data': items,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': pages
            },
            'filters': {
                'q': q,
                'brand': brand,
                'min_rating': min_rating,
                'sort': sort
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/products/<product_id>', methods=['GET'])
def api_product_detail(product_id):
    """Get single product by ID"""
    col = get_collection()
    
    doc = None
    
    # Try by _id (int)
    try:
        as_int = int(product_id)
        doc = col.find_one({'$or': [{'_id': as_int}, {'ozon_id': as_int}]})
    except:
        pass
    
    # Try by _id as string
    if not doc:
        doc = col.find_one({'_id': product_id})
    
    if not doc:
        return jsonify({
            'success': False,
            'error': 'Product not found'
        }), 404
    
    return jsonify({
        'success': True,
        'data': serialize_doc(doc)
    })

@api_bp.route('/stats', methods=['GET'])
def api_stats():
    """Get database statistics"""
    col = get_collection()
    
    try:
        total = col.count_documents({})
        
        # Aggregation for stats
        pipeline = [
            {
                '$group': {
                    '_id': None,
                    'avg_rating': {'$avg': '$rating_value'},
                    'total_reviews': {'$sum': '$reviews_count'},
                    'unique_brands': {'$addToSet': '$brand'}
                }
            }
        ]
        
        agg_result = list(col.aggregate(pipeline))
        stats = agg_result[0] if agg_result else {}
        
        # Top brands
        brand_pipeline = [
            {'$match': {'brand': {'$exists': True, '$ne': None}}},
            {'$group': {'_id': '$brand', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10}
        ]
        
        top_brands = [
            {'brand': b['_id'], 'count': b['count']}
            for b in col.aggregate(brand_pipeline)
        ]
        
        return jsonify({
            'success': True,
            'data': {
                'total_products': total,
                'avg_rating': round(stats.get('avg_rating', 0), 2),
                'total_reviews': stats.get('total_reviews', 0),
                'unique_brands': len(stats.get('unique_brands', [])),
                'top_brands': top_brands
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@api_bp.route('/health', methods=['GET'])
def api_health():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat()
    })
