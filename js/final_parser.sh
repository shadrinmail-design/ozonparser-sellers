#!/bin/bash

# Полный парсер Ozon через Chrome
# Использует массовый сбор shell/bash скриптом

TARGET_PATH="${1:-/seller/guangzhouganxinmaoyidian-3366398}"
MAX_SCROLLS="${2:-5}"

URL="https://www.ozon.ru${TARGET_PATH}"

echo "🚀 Парсинг: $URL"
echo "📜 Прокруток: $MAX_SCROLLS"
echo ""

# Открываем страницу
echo "⏳ Открываю страницу..."
osascript <<EOF
tell application "Google Chrome"
    activate
    if (count of windows) is 0 then
        make new window
    end if
    set URL of active tab of window 1 to "$URL"
end tell
EOF

sleep 5

# Скроллим
echo "📜 Прокручиваю..."
for ((i=1; i<=MAX_SCROLLS; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' > /dev/null 2>&1
    sleep 2
done

# Собираем данные - используем ОЧЕНЬ ПРОСТОЙ JavaScript
echo "🔍 Собираю товары..."

# Сохраняем JS в файл чтобы избежать проблем с экранированием
cat > /tmp/collect_ozon.js <<'JSEOF'
(function() {
    var products = [];
    var tiles = document.querySelectorAll('[data-index]');

    for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var link = tile.querySelector('a[href*="/product/"]');
        if (!link) continue;

        var id = link.href.match(/product\/[^\/]*-(\d+)/);
        if (!id) continue;

        products.push({
            index: i,
            id: id[1],
            url: link.href
        });
    }

    return JSON.stringify({success: true, total: products.length, products: products});
})();
JSEOF

# Выполняем JS из файла
RESULT=$(osascript <<EOF
tell application "Google Chrome"
    set jsCode to do shell script "cat /tmp/collect_ozon.js"
    execute active tab of window 1 javascript jsCode
end tell
EOF
)

echo "$RESULT" | python3 -m json.tool

# Очистка
rm -f /tmp/collect_ozon.js
