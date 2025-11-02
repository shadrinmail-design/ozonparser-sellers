
---

## 🔄 Обновление данных о доставке в похожих товарах (2025-11-02)

### Проблема
В MongoDB хранятся старые данные поиска по изображениям без информации о доставке (собраны ~03:00 UTC). Повторное тестирование показало, что скрипт `ozon_image_search_full.applescript` **корректно собирает 100% данных о доставке**.

### Решение: Перезапуск bulk_image_search.js

**1. Подготовка файла товаров для поиска:**
```bash
cd /Users/mikhailzhirnov/claude/ozonparser/js

# Получить список товаров с сервера
scp -P 2209 root@max.gogocrm.ru:/home/ozon-parser/products_for_image_search.json .

# Или создать из MongoDB
ssh -p 2209 root@max.gogocrm.ru "cd /home/ozon-parser && python3 -c \"
from pymongo import MongoClient
import json
client = MongoClient('mongodb://localhost:27017/')
db = client['ozon']
products = list(db.products.find({}, {'ozon_id': 1, 'name': 1, 'images': 1, 'price_text': 1, 'url': 1}).limit(100))
result = []
for p in products:
    if p.get('images'):
        result.append({
            'id': str(p.get('ozon_id')),
            'title': p.get('name', 'Без названия'),
            'image': p['images'][0],
            'price': p.get('price_text', ''),
            'url': p.get('url', '')
        })
with open('products_for_image_search.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f'Saved {len(result)} products')
\"" > /dev/null && scp -P 2209 root@max.gogocrm.ru:/home/ozon-parser/products_for_image_search.json .
```

**2. Запуск bulk search (локально на Mac):**
```bash
cd /Users/mikhailzhirnov/claude/ozonparser/js

# Полный перезапуск (займет ~2-4 часа для 74 товаров)
PRODUCTS_FILE=products_for_image_search.json node bulk_image_search.js

# Или с ограничением для теста
PRODUCTS_FILE=products_for_image_search.json LIMIT=5 node bulk_image_search.js
```

**3. Проверка результатов:**
```bash
cat image_search_results.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
total = sum(len(r.get('search_result', {}).get('products', [])) for r in data['results'])
with_del = sum(1 for r in data['results'] for p in r.get('search_result', {}).get('products', []) if p.get('delivery_days') and p.get('delivery_days').strip())

print(f'Товаров найдено: {total}')
print(f'С доставкой: {with_del} ({with_del/total*100:.1f}%)')
"
```

**4. Загрузка на сервер:**
```bash
scp -P 2209 image_search_results.json root@max.gogocrm.ru:/home/ozon-parser/
```

**5. Импорт в MongoDB:**
```bash
ssh -p 2209 root@max.gogocrm.ru "cd /home/ozon-parser && python3 import_image_search.py image_search_results.json"
```

**6. Перезапуск Gunicorn (для применения изменений):**
```bash
ssh -p 2209 root@max.gogocrm.ru "kill -9 \$(ps aux | grep gunicorn | grep ozon | grep -v grep | awk '{print \$2}') && cd /home/ozon-parser && PYTHONPATH=/home/ozon-parser/src python3 -m gunicorn -w 2 -b 127.0.0.1:5007 --pythonpath /home/ozon-parser/src ozon_parser.web.wsgi:app --daemon"
```

**Ожидаемый результат:** 100% похожих товаров будут иметь данные о доставке на странице `/similar/<id>`.


---

## 🖼️ Проблема с изображениями товаров (2025-11-02 08:30 МСК)

### Симптомы
- 0% товаров в MongoDB имеют изображения
- Поле `images` пустое для всех 593 товаров
- Поиск похожих товаров невозможен без изображений

### Причины
1. **Скрипт `collect_full_data.sh`** был обновлен для сбора изображений в 06:09
2. **Массовый сбор `mass_collect_all.sh`** был выполнен в 05:15 (ДО обновления)
3. **Скрипт `import_products.py`** сохранял изображения в поле `picture` вместо `images[]`

### Решение
✅ **Исправлено:**
1. `import_products.py` - изменено `'picture'` → `'images': [image] if image else []`
2. Скрипт загружен на сервер

❌ **Требуется:**
1. Перезапустить `./mass_collect_all.sh` для сбора изображений
2. Загрузить обновленный `all_products.json` на сервер
3. Реимпортировать: `python3 import_products.py all_products.json`

### Проверка работы скрипта
```bash
# Тест показывает, что скрипт РАБОТАЕТ
osascript << 'APPLESCRIPT'
tell application "Google Chrome"
    set URL of active tab of window 1 to "https://www.ozon.ru/seller/guangzhouganxinmaoyidian-3366398"
    delay 5
    execute active tab of window 1 javascript "
        var img = document.querySelector('[data-index=\"0\"] img');
        img ? img.src : 'NO_IMG';
    "
end tell
APPLESCRIPT
# Результат: https://ir.ozone.ru/s3/multimedia-1-k/wc300/7484223548.jpg ✅
```

### Временное решение
Пока не перезапущен массовый сбор, поиск похожих товаров недоступен для большинства товаров.

