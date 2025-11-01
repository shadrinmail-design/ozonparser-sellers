# Ozon Parser → MongoDB

Парсер товаров по категории «Товары из Китая» (и любая другая страница каталога/подборки на Ozon, совместимая с composer API). Данные складываются в MongoDB.

По умолчанию стартовый путь:

```
/highlight/tovary-iz-kitaya-935133/?from_global=true
```

## Установка

1) Python 3.10+
2) Установите зависимости:

```
pip install -r requirements.txt
```

## Подготовка MongoDB

- URI: `mongodb://localhost:27017` (по умолчанию)
- БД: `ozon`
- Коллекция: `products`

Можно переопределить через переменные окружения или флаги CLI.

## Запуск

Самый простой запуск (сохранение сразу в MongoDB, с деталями товара — рейтинг, отзывы, доставка и др.):

```
PYTHONPATH=src python -m ozon_parser --mongo-uri "mongodb://localhost:27017" --db ozon --collection products
```

Сухой прогон (без записи в базу) и ограничение по страницам:

```
PYTHONPATH=src python -m ozon_parser --dry-run --max-pages 2
```

С произвольным стартовым URL-путём (должен начинаться с `/`):

```
PYTHONPATH=src python -m ozon_parser \
  --start-url "/highlight/tovary-iz-kitaya-935133/?from_global=true" \
  --max-pages 10
```

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

## Puppeteer-скрапер (антидетект)

Вариант на Node.js с Puppeteer + stealth плагином, прокруткой и сбором товаров/деталей через перехват composer API.

1) Установка:

```
cd js
npm install
```

2) Запуск (пример — 60 прокруток, детали включены, метрики включены):

```
OZON_START_URL="/highlight/tovary-iz-kitaya-935133/?from_global=true" \
MAX_SCROLLS=60 \
DETAILS_CONCURRENCY=2 \
METRICS=1 \
MONGODB_URI="mongodb://localhost:27017" MONGO_DB=ozon MONGO_COLLECTION=products \
node src/index.js
```

3) Прокси и куки (опционально):

- Прокси: `HTTPS_PROXY=http://user:pass@host:port`
- Куки: `OZON_COOKIES` (строка заголовка Cookie). Скрипт сам установит куки на домен `.ozon.ru`.

4) Защита от детекта:

- Используется `puppeteer-extra-plugin-stealth`, рандомный десктопный User-Agent, таймзона `Europe/Moscow`, заголовок `accept-language: ru-RU`.
- Запуск без фокуса на headless-признаках, включён набор аргументов Chrome для снижения детекта.
- Перехватывается только composer JSON, лишние запросы игнорируются, задержки и прокрутка рандомизированы.

## Ежедневный сбор (динамика)

Чтобы собирать динамику (снимки по дням: отзывы, рейтинг, сроки доставки), используйте режим метрик:

```
PYTHONPATH=src python -m ozon_parser \
  --metrics \
  --metrics-collection products_metrics \
  --mongo-uri "mongodb://localhost:27017" --db ozon --collection products
```

Рекомендуемый крон (каждый день в 03:15):

```
15 3 * * * cd /home/ozon-parser && /usr/bin/python3 -m venv .venv && . .venv/bin/activate && pip -q install -r requirements.txt && OZON_START_URL="/highlight/tovary-iz-kitaya-935133/?from_global=true" PYTHONPATH=src python -m ozon_parser --metrics --mongo-uri "mongodb://localhost:27017" --db ozon --collection products >> cron.log 2>&1
```

В коллекцию `products_metrics` сохраняются документы по ключу `_id = <YYYY-MM-DD>:<ozon_id>` с полями: `reviews_count`, `rating_value`, `delivery_min_date`, `delivery_days`, `price_text` и др. Основная коллекция `products` обновляется актуальными данными.
## Параметры и окружение

- `--start-url` или `OZON_START_URL` — путь на ozon.ru (пример: `/search/?from_global=true&text=ssd`).
- `--mongo-uri` или `MONGODB_URI` — строка подключения к MongoDB.
- `--db` или `MONGO_DB` — имя базы.
- `--collection` или `MONGO_COLLECTION` — имя коллекции.
- `--max-pages` или `MAX_PAGES` — ограничение количества страниц (0 = без ограничений).
- Детали карточки товара: по умолчанию включены; отключить можно флагом `--no-details`.
- `--timeout` или `REQUEST_TIMEOUT` — таймаут HTTP, сек.
- `--sleep-min` / `--sleep-max` или `SLEEP_MIN` / `SLEEP_MAX` — рандомная пауза между запросами.
- Прокси берутся из `HTTP_PROXY`/`HTTPS_PROXY` при наличии.

## Что сохраняется

Каждый товар сохраняется как документ вида:

```
{
  _id: <ozon_id | url>,
  ozon_id: <int | str>,
  name: <str | null>,
  url_path: <str | null>,
  url: <str | null>,
  price_text: <str | null>,
  rating_value: <float | null>,
  reviews_count: <int | null>,
  delivery_texts: <[str]>,
  delivery_min_date: <YYYY-MM-DD | null>,
  images: <[str]>,
  brand: <str | null>,
  seller_id: <int | str | null>,
  seller_name: <str | null>,
  seller_rating: <float | null>,
  characteristics: <[{name, value}]>,
  updated_at: <datetime>
}
```

- Индексы создаются на `ozon_id` (unique, sparse) и `url`.
- Если `ozon_id` не удалось извлечь, ключом `_id` становится `url`/`url_path`.

## Как это работает

- Скрипт не рендерит JavaScript. Он обращается к публичному composer API Ozon:
  `GET https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=<PATH>`
- Парсер ищет нужные виджеты (`searchResults*/catalog*`), извлекает элементы и пагинацию (`nextPage.url`).
- Для каждого элемента берёт `ozon_id` (из трекинга/sku/id), название, ссылку, цену (текстом).

## Примечания

- Ozon может менять структуру виджетов и применять антибот меры. Если получите 403/429 — попробуйте прокси и увеличьте паузы.
- Для обогащения полей (бренд, рейтинг и т.п.) можно дополнить загрузку карточек товара — напишите, добавлю.

## Структура

```
src/ozon_parser/
  client.py   # HTTP клиент + пагинация
  storage.py  # Запись в MongoDB (bulk upsert)
  main.py     # CLI-обвязка
  utils.py    # Логер, заголовки, UA
```
