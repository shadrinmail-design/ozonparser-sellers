#!/bin/bash

# Самый простой подход - как у друга
# Множество простых запросов вместо сложного JavaScript

MAX_SELLERS="${1:-3}"

echo "🚀 Сбор продавцов (простой метод)"
echo "Цель: $MAX_SELLERS продавцов"
echo ""

# Открываем страницу
echo "⏳ Открываю страницу..."
osascript -e 'tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/"
end tell'

sleep 8

# Прокручиваем
echo "📜 Прокручиваю..."
for ((i=1; i<=5; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    sleep 2
done

# Получаем количество карточек
TILES=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "document.querySelectorAll(\"[data-index]\").length;"' 2>/dev/null)

echo "Найдено карточек: $TILES"
echo ""

SELLERS_FILE="/tmp/sellers_$(date +%s).txt"
> "$SELLERS_FILE"

FOUND=0

# Обрабатываем каждую карточку
for ((idx=0; idx<$TILES && FOUND<$MAX_SELLERS; idx++)); do
    echo -ne "\r  Проверяю карточку $((idx+1))/$TILES..."

    # Получаем текст доставки
    DELIVERY=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var buttons = tile.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent.trim();
        if (t.indexOf('янв') > -1 || t.indexOf('дек') > -1) {
            t;
            break;
        }
    }
}
\"" 2>/dev/null | head -1)

    # Проверяем срок (упрощенно - просто ищем январь)
    if [[ "$DELIVERY" == *"янв"* ]] || [[ "$DELIVERY" == *"фев"* ]]; then

        # Получаем URL товара
        PRODUCT_URL=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var link = tile.querySelector('a[href*=\\\"/product/\\\"]');
    if (link) { link.href; } else { ''; }
}
\"" 2>/dev/null | head -1)

        if [ -n "$PRODUCT_URL" ] && [ "$PRODUCT_URL" != "missing value" ]; then
            echo ""
            echo "  ✓ Товар с доставкой $DELIVERY"

            # Открываем в новой вкладке
            osascript -e "tell application \"Google Chrome\" to open location \"$PRODUCT_URL\"" >/dev/null 2>&1
            sleep 5

            # Получаем продавца
            SELLER=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var link = document.querySelector(\"a[href*=\\\"/seller/\\\"]\");
if (link) { link.href; } else { \"\"; }
"' 2>/dev/null | head -1)

            if [ -n "$SELLER" ] && [ "$SELLER" != "missing value" ]; then
                echo "    → Продавец: $SELLER"
                echo "$SELLER" >> "$SELLERS_FILE"
                FOUND=$((FOUND + 1))
            fi

            # Закрываем вкладку
            osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
            sleep 1
        fi
    fi

done

echo ""
echo ""
echo "✅ Готово!"
echo ""

# Обработка результатов
python3 <<PYTHON
import json
from datetime import datetime
import os

# Читаем продавцов
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
os.makedirs('results', exist_ok=True)

result = {
    'success': True,
    'total': len(sellers),
    'parsed_at': datetime.now().isoformat(),
    'sellers': [{'url': url} for url in sellers]
}

timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
filename = f'results/sellers_simple_{timestamp}.json'

with open(filename, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print()
print(f'💾 Сохранено: {filename}')
PYTHON

rm -f "$SELLERS_FILE"
