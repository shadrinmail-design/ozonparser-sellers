#!/bin/bash

# Расширенный сбор продавцов Ozon Global с детальной информацией
# Использует AppleScript + Chrome (обход Cloudflare как у вашего друга)

SEARCH_KEYWORD="${1:-смартфон}"
MAX_SCROLLS="${2:-5}"
MAX_SELLERS="${3:-20}"

echo "🚀 Расширенный сбор продавцов Ozon Global"
echo "Ключевое слово: $SEARCH_KEYWORD"
echo "Прокруток: $MAX_SCROLLS"
echo "Максимум продавцов: $MAX_SELLERS"
echo ""

# Функция для получения деталей продавца
get_seller_details() {
    local SELLER_ID=$1
    local SELLER_URL=$2

    echo "  📝 Получаю детали продавца $SELLER_ID..."

    # Открываем страницу продавца
    osascript -e "tell application \"Google Chrome\" to set URL of active tab of window 1 to \"$SELLER_URL\"" >/dev/null 2>&1
    sleep 5

    # Собираем информацию о продавце
    local DETAILS=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
    set currentTab to active tab of window 1

    set detailsJS to "JSON.stringify((function() {
        // Пытаемся найти название продавца
        var nameEl = document.querySelector('h1');
        var name = nameEl ? nameEl.textContent.trim() : 'Unknown';

        // Убираем ' | OZON' из названия
        name = name.replace(/\\s*[|—-]\\s*OZON.*$/i, '');

        // Ищем рейтинг
        var rating = '';
        var ratingEl = document.querySelector('[class*=\"rating\"]');
        if (ratingEl) {
            var ratingText = ratingEl.textContent.trim();
            var match = ratingText.match(/[0-5]\\.[0-9]/);
            if (match) rating = match[0];
        }

        // Ищем количество отзывов
        var reviewsCount = '0';
        var reviewsEl = document.querySelector('[class*=\"review\"]');
        if (reviewsEl) {
            var reviewsText = reviewsEl.textContent.trim();
            var match = reviewsText.match(/\\d+/);
            if (match) reviewsCount = match[0];
        }

        // Определяем признаки глобального продавца
        var pageText = document.body.innerText.toLowerCase();

        var isGlobal = pageText.indexOf('global') > -1 ||
                      pageText.indexOf('из-за рубежа') > -1 ||
                      pageText.indexOf('из китая') > -1 ||
                      pageText.indexOf('доставка из китая') > -1 ||
                      pageText.indexOf('доставка из турции') > -1;

        return {
            name: name,
            rating: rating,
            reviews_count: reviewsCount,
            is_global: isGlobal
        };
    })());"

    set result to execute currentTab javascript detailsJS
    return result
end tell
APPLESCRIPT
)

    echo "$DETAILS"
}

# Шаг 1: Собираем список продавцов из поиска
echo "⏳ Открываю поиск Ozon Global..."
osascript <<EOF
tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru/search/?from_global=true&text=$SEARCH_KEYWORD"
end tell
EOF

sleep 8

echo "📜 Прокручиваю страницу..."
for ((i=1; i<=MAX_SCROLLS; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    sleep 2
done

echo ""
echo "🔍 Собираю список продавцов..."

# Получаем список продавцов
SELLERS_LIST=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
    set currentTab to active tab of window 1

    set collectJS to "JSON.stringify((function() {
        var sellers = {};
        var tiles = document.querySelectorAll('[data-index]');

        for (var i = 0; i < tiles.length; i++) {
            var tile = tiles[i];
            var sellerLink = tile.querySelector('a[href*=\"/seller/\"]');

            if (sellerLink) {
                var match = sellerLink.href.match(/\\/seller\\/[^\\/]*-(\\d+)/);
                if (match && match[1]) {
                    var sellerId = match[1];
                    if (!sellers[sellerId]) {
                        sellers[sellerId] = {
                            id: sellerId,
                            url: sellerLink.href,
                            name: sellerLink.textContent.trim() || 'Unknown'
                        };
                    }
                }
            }
        }

        var sellersList = [];
        for (var id in sellers) {
            sellersList.push(sellers[id]);
        }

        return sellersList;
    })());"

    set result to execute currentTab javascript collectJS
    return result
end tell
APPLESCRIPT
)

# Обрабатываем список
SELLER_IDS=$(echo "$SELLERS_LIST" | python3 -c "
import sys, json
try:
    sellers = json.loads(sys.stdin.read())
    print(json.dumps(sellers[:${MAX_SELLERS}], ensure_ascii=False))
except:
    print('[]')
")

# Шаг 2: Собираем детали для каждого продавца
echo ""
echo "📊 Собираю детали продавцов..."
echo ""

TEMP_FILE=$(mktemp)
echo "[" > "$TEMP_FILE"

SELLER_COUNT=$(echo "$SELLER_IDS" | python3 -c "import sys, json; print(len(json.loads(sys.stdin.read())))")

echo "$SELLER_IDS" | python3 -c "
import sys, json

sellers = json.loads(sys.stdin.read())

for i, seller in enumerate(sellers):
    print(f'{seller[\"id\"]}|{seller[\"url\"]}|{seller[\"name\"]}')
" | while IFS='|' read -r SELLER_ID SELLER_URL SELLER_NAME; do
    CURRENT=$((${BASH_LINENO[0]} - 120))

    echo -ne "\r   Обработано: $CURRENT/$SELLER_COUNT"

    # Получаем детали
    DETAILS=$(get_seller_details "$SELLER_ID" "$SELLER_URL")

    # Парсим детали
    PARSED=$(echo "$DETAILS" | python3 -c "
import sys, json
try:
    details = json.loads(sys.stdin.read())
    print(json.dumps({
        'id': '$SELLER_ID',
        'url': '$SELLER_URL',
        'name': details.get('name', '$SELLER_NAME'),
        'rating': details.get('rating', ''),
        'reviews_count': details.get('reviews_count', '0'),
        'is_global': details.get('is_global', True)
    }, ensure_ascii=False))
except:
    print(json.dumps({
        'id': '$SELLER_ID',
        'url': '$SELLER_URL',
        'name': '$SELLER_NAME',
        'rating': '',
        'reviews_count': '0',
        'is_global': True
    }, ensure_ascii=False))
")

    # Добавляем в результат
    if [ -s "$TEMP_FILE" ] && [ "$(tail -c 2 "$TEMP_FILE")" != "[" ]; then
        echo "," >> "$TEMP_FILE"
    fi

    echo "$PARSED" >> "$TEMP_FILE"

    sleep 2
done

echo "]" >> "$TEMP_FILE"

echo ""
echo ""
echo "✅ Сбор завершен!"
echo ""

# Сохраняем результат
cat "$TEMP_FILE" | python3 -c "
import sys, json, os
from datetime import datetime

try:
    sellers = json.load(sys.stdin)

    # Фильтруем пустые
    sellers = [s for s in sellers if s.get('id')]

    print(f'Собрано продавцов: {len(sellers)}')
    print()

    # Показываем результаты
    for i, seller in enumerate(sellers[:10]):
        print(f\"{i+1}. {seller['name']}\")
        print(f\"   ID: {seller['id']}\")
        print(f\"   Рейтинг: {seller.get('rating') or 'нет'} | Отзывы: {seller.get('reviews_count', '0')}\")
        print(f\"   Global: {'✓' if seller.get('is_global') else '✗'}\")
        print()

    if len(sellers) > 10:
        print(f'... и еще {len(sellers) - 10} продавцов')
        print()

    # Сохраняем
    os.makedirs('results', exist_ok=True)

    result = {
        'success': True,
        'total': len(sellers),
        'search_keyword': '$SEARCH_KEYWORD',
        'parsed_at': datetime.now().isoformat(),
        'sellers': sellers
    }

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'results/ozon_global_sellers_full_{timestamp}.json'

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f'💾 Данные сохранены: {filename}')

except Exception as e:
    print(f'Ошибка: {e}')
    import traceback
    traceback.print_exc()
"

rm "$TEMP_FILE"
