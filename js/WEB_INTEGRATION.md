# Интеграция поиска по изображению с веб-интерфейсом

## Структура данных MongoDB

### Коллекция: `image_search_results`

```javascript
{
  _id: ObjectId("..."),
  source_product: {
    id: "7249026173",           // ID исходного товара
    title: "Массажер для глаз",
    image: "https://ir.ozone.ru/...",
    price: 1990,
    url: "https://www.ozon.ru/..."
  },
  search_result: {
    success: true,
    total_count: 25,             // Количество найденных похожих товаров
    products: [
      {
        index: 1,
        id: "1830612489",        // ID похожего товара
        title: "Массажер...",
        url: "https://www.ozon.ru/..."
      }
    ]
  },
  searched_at: ISODate("..."),
  updated_at: ISODate("...")
}
```

## Изменения в веб-интерфейсе

### 1. Обновить список товаров (главная страница)

Добавить JOIN с коллекцией `image_search_results`:

```python
# В app.py или аналогичном файле

@app.route('/ozon/')
def index():
    # Получить товары с количеством похожих
    pipeline = [
        {
            '$lookup': {
                'from': 'image_search_results',
                'localField': 'id',
                'foreignField': 'source_product.id',
                'as': 'similar_products'
            }
        },
        {
            '$addFields': {
                'similar_count': {
                    '$cond': {
                        'if': {'$gt': [{'$size': '$similar_products'}, 0]},
                        'then': {'$arrayElemAt': ['$similar_products.search_result.total_count', 0]},
                        'else': 0
                    }
                }
            }
        },
        {
            '$project': {
                'similar_products': 0  # Убрать из вывода, только счетчик
            }
        }
    ]

    products = list(db.products.aggregate(pipeline))
    return render_template('index.html', products=products)
```

### 2. HTML шаблон (index.html)

Добавить колонку "Похожие товары":

```html
<table class="table">
  <thead>
    <tr>
      <th>ID</th>
      <th>Название</th>
      <th>Цена</th>
      <th>Рейтинг</th>
      <th>Отзывы</th>
      <th>Похожие</th> <!-- НОВАЯ КОЛОНКА -->
      <th>Действия</th>
    </tr>
  </thead>
  <tbody>
    {% for product in products %}
    <tr>
      <td>{{ product.id }}</td>
      <td>{{ product.title }}</td>
      <td>{{ product.price }} ₽</td>
      <td>{{ product.rating }}</td>
      <td>{{ product.reviews_count }}</td>
      <td>
        {% if product.similar_count > 0 %}
          <span class="badge bg-success">
            {{ product.similar_count }} шт
          </span>
        {% else %}
          <span class="badge bg-secondary">—</span>
        {% endif %}
      </td>
      <td>
        <a href="/ozon/product/{{ product.id }}" class="btn btn-sm btn-primary">
          Детали
        </a>
      </td>
    </tr>
    {% endfor %}
  </tbody>
</table>
```

### 3. Страница детальной информации

Новый endpoint для страницы с деталями:

```python
@app.route('/ozon/product/<product_id>')
def product_details(product_id):
    # Получить исходный товар
    product = db.products.find_one({'id': product_id})

    if not product:
        abort(404)

    # Получить результаты поиска по изображению
    similar_result = db.image_search_results.find_one({
        'source_product.id': product_id
    })

    similar_products = []

    if similar_result and similar_result.get('search_result', {}).get('success'):
        # Для каждого похожего товара получить полную информацию
        similar_ids = [p['id'] for p in similar_result['search_result']['products']]

        # Получить полные данные из основной коллекции products
        similar_products = list(db.products.find({'id': {'$in': similar_ids}}))

        # Если товара нет в нашей базе, использовать данные из результата поиска
        found_ids = {p['id'] for p in similar_products}

        for search_product in similar_result['search_result']['products']:
            if search_product['id'] not in found_ids:
                similar_products.append({
                    'id': search_product['id'],
                    'title': search_product['title'],
                    'url': search_product['url'],
                    'from_search': True  # Маркер, что данные из поиска
                })

    return render_template('product_details.html',
                          product=product,
                          similar_products=similar_products,
                          similar_count=len(similar_products))
```

### 4. HTML шаблон детальной страницы (product_details.html)

```html
<!DOCTYPE html>
<html>
<head>
  <title>{{ product.title }} - Детали</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
  <div class="container mt-4">
    <h1>{{ product.title }}</h1>

    <div class="row">
      <div class="col-md-6">
        <h3>Основная информация</h3>
        <table class="table">
          <tr>
            <th>ID:</th>
            <td>{{ product.id }}</td>
          </tr>
          <tr>
            <th>Цена:</th>
            <td>{{ product.price }} ₽</td>
          </tr>
          <tr>
            <th>Рейтинг:</th>
            <td>{{ product.rating }} ⭐</td>
          </tr>
          <tr>
            <th>Отзывы:</th>
            <td>{{ product.reviews_count }} шт</td>
          </tr>
          <tr>
            <th>Доставка:</th>
            <td>{{ product.delivery_days }} дней</td>
          </tr>
        </table>

        <a href="{{ product.url }}" target="_blank" class="btn btn-success">
          Открыть на Ozon
        </a>
      </div>

      <div class="col-md-6">
        {% if product.images %}
          <img src="{{ product.images[0] }}" class="img-fluid" alt="{{ product.title }}">
        {% endif %}
      </div>
    </div>

    <hr>

    <h2>Похожие товары ({{ similar_count }})</h2>

    {% if similar_products %}
      <div class="table-responsive">
        <table class="table table-striped">
          <thead>
            <tr>
              <th>#</th>
              <th>ID</th>
              <th>Название</th>
              <th>Цена</th>
              <th>Рейтинг</th>
              <th>Отзывы</th>
              <th>Доставка</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {% for similar in similar_products %}
            <tr>
              <td>{{ loop.index }}</td>
              <td>{{ similar.id }}</td>
              <td>
                {{ similar.title[:80] }}...
                {% if similar.from_search %}
                  <span class="badge bg-info">Новый</span>
                {% endif %}
              </td>
              <td>
                {% if similar.price %}
                  {{ similar.price }} ₽
                {% else %}
                  <span class="text-muted">—</span>
                {% endif %}
              </td>
              <td>
                {% if similar.rating %}
                  {{ similar.rating }} ⭐
                {% else %}
                  <span class="text-muted">—</span>
                {% endif %}
              </td>
              <td>
                {% if similar.reviews_count %}
                  {{ similar.reviews_count }} шт
                {% else %}
                  <span class="text-muted">—</span>
                {% endif %}
              </td>
              <td>
                {% if similar.delivery_days %}
                  {{ similar.delivery_days }} дней
                {% else %}
                  <span class="text-muted">—</span>
                {% endif %}
              </td>
              <td>
                <a href="{{ similar.url }}" target="_blank" class="btn btn-sm btn-primary">
                  Ozon
                </a>
              </td>
            </tr>
            {% endfor %}
          </tbody>
        </table>
      </div>
    {% else %}
      <div class="alert alert-info">
        Поиск похожих товаров еще не выполнялся для этого товара.
      </div>
    {% endif %}

    <a href="/ozon/" class="btn btn-secondary">← Назад к списку</a>
  </div>
</body>
</html>
```

## API endpoints для асинхронного обновления

Для запуска поиска по изображению прямо из веб-интерфейса:

```python
@app.route('/ozon/api/search_similar/<product_id>', methods=['POST'])
def search_similar(product_id):
    """Запустить поиск похожих товаров по изображению"""

    product = db.products.find_one({'id': product_id})

    if not product:
        return jsonify({'error': 'Product not found'}), 404

    if not product.get('images'):
        return jsonify({'error': 'No images'}), 400

    # Запустить поиск в фоновом режиме (через очередь задач)
    # Или вызвать Node.js скрипт напрямую

    import subprocess
    result = subprocess.run([
        'node',
        '/path/to/bulk_image_search.js',
        '--product-id', product_id
    ], capture_output=True, text=True)

    return jsonify({'status': 'started', 'product_id': product_id})

@app.route('/ozon/api/similar_count/<product_id>')
def get_similar_count(product_id):
    """Получить количество похожих товаров"""

    result = db.image_search_results.find_one({
        'source_product.id': product_id
    })

    if result and result.get('search_result', {}).get('success'):
        count = result['search_result']['total_count']
        return jsonify({'count': count})

    return jsonify({'count': 0})
```

## Пример использования

1. Пользователь открывает https://max.gogocrm.ru/ozon/
2. Видит список товаров с колонкой "Похожие": `25 шт`, `18 шт`, `—` и т.д.
3. Кликает на кнопку "Детали" у товара
4. Открывается страница `/ozon/product/7249026173`
5. Видит:
   - Основную информацию о товаре
   - Таблицу с 25 похожими товарами
   - У каждого похожего: цена, рейтинг, отзывы, доставка
   - Кнопку "Ozon" для перехода на товар

## Развертывание на сервере

SSH команды для обновления:

```bash
# 1. Загрузить новые скрипты
scp -P 2209 bulk_image_search.js mzhirnov@vitamobile.iteloclub.com:/home/ozon-parser/js/
scp -P 2209 save_to_mongodb.js mzhirnov@vitamobile.iteloclub.com:/home/ozon-parser/js/

# 2. Обновить веб-интерфейс (app.py)
ssh -p 2209 mzhirnov@vitamobile.iteloclub.com
cd /var/www/web_sipteco3/ozon
# Внести изменения в app.py согласно примерам выше

# 3. Перезапустить веб-сервер
sudo systemctl restart gunicorn-ozon

# 4. Запустить массовый поиск
cd /home/ozon-parser/js
mongoexport --uri="mongodb://localhost:27017/ozon" \
  --collection=products \
  --query='{"images": {"$exists": true}}' \
  --out=products.json

PRODUCTS_FILE=products.json node bulk_image_search.js

# 5. Сохранить результаты в MongoDB
MONGODB_URI="mongodb://localhost:27017" node save_to_mongodb.js
```

## Оптимизация

1. **Кэширование:** Добавить Redis для кэширования счетчиков похожих товаров
2. **Фоновые задачи:** Использовать Celery для запуска поиска в фоне
3. **Пагинация:** Для товаров с большим количеством похожих
4. **Фильтры:** Добавить сортировку похожих по цене/рейтингу/отзывам
