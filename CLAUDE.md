# Контекст для агента (Claude)

Цель: собрать все товары с бесконечной догрузкой на странице Ozon «Товары из Китая», сохранять полные данные (включая отзывы/рейтинг/доставку), вести ежедневную динамику и показывать результат на странице `max.gogocrm.ru/ozon` с сортировкой по количеству отзывов.

Сделано:
- Python‑парсер (composer API) с пагинацией, деталями карточки и режимом метрик (`src/ozon_parser/`).
- MongoDB‑хранилище с индексами; ежедневные метрики в отдельной коллекции.
- Веб‑интерфейс (Flask) с фильтрами и сортировкой, health, проксирование через Nginx на `/ozon`.
- Puppeteer‑скрапер (антидетект) с `puppeteer-extra-plugin-stealth`, поддержкой SOCKS/HTTPS прокси и кук, fallback‑DOM.
- Сборщик кук Playwright и чтение кук из файла/переменных.

Текущее состояние/проблемы:
- Ozon отвечает 403/пустыми данными без «живых» кук/резидентного прокси. Добавлена поддержка: `OZON_COOKIES`, `ALL_PROXY`/`SOCKS_PROXY`.
- Nginx настроен: `/ozon/` → gunicorn 127.0.0.1:5007; страница `/ozon/health` доступна.
- **БЛОКИРОВКА OZON:** Текущий IP сервера (157.180.78.70) заблокирован Ozon ("Доступ ограничен").
- Проверенные прокси также заблокированы или не работают:
  - 89.208.145.18 (SSH SOCKS) - заблокирован Ozon (инцидент: fab_chlg_20251031192015_01K8XVD7NCTZ1Y1Q1K7ST3M0TM)
  - 95.181.175.97:40628 (HTTP Лондон, Hutchison UK) - заблокирован (детектирован IP 92.40.176.181)
  - 10 бесплатных прокси из списка - все мертвые (ERR_TUNNEL_CONNECTION_FAILED или timeout)
- Puppeteer-скрапер настроен, работает с stealth plugin, но не может обойти IP-блокировку.
- Блокировка происходит на уровне IP, до проверки браузерных fingerprints (подтверждено тестами curl и Puppeteer).

Как запускать (быстро):
- Python dry‑run: `PYTHONPATH=src python -m ozon_parser --dry-run --max-pages 2`
- Python с записью и метриками: `PYTHONPATH=src python -m ozon_parser --metrics --mongo-uri ...`
- Puppeteer dry‑run (3 прокрутки): `cd js && OZON_START_URL="/highlight/tovary-iz-kitaya-935133/?from_global=true" MAX_SCROLLS=3 DRY_RUN=1 node src/index.js`
- Прокси: `ALL_PROXY=socks5://127.0.0.1:1080` (или `HTTPS_PROXY=...`)
- Куки: `OZON_COOKIES='k=v; ...'`

Важные переменные окружения:
- Общие: `OZON_START_URL` (страница листинга).
- Mongo: `MONGODB_URI`, `MONGO_DB`, `MONGO_COLLECTION`, `MONGO_METRICS_COLLECTION`.
- Прокси: `ALL_PROXY`/`SOCKS_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY`.
- Куки: `OZON_COOKIES` или `OZON_COOKIES_FILE`.

История разработки:
**2025-11-01: Массовое тестирование прокси**
- Создан скрипт массового тестирования прокси (`test_all_proxies.js`):
  - Протестировано 1989 прокси из файла `proxy.js`
  - Найдено 78 рабочих прокси (3.92%)
  - Самый быстрый: 173.249.48.227:3128 (367ms)
  - Результаты сохранены в `proxy_test_results.json` и `working_proxies.json`

- Создан скрипт проверки через Puppeteer (`js/test_ozon_puppeteer.js`):
  - Проверка рабочих прокси на доступность Ozon с браузером
  - Использование puppeteer-extra-plugin-stealth для обхода детекта
  - Результат: ни один бесплатный прокси не прошел проверку на Ozon
  - Причины: ERR_CERT_AUTHORITY_INVALID, ERR_TUNNEL_CONNECTION_FAILED, блокировка IP

- Вывод: бесплатные публичные прокси НЕ подходят для парсинга Ozon
  - Блокируются на уровне IP
  - Проблемы с SSL сертификатами
  - Большинство находятся за пределами России

Приоритетные следующие шаги:
1) **КРИТИЧНО:** Получить резидентный российский прокси (не заблокированный Ozon). Без этого парсинг невозможен.
   - Варианты: Brightdata residential, Oxylabs residential, Smartproxy residential
   - Необходимо: IP из России, HTTP/HTTPS или SOCKS5 прокси
   - Альтернатива: Mobile прокси с российскими IP
2) После получения рабочего прокси: прогон Puppeteer с `SOCKS_PROXY` или `HTTPS_PROXY`
3) Полная прогонка по всем страницам (MAX_SCROLLS увеличить), запись в Mongo, включить `METRICS`.
4) Проверить веб на `max.gogocrm.ru/ozon/?sort=reviews` (сортировка по количеству отзывов).
5) (Опционально) добавить выгрузку текстов отзывов и сортировку/фильтры по доставке.

**Готовые команды для запуска после получения рабочего прокси:**
```bash
# С SOCKS прокси
cd /home/ozon-parser/js
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome SOCKS_PROXY=socks5://your-proxy:port OZON_COOKIES="$(cat /home/ozon-parser/ozon_cookies_converted.txt)" MAX_SCROLLS=50 node src/index.js

# Или с HTTP прокси
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome HTTPS_PROXY=http://your-proxy:port OZON_COOKIES="$(cat /home/ozon-parser/ozon_cookies_converted.txt)" MAX_SCROLLS=50 node src/index.js
```

