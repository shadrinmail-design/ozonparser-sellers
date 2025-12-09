#!/bin/bash

# Сбор продавцов Ozon Global через AppleScript + Chrome
# На основе подхода из ozonparser (AppleScript обходит Cloudflare)

SEARCH_KEYWORD="${1:-смартфон}"
MAX_SCROLLS="${2:-5}"

echo "🚀 Сбор продавцов Ozon Global"
echo "Ключевое слово: $SEARCH_KEYWORD"
echo "Прокруток: $MAX_SCROLLS"
echo ""

# Открываем страницу поиска с фильтром from_global=true
echo "⏳ Открываю поиск Ozon Global..."
osascript <<EOF
tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru/search/?from_global=true&text=$SEARCH_KEYWORD"
end tell
EOF

sleep 8

# Скроллим для загрузки товаров
echo "📜 Прокручиваю страницу..."
for ((i=1; i<=MAX_SCROLLS; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    sleep 2
done

echo ""
echo "🔍 Собираю продавцов из товаров..."

# Собираем уникальные ID продавцов
SELLERS_JSON=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
    set currentTab to active tab of window 1

    set collectJS to "JSON.stringify((function() {
        var sellers = {};
        var tiles = document.querySelectorAll('[data-index]');

        console.log('Найдено карточек:', tiles.length);

        for (var i = 0; i < tiles.length; i++) {
            var tile = tiles[i];

            // Ищем ссылку на продавца в карточке товара
            var sellerLink = tile.querySelector('a[href*=\"/seller/\"]');

            if (sellerLink) {
                // Извлекаем ID из URL /seller/name-123456/
                var match = sellerLink.href.match(/\\/seller\\/[^\\/]*-(\\d+)/);

                if (match && match[1]) {
                    var sellerId = match[1];

                    if (!sellers[sellerId]) {
                        // Название продавца из текста ссылки
                        var sellerName = sellerLink.textContent.trim();

                        sellers[sellerId] = {
                            id: sellerId,
                            name: sellerName || 'Unknown',
                            url: sellerLink.href,
                            is_global: true
                        };
                    }
                }
            }
        }

        var sellersList = [];
        for (var id in sellers) {
            sellersList.push(sellers[id]);
        }

        return {
            success: true,
            total: sellersList.length,
            sellers: sellersList
        };
    })());"

    set result to execute currentTab javascript collectJS
    return result
end tell
APPLESCRIPT
)

echo ""
echo "✅ Сбор завершен!"
echo ""

# Обрабатываем и сохраняем результат
echo "$SELLERS_JSON" | python3 -c "
import sys, json, os
from datetime import datetime

try:
    data = json.load(sys.stdin)

    if data.get('success'):
        sellers = data.get('sellers', [])
        print(f'Найдено уникальных продавцов: {len(sellers)}')
        print()

        # Показываем первых 10
        for i, seller in enumerate(sellers[:10]):
            print(f\"{i+1}. {seller['name']}\")
            print(f\"   ID: {seller['id']}\")
            print(f\"   URL: {seller['url']}\")
            print()

        if len(sellers) > 10:
            print(f'... и еще {len(sellers) - 10} продавцов')
            print()

        # Сохраняем
        os.makedirs('results', exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'results/ozon_global_sellers_{timestamp}.json'

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f'💾 Данные сохранены: {filename}')
    else:
        print('❌ Ошибка сбора данных')
        print(json.dumps(data, ensure_ascii=False, indent=2))

except Exception as e:
    print(f'Ошибка: {e}')
    print('Сырые данные:')
    print(sys.stdin.read())
"
