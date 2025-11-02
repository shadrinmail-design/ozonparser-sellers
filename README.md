# Ozon Parser → MongoDB

Парсер товаров с Ozon через AppleScript + Chrome (обход антибот защиты). Данные складываются в MongoDB.

**⚠️ ВАЖНО:** Python и Puppeteer парсеры НЕ РАБОТАЮТ из-за антибот защиты Ozon (HTTP 403). Используйте AppleScript.

## ✅ Рабочее решение: AppleScript + Chrome

**Сбор ПОЛНЫХ данных товаров (ID, URL, название, цена, рейтинг, отзывы, доставка):**

```bash
cd js

# Один источник (тест)
./collect_full_data.sh "/seller/guangzhouganxinmaoyidian-3366398" 10

# Массовый сбор из 23 источников
./mass_collect_all.sh
```

**Результат:** JSON файлы в директории `results/`:
- `results/<source>_full.json` - данные по каждому источнику
- `results/<source>_log.txt` - логи сбора

**Что собирается:**
- ID товара
- URL товара
- Название
- Цена
- Рейтинг
- Количество отзывов
- Дата доставки

**Объединение всех результатов в один файл:**
```bash
python3 -c "import json, glob; print(json.dumps({'total': sum(json.load(open(f))['total'] for f in glob.glob('results/*_full.json')), 'products': [p for f in glob.glob('results/*_full.json') for p in json.load(open(f))['products']]}, ensure_ascii=False, indent=2))" > results/all_products.json
```

**Загрузка на сервер и импорт в MongoDB:**
```bash
# Загрузка результатов
scp -P 2209 results/all_products.json root@max.gogocrm.ru:/home/ozon-parser/

# На сервере
ssh -p 2209 root@max.gogocrm.ru
cd /home/ozon-parser
python3 import_to_mongo.py all_products.json
```

## Подготовка MongoDB

- URI: `mongodb://localhost:27017` (по умолчанию)
- БД: `ozon`
- Коллекция: `products`

## ❌ Устаревшие методы (НЕ РАБОТАЮТ)

### Python Parser (HTTP 403)
~~PYTHONPATH=src python -m ozon_parser~~

### Puppeteer (HTTP 403)
~~node src/index.js~~

**Причина:** Ozon блокирует автоматизацию по IP, даже со stealth plugin и куками.

## Веб-интерфейс

Простой просмотрщик собранных товаров (список и страница товара):

```
pip install -r requirements.txt
PYTHONPATH=src python -m ozon_parser.web.app
```

Откройте в браузере: http://127.0.0.1:5000

- Фильтры: поиск `q`, `brand`, `min_rating`.
- Сортировка: `updated` (по умолчанию), `rating`, `reviews`, `name`.
- Пагинация: параметры `page` и `per_page` (по умолчанию 20).
Веб-приложение берёт настройки MongoDB из тех же переменных окружения:
- `MONGODB_URI` (по умолчанию `mongodb://localhost:27017`)
- `MONGO_DB` (по умолчанию `ozon`)
- `MONGO_COLLECTION` (по умолчанию `products`)

## Поиск похожих товаров по изображению

Работает через Safari + AppleScript (единственный метод, который не блокируется Ozon):

```bash
cd js

# Массовый поиск для всех товаров
PRODUCTS_FILE=products.json node bulk_image_search.js

# Сохранение результатов в MongoDB
MONGODB_URI="mongodb://localhost:27017" node save_to_mongodb.js
```

**Подробности:** см. `js/BULK_IMAGE_SEARCH_README.md`

## Ежедневный сбор (динамика)

Запускайте массовый сбор ежедневно через cron:

```bash
# Crontab на Mac (где работает Chrome + AppleScript)
0 3 * * * cd /Users/mikhailzhirnov/claude/ozonparser/js && ./mass_collect_all.sh >> /tmp/ozon_collect.log 2>&1

# После сбора - загрузка на сервер
30 4 * * * cd /Users/mikhailzhirnov/claude/ozonparser/js && python3 upload_results.py
```

Данные автоматически обновляются в MongoDB с отметкой времени `updated_at`.
## Параметры скриптов

**collect_full_data.sh:**
- Аргумент 1: URL путь (например `/seller/...`)
- Аргумент 2: количество прокруток (по умолчанию 10)

**mass_collect_all.sh:**
- Редактируйте массив `URLS` внутри скрипта для изменения списка источников
- Переменная `SCROLLS` задает количество прокруток на страницу

## Что сохраняется

Каждый товар сохраняется в JSON формате:

```json
{
  "id": "2875927880",
  "url": "https://www.ozon.ru/product/...",
  "title": "Victorinox Мини портативный складной нож...",
  "price": "1 245 ₽",
  "rating": "4.5",
  "reviews_count": "42",
  "delivery_days": "25 ноября"
}
```

**Формат результата:**
```json
{
  "success": true,
  "total": 30,
  "products": [...]
}
```

## Как это работает

**AppleScript + Chrome:**
1. Открывает страницу в реальном Chrome браузере
2. Прокручивает страницу для загрузки всех товаров (lazy loading)
3. Для каждого товара выполняет ПРОСТЫЕ JavaScript запросы через AppleScript
4. Собирает данные по полям (ID, URL, название, цена, рейтинг, отзывы, доставка)
5. Сохраняет в JSON формате

**Преимущества:**
- ✅ Не блокируется Ozon (используется настоящий браузер)
- ✅ Не требует прокси
- ✅ Собирает все поля товара
- ✅ Простая отладка (видно в браузере)

## Примечания

- Требуется macOS с установленным Google Chrome
- Chrome должен быть открыт во время работы скрипта
- Для массового сбора рекомендуется запускать на отдельной машине/виртуалке

## Структура проекта

```
js/
  collect_full_data.sh      # Сбор полных данных (РАБОТАЕТ)
  mass_collect_all.sh       # Массовый сбор (РАБОТАЕТ)
  ozon_image_search.applescript  # Поиск по изображению (РАБОТАЕТ)
  bulk_image_search.js      # Массовый поиск похожих
  results/                  # Результаты сбора

src/ozon_parser/
  web/app.py               # Веб-интерфейс
  (остальное устарело - не работает из-за блокировки)
```
