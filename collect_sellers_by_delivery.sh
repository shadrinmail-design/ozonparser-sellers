#!/bin/bash

# Сбор продавцов Ozon по критерию доставки > 3 недель
# Новый алгоритм по требованиям пользователя

MAX_SELLERS="${1:-3}"

echo "🚀 Сбор продавцов по доставке > 3 недель"
echo "Цель: $MAX_SELLERS продавцов"
echo ""

# Открываем стартовую страницу
echo "⏳ Открываю страницу 'Товары из Китая'..."
osascript <<'EOF'
tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/"
end tell
EOF

sleep 8

# Прокручиваем для загрузки товаров
echo "📜 Прокручиваю страницу..."
for ((i=1; i<=5; i++)); do
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    sleep 2
done

echo ""
echo "🔍 Анализирую товары и собираю продавцов..."
echo ""

# Основной скрипт сбора
SELLERS_JSON=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
    set mainWindow to window 1
    set mainTab to active tab of mainWindow

    -- Получаем текущую дату + 21 день (3 недели)
    set currentDate to current date
    set threeWeeksLater to currentDate + (21 * days)

    set collectJS to "JSON.stringify((function() {
        var sellers = {};
        var maxSellers = 3;
        var foundSellers = 0;

        // Получаем текущую дату + 21 день
        var now = new Date();
        var threeWeeksFromNow = new Date(now.getTime() + (21 * 24 * 60 * 60 * 1000));

        console.log('Поиск товаров с доставкой позже:', threeWeeksFromNow.toLocaleDateString('ru-RU'));

        // Функция для парсинга даты из текста
        function parseDeliveryDate(text) {
            if (!text) return null;

            var months = {
                'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'май': 4, 'июн': 5,
                'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11
            };

            // Ищем паттерн типа '25 января' или '25 янв'
            var match = text.toLowerCase().match(/(\\d+)\\s*(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/);

            if (match) {
                var day = parseInt(match[1]);
                var monthIndex = months[match[2]];

                var deliveryDate = new Date();
                deliveryDate.setMonth(monthIndex);
                deliveryDate.setDate(day);

                // Если месяц меньше текущего - значит это следующий год
                if (monthIndex < now.getMonth()) {
                    deliveryDate.setFullYear(now.getFullYear() + 1);
                }

                return deliveryDate;
            }

            return null;
        }

        // Находим все карточки товаров
        var tiles = document.querySelectorAll('[data-index]');
        console.log('Найдено карточек товаров:', tiles.length);

        var products = [];

        for (var i = 0; i < tiles.length && foundSellers < maxSellers; i++) {
            var tile = tiles[i];

            // Ищем дату доставки в кнопках
            var buttons = tile.querySelectorAll('button');
            var deliveryDate = null;
            var deliveryText = '';

            for (var j = 0; j < buttons.length; j++) {
                var btnText = buttons[j].textContent.trim();
                if (btnText && (btnText.indexOf('янв') > -1 || btnText.indexOf('фев') > -1 ||
                               btnText.indexOf('мар') > -1 || btnText.indexOf('апр') > -1 ||
                               btnText.indexOf('май') > -1 || btnText.indexOf('июн') > -1 ||
                               btnText.indexOf('июл') > -1 || btnText.indexOf('авг') > -1 ||
                               btnText.indexOf('сен') > -1 || btnText.indexOf('окт') > -1 ||
                               btnText.indexOf('ноя') > -1 || btnText.indexOf('дек') > -1)) {
                    deliveryText = btnText;
                    deliveryDate = parseDeliveryDate(btnText);
                    break;
                }
            }

            // Проверяем, что доставка > 3 недель
            if (deliveryDate && deliveryDate > threeWeeksFromNow) {
                // Находим ссылку на товар
                var productLink = tile.querySelector('a[href*=\"/product/\"]');

                if (productLink) {
                    products.push({
                        url: productLink.href,
                        deliveryText: deliveryText,
                        deliveryDate: deliveryDate.toLocaleDateString('ru-RU'),
                        index: i
                    });

                    console.log('Найден товар с доставкой', deliveryText, ':', productLink.href);
                }
            }
        }

        return {
            success: true,
            products: products,
            foundProducts: products.length
        };
    })());"

    set result to execute mainTab javascript collectJS
    return result
end tell
APPLESCRIPT
)

echo "$SELLERS_JSON" | python3 -c "
import sys, json

try:
    data = json.loads(sys.stdin.read())

    if data.get('success'):
        products = data.get('products', [])
        print(f'Найдено товаров с доставкой > 3 недель: {len(products)}')
        print()

        for p in products[:3]:
            print(f\"  - {p['url']}\")
            print(f\"    Доставка: {p['deliveryText']}\")

        # Сохраняем для следующего этапа
        with open('/tmp/ozon_products_to_process.json', 'w', encoding='utf-8') as f:
            json.dump(products[:3], f, ensure_ascii=False, indent=2)

        print()
        print('✓ Список товаров сохранен во временный файл')
    else:
        print('Ошибка:', data)

except Exception as e:
    print(f'Ошибка: {e}')
    print(sys.stdin.read())
"

# Теперь для каждого товара собираем продавцов
echo ""
echo "📦 Собираю продавцов из карточек товаров..."
echo ""

SELLERS=$(osascript <<'APPLESCRIPT'
tell application "Google Chrome"
    set mainWindow to window 1
    set mainTab to active tab of mainWindow
    set mainTabIndex to active tab index of mainWindow

    -- Читаем список товаров
    set productsJson to do shell script "cat /tmp/ozon_products_to_process.json"

    -- JavaScript для обработки каждого товара
    set processProductJS to "
    var products = " & productsJson & ";
    var allSellers = {};

    (async function() {
        for (var i = 0; i < products.length; i++) {
            var product = products[i];

            console.log('Обрабатываю товар ' + (i+1) + '/' + products.length);

            // Открываем товар в новой вкладке
            window.open(product.url, '_blank');

            // Ждем загрузки (будет обработано в следующей команде)
        }

        return { success: true, opened: products.length };
    })();
    "

    -- Открываем товары в новых вкладках
    execute mainTab javascript processProductJS

    delay 3

    -- Теперь обрабатываем каждую вкладку
    set sellersList to {}
    set tabCount to count of tabs of mainWindow

    repeat with i from 2 to tabCount
        set currentTab to tab i of mainWindow
        set active tab index of mainWindow to i

        delay 3

        -- Ищем ссылку на продавца
        set sellerJS to "JSON.stringify((function() {
            // Ищем ссылку на продавца
            var sellerLink = document.querySelector('a[href*=\"/seller/\"]');

            if (sellerLink) {
                var sellerUrl = sellerLink.href;

                // Проверяем наличие кнопки 'Есть дешевле и быстрее'
                var cheaperBtn = null;
                var buttons = document.querySelectorAll('button, a');

                for (var i = 0; i < buttons.length; i++) {
                    var text = buttons[i].textContent.trim().toLowerCase();
                    if (text.indexOf('дешевле') > -1 || text.indexOf('быстрее') > -1) {
                        cheaperBtn = buttons[i];
                        break;
                    }
                }

                return {
                    success: true,
                    sellerUrl: sellerUrl,
                    hasCheaperBtn: cheaperBtn !== null
                };
            }

            return { success: false };
        })());"

        set sellerData to execute currentTab javascript sellerJS

        -- Сохраняем ссылку на продавца
        copy sellerData to end of sellersList

        -- Закрываем вкладку
        close currentTab

        delay 1
    end repeat

    -- Возвращаемся на главную вкладку
    set active tab index of mainWindow to mainTabIndex

    return "[" & my joinList(sellersList, ",") & "]"
end tell

on joinList(theList, delimiter)
    set oldDelimiters to AppleScript's text item delimiters
    set AppleScript's text item delimiters to delimiter
    set theString to theList as string
    set AppleScript's text item delimiters to oldDelimiters
    return theString
end joinList
APPLESCRIPT
)

echo ""
echo "✅ Сбор завершен!"
echo ""

# Обрабатываем результат
echo "$SELLERS" | python3 -c "
import sys, json
from datetime import datetime

try:
    sellers_data = json.loads(sys.stdin.read())

    # Извлекаем уникальные ссылки
    unique_sellers = {}

    for item in sellers_data:
        if isinstance(item, str):
            item = json.loads(item)

        if item.get('success') and item.get('sellerUrl'):
            url = item['sellerUrl']
            if url not in unique_sellers:
                unique_sellers[url] = {
                    'url': url,
                    'has_cheaper_option': item.get('hasCheaperBtn', False)
                }

    sellers_list = list(unique_sellers.values())

    print(f'Собрано уникальных продавцов: {len(sellers_list)}')
    print()

    for i, seller in enumerate(sellers_list, 1):
        print(f'{i}. {seller[\"url\"]}')
        if seller['has_cheaper_option']:
            print('   ⚠️  Есть опция \"дешевле и быстрее\" (не обработана)')

    # Сохраняем результат
    import os
    os.makedirs('results', exist_ok=True)

    result = {
        'success': True,
        'total': len(sellers_list),
        'parsed_at': datetime.now().isoformat(),
        'method': 'delivery_filter',
        'sellers': sellers_list
    }

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'results/sellers_by_delivery_{timestamp}.json'

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print()
    print(f'💾 Результат: {filename}')

except Exception as e:
    print(f'Ошибка: {e}')
    import traceback
    traceback.print_exc()
"

# Очистка
rm -f /tmp/ozon_products_to_process.json
