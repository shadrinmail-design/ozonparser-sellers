#!/bin/bash

# Упрощенная версия сбора продавцов по доставке > 3 недель

MAX_SELLERS="${1:-3}"

echo "🚀 Сбор продавцов по доставке > 3 недель"
echo "Цель: $MAX_SELLERS продавцов"
echo ""

# Шаг 1: Открываем страницу и находим товары
echo "⏳ Открываю страницу 'Товары из Китая'..."
osascript -e 'tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/"
end tell'

sleep 8

# Прокручиваем
echo "📜 Прокручиваю страницу..."
for ((i=1; i<=5; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    sleep 2
done

echo ""
echo "🔍 Ищу товары с доставкой > 3 недель..."

# Находим товары с большим сроком доставки
PRODUCTS=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var now = new Date();
var threeWeeksFromNow = new Date(now.getTime() + (21 * 24 * 60 * 60 * 1000));

function parseDate(text) {
    var months = {
        \"янв\": 0, \"фев\": 1, \"мар\": 2, \"апр\": 3, \"май\": 4, \"июн\": 5,
        \"июл\": 6, \"авг\": 7, \"сен\": 8, \"окт\": 9, \"ноя\": 10, \"дек\": 11
    };

    var match = text.toLowerCase().match(/(\\d+)\\s*(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/);
    if (match) {
        var day = parseInt(match[1]);
        var monthIndex = months[match[2]];
        var date = new Date();
        date.setMonth(monthIndex);
        date.setDate(day);
        if (monthIndex < now.getMonth()) {
            date.setFullYear(now.getFullYear() + 1);
        }
        return date;
    }
    return null;
}

var tiles = document.querySelectorAll('[data-index]');
var products = [];

for (var i = 0; i < tiles.length; i++) {
    var tile = tiles[i];
    var buttons = tile.querySelectorAll('button');

    for (var j = 0; j < buttons.length; j++) {
        var text = buttons[j].textContent.trim();
        var date = parseDate(text);

        if (date && date > threeWeeksFromNow) {
            var link = tile.querySelector('a[href*=\"/product/\"]');
            if (link) {
                products.push(link.href);
                break;
            }
        }
    }

    if (products.length >= 3) break;
}

JSON.stringify(products);
"')

echo "Найдено товаров: $(echo "$PRODUCTS" | python3 -c "import sys, json; print(len(json.loads(sys.stdin.read())))")"
echo ""

# Для каждого товара собираем продавца
SELLERS_FILE="/tmp/sellers_$(date +%s).txt"
> "$SELLERS_FILE"

PRODUCT_COUNT=$(echo "$PRODUCTS" | python3 -c "import sys, json; print(len(json.loads(sys.stdin.read())))")

for i in $(seq 0 $((PRODUCT_COUNT - 1))); do
    PRODUCT_URL=$(echo "$PRODUCTS" | python3 -c "import sys, json; products = json.loads(sys.stdin.read()); print(products[$i] if $i < len(products) else '')")

    if [ -z "$PRODUCT_URL" ]; then
        continue
    fi

    echo "[$((i+1))/$PRODUCT_COUNT] Обрабатываю: $PRODUCT_URL"

    # Открываем товар в новой вкладке
    osascript -e "tell application \"Google Chrome\" to open location \"$PRODUCT_URL\"" >/dev/null 2>&1
    sleep 5

    # Получаем ссылку на продавца
    SELLER_URL=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
        var sellerLink = document.querySelector(\"a[href*=\\\"/seller/\\\"]\");
        if (sellerLink) {
            sellerLink.href;
        } else {
            \"\";
        }
    "' 2>/dev/null | head -1)

    if [ -n "$SELLER_URL" ] && [ "$SELLER_URL" != "missing value" ]; then
        echo "  ✓ Продавец: $SELLER_URL"
        echo "$SELLER_URL" >> "$SELLERS_FILE"

        # TODO: Проверка кнопки "Есть дешевле и быстрее" будет в следующей версии
    else
        echo "  ✗ Продавец не найден"
    fi

    # Закрываем вкладку
    osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
    sleep 1

done

echo ""
echo "✅ Сбор завершен!"
echo ""

# Обрабатываем результаты
python3 <<PYTHON
import json
from datetime import datetime

# Читаем файл с продавцами
sellers = []
try:
    with open('$SELLERS_FILE', 'r') as f:
        sellers = list(set([line.strip() for line in f if line.strip()]))
except:
    pass

print(f'Собрано уникальных продавцов: {len(sellers)}')
print()

for i, url in enumerate(sellers, 1):
    print(f'{i}. {url}')

# Сохраняем
import os
os.makedirs('results', exist_ok=True)

result = {
    'success': True,
    'total': len(sellers),
    'parsed_at': datetime.now().isoformat(),
    'method': 'delivery_filter_v2',
    'sellers': [{'url': url} for url in sellers]
}

timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
filename = f'results/sellers_by_delivery_{timestamp}.json'

with open(filename, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print()
print(f'💾 Результат: {filename}')
PYTHON

# Очистка
rm -f "$SELLERS_FILE"
