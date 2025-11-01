# О проекте и инструкции для агентов

Этот репозиторий содержит парсер Ozon и веб‑интерфейс для просмотра собранных товаров. Есть два варианта парсинга: Python (Composer API) и Node.js (Puppeteer c антидетектом). Данные сохраняются в MongoDB. Есть режим ежедневных метрик.

## Что уже сделано

- Python парсер (`src/ozon_parser/`):
  - Кроулер листингов через composer API с пагинацией (итерация по `next/nextPage/loadMore`).
  - Сбор базовых полей товара с плиток: `ozon_id`, `name`, `url`, `price_text`, `rating_value`, `reviews_count`.
  - Детализация карточки: рейтинг, количество отзывов, доставка (`delivery_texts`, `delivery_min_date`, `delivery_days`), бренд, продавец, характеристики, изображения.
  - Сохранение в MongoDB (bulk upsert) + индексы по `ozon_id`, `url`, `reviews_count`, `rating_value`.
  - Режим метрик (ежедневные снимки) в отдельной коллекции.
  - Сбор кук Playwright для composer API (опционально) и чтение кук из `OZON_COOKIES`/`OZON_COOKIES_FILE`.
- Веб‑интерфейс (Flask):
  - Список с фильтрами и сортировкой, страница товара, health‑маршрут.
  - Сортировка по отзывам (`sort=reviews`), по рейтингу, по имени и по времени обновления.
  - Поддержка префикса `/ozon` за счёт `ProxyFix` и заголовка `X-Forwarded-Prefix`.
  - Nginx настроен на проксирование `/ozon/` → `127.0.0.1:5007` (gunicorn).
- Puppeteer скрапер (`js/`):
  - `puppeteer-extra + stealth`, рандомный UA, ru‑RU, таймзона, прокрутка, перехват composer‑ответов.
  - Поддержка прокси: `ALL_PROXY`/`SOCKS_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY` (SOCKS прокидывается напрямую в Chromium).
  - Установка кук из `OZON_COOKIES` внутрь браузера.
  - Сохранение в MongoDB и метрики (как опция). Есть `DRY_RUN`/`NO_DB`.
- Деплой:
  - Пример systemd + gunicorn + nginx в `DEPLOY.md`.
  - Маршрут `/ozon/health` для проверки.

## Текущая задача

Парсить ВСЕ товары со страницы подборки «Товары из Китая» и подобных страниц с догрузкой при скролле:

- Стартовая страница: `/highlight/tovary-iz-kitaya-935133/?from_global=true`
- Скроллить/пагинировать до конца; собрать все карточки.
- Сохранять: количество отзывов, рейтинг, дату минимальной доставки и число дней доставки; другие видимые поля.
- Запускать ежедневно (метрики по дням).
- Веб‑страница на `max.gogocrm.ru/ozon` с сортировкой по количеству отзывов.
- Использовать SSH SOCKS‑прокси при необходимости и защититься от детекта.

## Запуск (Python парсер)

- Установка: `pip install -r requirements.txt`
- Быстрый запуск (без записи):
  - `PYTHONPATH=src python -m ozon_parser --dry-run --max-pages 2`
- Полный запуск с записью и метриками:
  - `PYTHONPATH=src python -m ozon_parser --metrics --mongo-uri "mongodb://localhost:27017" --db ozon --collection products`
- Полезные env:
  - `OZON_START_URL`, `MONGODB_URI`, `MONGO_DB`, `MONGO_COLLECTION`, `MAX_PAGES`
  - `OZON_COOKIES` или `OZON_COOKIES_FILE`
  - `ALL_PROXY`/`SOCKS_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY`

## Запуск (Puppeteer скрапер)

- Установка: `cd js && npm install`
- Быстрый dry‑run (без записи):
  - `OZON_START_URL="/highlight/tovary-iz-kitaya-935133/?from_global=true" MAX_SCROLLS=3 DRY_RUN=1 node src/index.js`
- С записью в Mongo и деталями:
  - `OZON_START_URL=... MAX_SCROLLS=60 DETAILS_CONCURRENCY=2 MONGODB_URI=... node src/index.js`
- Прокси/куки:
  - `ALL_PROXY=socks5://127.0.0.1:1080` (или `SOCKS_PROXY`, `HTTPS_PROXY`)
  - `OZON_COOKIES='k=v; ...'`

## Веб‑интерфейс

- Запуск локально: `PYTHONPATH=src python -m ozon_parser.web.app`
- Доступ: `/ozon` (за nginx), здоровье: `/ozon/health`.

## Известные ограничения и заметки

- Composer API Ozon может отдавать 403/429 без «живых» кук/прокси; нужен резидентный прокси либо реальные куки из браузера.
- Headless может детектироваться: включён stealth, но при необходимости усиливать: профили браузера, «человеческие» действия, ротация прокси.
- Для корректной доставки важно зафиксировать регион/локацию, если страница зависит от гео.

## Следующие шаги (рекомендованные)

- Подключить стабильный SOCKS/HTTPS резидентный прокси для Puppeteer; проверить сбор 2–3 страниц и затем весь список.
- Зафиксировать регион (через куки/локальное хранилище/параметры) для стабильных дат доставки.
- (Опционально) выгрузка полных отзывов (тексты) отдельным модулем.
- Расширить веб: сортировка по `delivery_days`, графики динамики, экспорт CSV.

