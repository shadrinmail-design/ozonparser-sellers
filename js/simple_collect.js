#!/usr/bin/env node

/**
 * Простой парсер через Chrome
 * Использует пошаговый подход
 */

const { execSync } = require('child_process');

function chromeJS(js) {
    // Экранируем кавычки для AppleScript
    const escapedJS = js.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const cmd = `osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "${escapedJS}"'`;
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

const targetPath = process.argv[2] || '/seller/guangzhouganxinmaoyidian-3366398';
const maxScrolls = parseInt(process.argv[3] || '3');

console.log('🚀 Открываю страницу...');
const ozonURL = `https://www.ozon.ru${targetPath}`;

// Открываем
chromeJS(`window.location.href = '${ozonURL}'; 'OK';`);
execSync('sleep 5');

// Скроллим
console.log(`📜 Прокручиваю ${maxScrolls} раз...`);
for (let i = 0; i < maxScrolls; i++) {
    chromeJS('window.scrollBy(0, window.innerHeight); "OK";');
    execSync('sleep 2');
}

console.log('🔍 Собираю данные...');

// Получаем количество товаров
const tilesCount = parseInt(chromeJS('document.querySelectorAll("[data-index]").length;'));
console.log(`   Найдено карточек: ${tilesCount}`);

const products = [];

// Собираем каждый товар отдельно
for (let idx = 0; idx < Math.min(tilesCount, 100); idx++) {
    try {
        const dataJS = `
            (function() {
                var tile = document.querySelector('[data-index="${idx}"]');
                if (!tile) return null;

                var link = tile.querySelector('a[href*="/product/"]');
                if (!link) return null;

                var match = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
                if (!match) return null;

                var allSpans = tile.querySelectorAll('span');
                var texts = [];
                for (var i = 0; i < allSpans.length && i < 50; i++) {
                    var t = allSpans[i].textContent.trim();
                    if (t) texts.push(t);
                }

                var buttons = tile.querySelectorAll('button');
                var buttonTexts = [];
                for (var i = 0; i < buttons.length && i < 10; i++) {
                    var t = buttons[i].textContent.trim();
                    if (t) buttonTexts.push(t);
                }

                return {
                    id: match[1],
                    url: link.href,
                    texts: texts,
                    buttons: buttonTexts
                };
            })();
        `;

        const result = chromeJS(`JSON.stringify(${dataJS})`);
        if (result && result !== 'null' && result !== 'missing value') {
            const data = JSON.parse(result);
            if (data && data.id) {
                // Анализируем тексты
                const texts = data.texts || [];
                const buttons = data.buttons || [];

                // Цена - первый текст с ₽
                let price = '';
                for (const t of texts) {
                    if (t.includes('₽') && /\d/.test(t)) {
                        price = t;
                        break;
                    }
                }

                // Название - самый длинный текст
                let title = '';
                let maxLen = 0;
                for (const t of texts) {
                    if (t.length > maxLen && t.length > 20 &&
                        !t.includes('₽') && !t.includes('шт ') &&
                        !t.includes('%') && !t.includes('отзыв')) {
                        title = t;
                        maxLen = t.length;
                    }
                }

                // Рейтинг - число 0-5
                let rating = '';
                for (const t of texts) {
                    if (/^[0-5]\.[0-9]$/.test(t)) {
                        rating = t;
                        break;
                    }
                }

                // Отзывы
                let reviewsCount = '0';
                for (const t of texts) {
                    if (t.includes('отзыв')) {
                        const num = t.match(/\d+/);
                        if (num) reviewsCount = num[0];
                        break;
                    }
                }

                // Доставка из кнопок
                let deliveryDays = '';
                for (const t of buttons) {
                    const tl = t.toLowerCase();
                    if (tl.includes('ноя') || tl.includes('дек') ||
                        tl.includes('янв') || tl.includes('завтра') ||
                        tl.includes('фев') || tl.includes('мар')) {
                        deliveryDays = t;
                        break;
                    }
                }

                products.push({
                    id: data.id,
                    url: data.url,
                    title: title || 'Без названия',
                    price: price || '',
                    rating: rating || '',
                    reviews_count: reviewsCount,
                    delivery_days: deliveryDays || ''
                });
            }
        }
    } catch (e) {
        // Пропускаем ошибки
    }
}

console.log(`\n✅ Собрано товаров: ${products.length}\n`);

// Показываем первые 5
for (let i = 0; i < Math.min(5, products.length); i++) {
    const p = products[i];
    console.log(`${i+1}. ${p.title.substring(0, 60)}${p.title.length > 60 ? '...' : ''}`);
    console.log(`   ID: ${p.id} | Цена: ${p.price}`);
    console.log(`   Рейтинг: ${p.rating || 'нет'} | Отзывы: ${p.reviews_count} | Доставка: ${p.delivery_days || 'не указано'}`);
    console.log('');
}

// Выводим JSON
const output = {
    success: true,
    total: products.length,
    products: products
};

console.log(JSON.stringify(output, null, 2));
