#!/bin/bash

# Сбор ПОЛНЫХ данных товаров через простые AppleScript запросы
# Избегаем сложного JavaScript - делаем много простых запросов

URL_PATH="${1:-/seller/guangzhouganxinmaoyidian-3366398}"
MAX_SCROLLS="${2:-10}"

echo "🚀 Сбор полных данных"
echo "URL: https://www.ozon.ru$URL_PATH"
echo "Прокруток: $MAX_SCROLLS"
echo ""

# Открываем страницу
echo "⏳ Открываю страницу..."
osascript <<EOF
tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru$URL_PATH"
end tell
EOF

sleep 8

# Скроллим
echo "📜 Прокручиваю..."
for ((i=1; i<=MAX_SCROLLS; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    sleep 2
done

# Проверяем количество
TILES=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "document.querySelectorAll(\"[data-index]\").length;"' 2>/dev/null)

echo "🔍 Найдено карточек: $TILES"
echo ""

if [ "$TILES" = "0" ] || [ -z "$TILES" ]; then
    echo "❌ Товары не найдены"
    exit 1
fi

# Создаём временный файл для результатов
TEMP_FILE=$(mktemp)
echo "[" > "$TEMP_FILE"

# Собираем каждый товар по полям
for ((idx=0; idx<$TILES; idx++)); do
    echo -ne "\r   Обработано: $((idx+1))/$TILES"

    # ID и URL - ОДИН простой запрос
    ID_URL=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var link = tile.querySelector('a[href*=\\\"/product/\\\"]');
    if (!link) { ''; } else {
        var m = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
        if (m) { m[1] + '|' + link.href; } else { ''; }
    }
}
\"" 2>/dev/null)

    if [ -z "$ID_URL" ] || [ "$ID_URL" = "missing value" ]; then
        continue
    fi

    PRODUCT_ID=$(echo "$ID_URL" | cut -d'|' -f1)
    PRODUCT_URL=$(echo "$ID_URL" | cut -d'|' -f2)

    # Название - ищем самый длинный текст (минимум 10 символов)
    TITLE=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var spans = tile.querySelectorAll('span');
    var longest = '';
    for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent.trim();
        if (t.length > longest.length && t.length > 10 &&
            t.indexOf('₽') === -1 && t.indexOf('шт') === -1 &&
            t.indexOf('%') === -1 && t.indexOf('отзыв') === -1) {
            longest = t;
        }
    }
    longest;
}
\"" 2>/dev/null | head -1)

    # Цена
    PRICE=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var spans = tile.querySelectorAll('span');
    var price = '';
    for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent.trim();
        if (t.indexOf('₽') > -1 && t.match(/\\\\d/)) {
            price = t;
            break;
        }
    }
    price;
}
\"" 2>/dev/null | head -1)

    # Рейтинг
    RATING=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var spans = tile.querySelectorAll('span');
    var rating = '';
    for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent.trim();
        if (t.match(/^[0-5]\\\\.[0-9]\$/)) {
            rating = t;
            break;
        }
    }
    rating;
}
\"" 2>/dev/null | head -1)

    # Отзывы
    REVIEWS=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var spans = tile.querySelectorAll('span');
    var reviews = '0';
    for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent.trim();
        if (t.indexOf('отзыв') > -1) {
            var num = t.match(/\\\\d+/);
            if (num) reviews = num[0];
            break;
        }
    }
    reviews;
}
\"" 2>/dev/null | head -1)

    # Доставка
    DELIVERY=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var buttons = tile.querySelectorAll('button');
    var delivery = '';
    for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent.trim();
        var tl = t.toLowerCase();
        if (tl.indexOf('ноя') > -1 || tl.indexOf('дек') > -1 ||
            tl.indexOf('янв') > -1 || tl.indexOf('завтра') > -1) {
            delivery = t;
            break;
        }
    }
    delivery;
}
\"" 2>/dev/null | head -1)

    # Изображение
    IMAGE=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var img = tile.querySelector('img');
    if (img && img.src) { img.src; } else { ''; }
}
\"" 2>/dev/null | head -1)

    # Очищаем значения от "missing value"
    [ "$TITLE" = "missing value" ] && TITLE=""
    [ "$PRICE" = "missing value" ] && PRICE=""
    [ "$RATING" = "missing value" ] && RATING=""
    [ "$REVIEWS" = "missing value" ] && REVIEWS="0"
    [ "$DELIVERY" = "missing value" ] && DELIVERY=""
    [ "$IMAGE" = "missing value" ] && IMAGE=""

    # Экранируем JSON
    TITLE=$(echo "$TITLE" | sed 's/"/\\"/g' | sed "s/'/\\'/g")
    PRICE=$(echo "$PRICE" | sed 's/"/\\"/g')
    DELIVERY=$(echo "$DELIVERY" | sed 's/"/\\"/g')

    # Добавляем в JSON
    if [ $idx -gt 0 ]; then
        echo "," >> "$TEMP_FILE"
    fi

    cat >> "$TEMP_FILE" <<JSON
  {
    "id": "$PRODUCT_ID",
    "url": "$PRODUCT_URL",
    "title": "$TITLE",
    "price": "$PRICE",
    "rating": "$RATING",
    "reviews_count": "$REVIEWS",
    "delivery_days": "$DELIVERY",
    "image": "$IMAGE"
  }
JSON

done

echo "]" >> "$TEMP_FILE"

echo ""
echo ""
echo "✅ Сбор завершен!"
echo ""

# Показываем результат
cat "$TEMP_FILE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f'Собрано товаров: {len(data)}')
    print()
    for i, p in enumerate(data[:5]):
        print(f\"{i+1}. {p['title'][:60]}...\")
        print(f\"   ID: {p['id']} | Цена: {p['price']}\")
        print(f\"   Рейтинг: {p['rating'] or 'нет'} | Отзывы: {p['reviews_count']} | Доставка: {p['delivery_days'] or 'не указано'}\")
        print()

    # Сохраняем
    output = {
        'success': True,
        'total': len(data),
        'products': data
    }

    import os
    os.makedirs('results', exist_ok=True)

    import time
    filename = f\"results/full_data_{int(time.time())}.json\"
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'💾 Данные сохранены: {filename}')
except Exception as e:
    print(f'Ошибка: {e}')
    print('Сырые данные:')
    sys.stdin.seek(0)
    print(sys.stdin.read())
"

rm "$TEMP_FILE"
