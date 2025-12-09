#!/bin/bash

# Ступень 4: Поиск конкурентов с быстрой доставкой
# Ищет товары по названию и находит конкурентов с доставкой <10 дней

INPUT_EXCEL="${1:-results/products_check_results.xlsx}"  
OUTPUT_EXCEL="${2:-results/products_with_competitors.xlsx}"
MAX_PRODUCTS="${3:-10}"  # Для теста

echo "=== Ступень 4: Поиск конкурентов ==="
echo "Входной файл: $INPUT_EXCEL"
echo "Выходной файл: $OUTPUT_EXCEL"
echo "Макс товаров: $MAX_PRODUCTS"
echo ""

# Функция случайной задержки
random_sleep() {
    local min=${1:-1}
    local max=${2:-3}
    local delay=$(( (RANDOM % (max - min + 1)) + min ))
    sleep $delay
}

# Функция проверки быстрой доставки
is_fast_delivery() {
    local text="$1"
    # Проверяем ключевые слова
    if [[ "$text" =~ [Сс]егодня|[Зз]автра|[Пп]ослезавтра|через ]]; then
        echo "yes"
        return 0
    fi
    echo "no"
    return 1
}

# Экспортируем переменные
export INPUT_EXCEL OUTPUT_EXCEL MAX_PRODUCTS

# Python: Читаем товары и создаем новый Excel
python3 - <<'PYTHON_INIT'
import sys
import os
import subprocess

try:
    import openpyxl
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment
except ImportError:
    print("Устанавливаю openpyxl...")
    subprocess.run([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment

INPUT_EXCEL = os.environ['INPUT_EXCEL']
OUTPUT_EXCEL = os.environ['OUTPUT_EXCEL']
MAX_PRODUCTS = int(os.environ['MAX_PRODUCTS'])

# Читаем входной Excel
if not os.path.exists(INPUT_EXCEL):
    print(f"Ошибка: не найден {INPUT_EXCEL}")
    sys.exit(1)

wb_input = load_workbook(INPUT_EXCEL)
ws_input = wb_input.active

# Собираем товары со статусом "интересный"
products = []
for row in range(2, ws_input.max_row + 1):
    status = ws_input.cell(row, 7).value  # Столбец "Статус"
    if status == "интересный":
        product = {
            'shop_url': ws_input.cell(row, 1).value,
            'url': ws_input.cell(row, 2).value,
            'title': ws_input.cell(row, 3).value,
            'price': ws_input.cell(row, 4).value,
            'reviews': ws_input.cell(row, 5).value,
            'delivery': ws_input.cell(row, 6).value,
        }
        products.append(product)

print(f"Найдено интересных товаров: {len(products)}")

# Ограничиваем для теста
if MAX_PRODUCTS > 0:
    products = products[:MAX_PRODUCTS]
    print(f"Ограничено для теста: {len(products)}")

# Создаем новый Excel
os.makedirs(os.path.dirname(OUTPUT_EXCEL), exist_ok=True)
wb = Workbook()
ws = wb.active
ws.title = "Товары с конкурентами"

# Заголовки
headers = [
    "URL магазина", "URL товара", "Название", "Цена (руб)", 
    "Отзывов", "Доставка", "Найден конкурент", "URL конкурента",
    "Цена конкурента", "Доставка конкурента", "Дата проверки"
]

for col, header in enumerate(headers, 1):
    cell = ws.cell(1, col)
    cell.value = header
    cell.font = Font(bold=True, size=11, color="FFFFFF")
    cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    cell.alignment = Alignment(horizontal="center")

ws.column_dimensions['A'].width = 50
ws.column_dimensions['B'].width = 50
ws.column_dimensions['C'].width = 60
ws.column_dimensions['D'].width = 15
ws.column_dimensions['E'].width = 12
ws.column_dimensions['F'].width = 20
ws.column_dimensions['G'].width = 18
ws.column_dimensions['H'].width = 50
ws.column_dimensions['I'].width = 18
ws.column_dimensions['J'].width = 25
ws.column_dimensions['K'].width = 20

# Копируем товары в новый Excel
for idx, product in enumerate(products, 2):
    ws.cell(idx, 1).value = product['shop_url']
    ws.cell(idx, 2).value = product['url']
    ws.cell(idx, 3).value = product['title']
    ws.cell(idx, 4).value = product['price']
    ws.cell(idx, 5).value = product['reviews']
    ws.cell(idx, 6).value = product['delivery']
    ws.cell(idx, 7).value = "не проверен"

wb.save(OUTPUT_EXCEL)
print(f"Создан Excel: {OUTPUT_EXCEL}")
print("")

# Сохраняем товары для bash
import json
with open('/tmp/products_stage4.json', 'w', encoding='utf-8') as f:
    json.dump(products, f, ensure_ascii=False, indent=2)
PYTHON_INIT

# Проверяем
if [ ! -f /tmp/products_stage4.json ]; then
    echo "Ошибка: не создан список товаров"
    exit 1
fi

PRODUCT_COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/products_stage4.json'))))")
if [ "$PRODUCT_COUNT" -eq 0 ]; then
    echo "Нет товаров для проверки"
    exit 0
fi

echo "Начинаю поиск конкурентов..."
echo ""

PRODUCT_NUM=0

# Читаем товары
python3 -c "import json; products=json.load(open('/tmp/products_stage4.json')); [print(p['title']) for p in products]" | while read -r PRODUCT_TITLE; do
    PRODUCT_NUM=$((PRODUCT_NUM + 1))
    
    echo "================================================"
    echo "Товар $PRODUCT_NUM/$PRODUCT_COUNT"
    echo "${PRODUCT_TITLE:0:60}..."
    echo ""

    # URL поиска (кодируем название)
    SEARCH_QUERY=$(echo "$PRODUCT_TITLE" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip()))")
    SEARCH_URL="https://www.ozon.ru/search/?text=$SEARCH_QUERY"

    echo "  Ищу на Ozon..."
    osascript -e "tell application \"Google Chrome\" to open location \"$SEARCH_URL\"" >/dev/null 2>&1
    random_sleep 4 6

    # Прокручиваем
    for ((i=1; i<=3; i++)); do
        osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
        sleep 1
    done
    sleep 2

    # Проверяем первые 5 карточек
    COMPETITOR_FOUND="нет"
    COMPETITOR_URL=""
    COMPETITOR_PRICE=""
    COMPETITOR_DELIVERY=""

    echo "  Проверяю карточки..."
    
    for ((idx=0; idx<5; idx++)); do
        COMP_JSON=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { 'NO_TILE'; } else {
    var result = {};
    var link = tile.querySelector('a[href*=\\\"/product/\\\"]');
    result.url = link ? link.href : '';
    var priceSpan = tile.querySelector('span[class*=\\\"tsHeadline500Medium\\\"]');
    result.price = priceSpan ? priceSpan.textContent.replace(/[^0-9]/g, '') : '0';
    var buttons = tile.querySelectorAll('button, span');
    result.delivery = '';
    for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent.trim();
        if (t.match(/[Сс]егодня|[Зз]автра|[Пп]ослезавтра|через|[0-9]+\\\\s+(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/)) {
            result.delivery = t;
            break;
        }
    }
    JSON.stringify(result);
}
\"" 2>/dev/null | head -1)

        if [ "$COMP_JSON" = "NO_TILE" ] || [ -z "$COMP_JSON" ]; then
            break
        fi

        COMP_URL=$(echo "$COMP_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('url', ''))")
        COMP_PRICE=$(echo "$COMP_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('price', '0'))")
        COMP_DELIVERY=$(echo "$COMP_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('delivery', ''))")

        if [ -z "$COMP_DELIVERY" ]; then
            continue
        fi

        # Проверяем быструю доставку
        IS_FAST=$(is_fast_delivery "$COMP_DELIVERY")

        if [ "$IS_FAST" = "yes" ]; then
            COMPETITOR_FOUND="да"
            COMPETITOR_URL="$COMP_URL"
            COMPETITOR_PRICE="$COMP_PRICE"
            COMPETITOR_DELIVERY="$COMP_DELIVERY"
            echo "  ✓ Найден! Цена: $COMP_PRICE руб, Доставка: $COMP_DELIVERY"
            break
        fi
    done

    if [ "$COMPETITOR_FOUND" = "нет" ]; then
        echo "  - Конкурент не найден"
    fi

    # Обновляем Excel
    export OUTPUT_EXCEL PRODUCT_TITLE COMPETITOR_FOUND COMPETITOR_URL COMPETITOR_PRICE COMPETITOR_DELIVERY
    python3 - <<PYTHON_UPDATE
import openpyxl
from datetime import datetime
import os

wb = openpyxl.load_workbook(os.environ['OUTPUT_EXCEL'])
ws = wb.active

# Ищем товар по названию
title_to_find = os.environ['PRODUCT_TITLE']
for row in range(2, ws.max_row + 1):
    if ws.cell(row, 3).value == title_to_find:
        ws.cell(row, 7).value = os.environ['COMPETITOR_FOUND']
        ws.cell(row, 8).value = os.environ.get('COMPETITOR_URL', '')
        ws.cell(row, 9).value = os.environ.get('COMPETITOR_PRICE', '')
        ws.cell(row, 10).value = os.environ.get('COMPETITOR_DELIVERY', '')
        ws.cell(row, 11).value = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        break

wb.save(os.environ['OUTPUT_EXCEL'])
PYTHON_UPDATE

    # Закрываем вкладку
    osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
    sleep 1
    
done

echo ""
echo "================================================"
echo "ЗАВЕРШЕНО!"
echo ""
echo "Результаты: $OUTPUT_EXCEL"
echo ""

# Статистика
export OUTPUT_EXCEL
python3 - <<'PYTHON_STATS'
import openpyxl
import os

wb = openpyxl.load_workbook(os.environ['OUTPUT_EXCEL'])
ws = wb.active

total = 0
with_competitor = 0

for row in range(2, ws.max_row + 1):
    status = ws.cell(row, 7).value
    if status:
        total += 1
        if status == "да":
            with_competitor += 1

print(f"Всего товаров проверено: {total}")
print(f"С конкурентом (быстрая доставка): {with_competitor}")
print(f"Без конкурента: {total - with_competitor}")
PYTHON_STATS

rm -f /tmp/products_stage4.json
