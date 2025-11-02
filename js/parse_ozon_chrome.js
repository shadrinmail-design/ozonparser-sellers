#!/usr/bin/env node

/**
 * Парсер Ozon через Chrome AppleScript с полными данными
 * Собирает: название, цену, рейтинг, отзывы, доставку
 */

const { execSync } = require('child_process');

const targetPath = process.argv[2] || '/seller/guangzhouganxinmaoyidian-3366398';
const maxScrolls = parseInt(process.argv[3] || '5');

const ozonURL = `https://www.ozon.ru${targetPath}`;

console.log(`🚀 Парсинг: ${ozonURL}`);
console.log(`📜 Прокруток: ${maxScrolls}`);

// Открываем страницу в Chrome
const openScript = `
tell application "Google Chrome"
    activate
    if (count of windows) is 0 then
        make new window
    end if
    set currentTab to active tab of window 1
    set URL of currentTab to "${ozonURL}"
end tell
`;

console.log('⏳ Открываю страницу...');
execSync(`osascript -e '${openScript}'`);

// Ждем загрузки
execSync('sleep 5');

// Скроллим
console.log('📜 Прокручиваю...');
for (let i = 0; i < maxScrolls; i++) {
    execSync(`osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"'`);
    execSync('sleep 2');
}

// Собираем данные
console.log('🔍 Собираю товары...');

const collectJS = `
JSON.stringify((function() {
    var products = [];
    var seen = {};
    var tiles = document.querySelectorAll('[data-index]');

    for (var tileIdx = 0; tileIdx < tiles.length; tileIdx++) {
        var tile = tiles[tileIdx];
        var link = tile.querySelector('a[href*="/product/"]');
        if (!link) continue;

        var match = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
        if (!match || seen[match[1]]) continue;
        seen[match[1]] = true;

        var productId = match[1];
        var productUrl = link.href;

        var allSpans = tile.querySelectorAll('span');
        var texts = [];
        for (var i = 0; i < allSpans.length; i++) {
            var t = allSpans[i].textContent.trim();
            if (t) texts.push(t);
        }

        var price = '';
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].indexOf('₽') > -1 && texts[i].match(/\\\\d/)) {
                price = texts[i];
                break;
            }
        }

        var title = '';
        var maxLen = 0;
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].length > maxLen &&
                texts[i].length > 20 &&
                texts[i].indexOf('₽') === -1 &&
                texts[i].indexOf('шт ') === -1 &&
                texts[i].indexOf('%') === -1 &&
                texts[i].indexOf('отзыв') === -1) {
                title = texts[i];
                maxLen = texts[i].length;
            }
        }

        var rating = '';
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].match(/^[0-5]\\\\.[0-9]$/)) {
                rating = texts[i];
                break;
            }
        }

        var reviewsCount = '';
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].indexOf('отзыв') > -1) {
                var num = texts[i].match(/\\\\d+/);
                if (num) reviewsCount = num[0];
                break;
            }
        }

        var buttons = tile.querySelectorAll('button');
        var deliveryDays = '';
        for (var i = 0; i < buttons.length; i++) {
            var t = buttons[i].textContent.trim();
            var tl = t.toLowerCase();
            if (t && (tl.indexOf('ноя') > -1 || tl.indexOf('дек') > -1 ||
                      tl.indexOf('янв') > -1 || tl.indexOf('завтра') > -1 ||
                      tl.indexOf('фев') > -1 || tl.indexOf('мар') > -1)) {
                deliveryDays = t;
                break;
            }
        }

        products.push({
            id: productId,
            url: productUrl,
            title: title || 'Без названия',
            price: price || '',
            rating: rating || '',
            reviews_count: reviewsCount || '0',
            delivery_days: deliveryDays || ''
        });
    }

    return {
        success: true,
        total: products.length,
        products: products
    };
})());
`;

const executeScript = `tell application "Google Chrome" to execute active tab of window 1 javascript "${collectJS}"`;

const result = execSync(`osascript -e '${executeScript}'`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

try {
    const data = JSON.parse(result);
    console.log(`\n✅ Найдено товаров: ${data.total}\n`);

    if (data.products && data.products.length > 0) {
        // Показываем первые 5 товаров
        for (let i = 0; i < Math.min(5, data.products.length); i++) {
            const p = data.products[i];
            console.log(`${i+1}. ID: ${p.id}`);
            console.log(`   Название: ${p.title.substring(0, 60)}...`);
            console.log(`   Цена: ${p.price}`);
            console.log(`   Рейтинг: ${p.rating || 'нет'} | Отзывы: ${p.reviews_count}`);
            console.log(`   Доставка: ${p.delivery_days || 'не указано'}`);
            console.log('');
        }
    }

    // Выводим полный JSON
    console.log(JSON.stringify(data, null, 2));

} catch (e) {
    console.error('❌ Ошибка парсинга JSON:', e.message);
    console.error('Результат:', result);
    process.exit(1);
}
