#!/usr/bin/env node

/**
 * РАБОЧИЙ парсер Ozon через AppleScript + Chrome
 * Собирает ВСЕ поля: название, цена, рейтинг, отзывы, доставка
 */

const { execSync } = require('child_process');
const fs = require('fs');

function chromeExec(js) {
    try {
        // Экранируем специальные символы для AppleScript
        const escaped = js
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$')
            .replace(/`/g, '\\`');

        const cmd = `osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "${escaped}"'`;
        const result = execSync(cmd, { encoding: 'utf8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
        return result.trim();
    } catch (e) {
        console.error('Error executing Chrome JS:', e.message);
        return null;
    }
}

const targetPath = process.argv[2] || '/seller/guangzhouganxinmaoyidian-3366398';
const maxScrolls = parseInt(process.argv[3] || '10');

console.log(`🚀 Парс инг: ${targetPath}`);
console.log(`📜 Прокруток: ${maxScrolls}\n`);

// Открываем страницу
const url = `https://www.ozon.ru${targetPath}`;
console.log('⏳ Открываю страницу...');
chromeExec(`window.location.href = '${url}'; 'OK';`);
execSync('sleep 8');

// Скроллим
console.log('📜 Прокручиваю...');
for (let i = 0; i < maxScrolls; i++) {
    chromeExec('window.scrollBy(0, window.innerHeight); "OK";');
    execSync('sleep 2');
}

// Проверяем количество товаров
console.log('🔍 Собираю данные...');
const tilesCount = parseInt(chromeExec('document.querySelectorAll("[data-index]").length;') || '0');
console.log(`   Найдено карточек: ${tilesCount}\n`);

if (tilesCount === 0) {
    console.error('❌ Товары не найдены. Убедитесь что страница загружена в Chrome.');
    process.exit(1);
}

const products = [];

// Собираем каждый товар отдельно простыми запросами
for (let idx = 0; idx < Math.min(tilesCount, 200); idx++) {
    process.stdout.write(`\r   Обработано: ${idx + 1}/${tilesCount}`);

    try {
        // ID и URL
        const linkData = chromeExec(`
            (function() {
                var tile = document.querySelector('[data-index="${idx}"]');
                if (!tile) return null;
                var link = tile.querySelector('a[href*="/product/"]');
                if (!link) return null;
                var match = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
                return match ? JSON.stringify({id: match[1], url: link.href}) : null;
            })();
        `);

        if (!linkData || linkData === 'null' || linkData === 'missing value') continue;

        const { id, url: productUrl } = JSON.parse(linkData);

        // Все тексты из span
        const textsData = chromeExec(`
            (function() {
                var tile = document.querySelector('[data-index="${idx}"]');
                if (!tile) return null;
                var spans = tile.querySelectorAll('span');
                var texts = [];
                for (var i = 0; i < spans.length && i < 50; i++) {
                    var t = spans[i].textContent.trim();
                    if (t) texts.push(t);
                }
                return JSON.stringify(texts);
            })();
        `);

        const texts = textsData && textsData !== 'null' ? JSON.parse(textsData) : [];

        // Кнопки
        const buttonsData = chromeExec(`
            (function() {
                var tile = document.querySelector('[data-index="${idx}"]');
                if (!tile) return null;
                var buttons = tile.querySelectorAll('button');
                var btns = [];
                for (var i = 0; i < buttons.length && i < 10; i++) {
                    var t = buttons[i].textContent.trim();
                    if (t) btns.push(t);
                }
                return JSON.stringify(btns);
            })();
        `);

        const buttons = buttonsData && buttonsData !== 'null' ? JSON.parse(buttonsData) : [];

        // Анализируем тексты
        let price = '';
        let title = '';
        let maxLen = 0;
        let rating = '';
        let reviewsCount = '0';

        for (const t of texts) {
            // Цена
            if (!price && t.includes('₽') && /\d/.test(t)) {
                price = t;
            }

            // Название - самый длинный без спецсимволов
            if (t.length > maxLen && t.length > 20 &&
                !t.includes('₽') && !t.includes('шт ') &&
                !t.includes('%') && !t.includes('отзыв')) {
                title = t;
                maxLen = t.length;
            }

            // Рейтинг
            if (!rating && /^[0-5]\.[0-9]$/.test(t)) {
                rating = t;
            }

            // Отзывы
            if (!reviewsCount || reviewsCount === '0') {
                if (t.includes('отзыв')) {
                    const num = t.match(/\d+/);
                    if (num) reviewsCount = num[0];
                }
            }
        }

        // Доставка из кнопок
        let deliveryDays = '';
        for (const t of buttons) {
            const tl = t.toLowerCase();
            if (tl.includes('ноя') || tl.includes('дек') ||
                tl.includes('янв') || tl.includes('фев') ||
                tl.includes('мар') || tl.includes('завтра')) {
                deliveryDays = t;
                break;
            }
        }

        products.push({
            id,
            url: productUrl,
            title: title || 'Без названия',
            price: price || '',
            rating: rating || '',
            reviews_count: reviewsCount,
            delivery_days: deliveryDays || ''
        });

    } catch (e) {
        // Пропускаем ошибки
    }
}

console.log(`\n\n✅ Собрано товаров: ${products.length}\n`);

// Показываем первые 5
for (let i = 0; i < Math.min(5, products.length); i++) {
    const p = products[i];
    console.log(`${i+1}. ${p.title.substring(0, 60)}${p.title.length > 60 ? '...' : ''}`);
    console.log(`   ID: ${p.id}`);
    console.log(`   Цена: ${p.price} | Рейтинг: ${p.rating || 'нет'} | Отзывы: ${p.reviews_count}`);
    console.log(`   Доставка: ${p.delivery_days || 'не указано'}`);
    console.log('');
}

// Сохраняем в файл
const output = {
    success: true,
    total: products.length,
    source_url: url,
    collected_at: new Date().toISOString(),
    products: products
};

const filename = `results/parsed_${Date.now()}.json`;
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(filename, JSON.stringify(output, null, 2));
console.log(`💾 Данные сохранены: ${filename}`);
