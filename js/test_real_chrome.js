/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWithRealChrome() {
  console.log('🚀 Launching Chrome with real profile...\n');

  // Создаем временную копию для безопасности
  const tempUserDataDir = '/tmp/chrome-puppeteer-profile';
  const userDataDir = '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome';
  const profileDir = 'Profile 5';

  console.log('📂 Original Profile:', `${userDataDir}/${profileDir}`);
  console.log('📂 Temp Profile:', tempUserDataDir);
  console.log('');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: tempUserDataDir, // используем временную директорию
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--lang=ru-RU',
        '--disable-web-security', // для тестирования
        '--disable-features=VizDisplayCompositor',
        '--window-size=1366,768',
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    console.log('✅ Chrome launched with real profile!\n');

    // Ждем немного
    await sleep(2000);

    const pages = await browser.pages();
    let page = pages.find(p => p.url() !== 'about:blank') || pages[0] || await browser.newPage();

    console.log('🌐 Navigating to Ozon...\n');

    // Сразу на целевую страницу
    console.log('🎯 Going to target page...');
    const response = await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }).catch(err => {
      console.log('⚠️  Navigation error:', err.message);
      return null;
    });

    if (!response) {
      console.log('⚠️  No response, but continuing...');
      await sleep(5000); // ждем загрузки
    }

    console.log('\n📊 Response status:', response.status());
    console.log('📊 Response URL:', response.url());

    await sleep(2000);

    // Закрываем окно с куками если есть
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const cookieButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          return text.includes('ок') || text.includes('принять') || text.includes('согласен') || text.includes('accept') || text.includes('хорошо');
        });
        if (cookieButton) {
          cookieButton.click();
        }
      });
      console.log('✅ Cookie banner closed');
      await sleep(1000);
    } catch (e) {
      console.log('⚠️  No cookie banner found');
    }

    // Проверяем результат и собираем ВСЕ ДАННЫЕ
    const pageInfo = await page.evaluate(() => {
      const products = [];

      // Ищем карточки товаров
      const tiles = document.querySelectorAll('[data-widget="searchResultsV2"] > div > div');

      tiles.forEach(tile => {
        try {
          const link = tile.querySelector('a[href*="/product/"]');
          if (!link) return;

          const href = link.getAttribute('href');
          const match = href && href.match(/\/product\/.*?-(\d+)/);
          if (!match) return;

          const ozon_id = parseInt(match[1], 10);

          // Название
          const nameEl = tile.querySelector('span[class*="tsBody"]');
          const name = nameEl ? nameEl.textContent.trim() : null;

          // Картинка
          const img = tile.querySelector('img');
          let image = null;
          if (img) {
            image = img.src || img.getAttribute('data-src') || null;
            if (image) image = image.split('?')[0]; // Убираем параметры
          }

          // Цена
          const priceEl = tile.querySelector('span[class*="tsHeadline"]');
          const price_text = priceEl ? priceEl.textContent.trim() : null;

          // Рейтинг
          const ratingEl = tile.querySelector('[class*="rating"], [class*="Rating"]');
          let rating_value = null;
          if (ratingEl) {
            const ratingText = ratingEl.textContent.trim();
            const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
            if (ratingMatch) rating_value = parseFloat(ratingMatch[1]);
          }

          // Отзывы
          const reviewsEl = tile.querySelector('span[class*="tsCaption"]');
          let reviews_count = null;
          if (reviewsEl) {
            const reviewsText = reviewsEl.textContent;
            const reviewsMatch = reviewsText.match(/(\d+)\s*(отзыв|отзыва|отзывов)/);
            if (reviewsMatch) reviews_count = parseInt(reviewsMatch[1], 10);
          }

          // Доставка
          const deliveryTexts = [];
          const deliveryEls = tile.querySelectorAll('span[class*="tsBodyControl"]');
          deliveryEls.forEach(el => {
            const text = el.textContent.trim();
            if (text && (text.includes('ября') || text.includes('Завтра') || text.includes('Сегодня'))) {
              deliveryTexts.push(text);
            }
          });

          products.push({
            ozon_id,
            name,
            url_path: href,
            url: `https://www.ozon.ru${href}`,
            price_text,
            rating_value,
            reviews_count,
            images: image ? [image] : [],
            delivery_texts: deliveryTexts
          });
        } catch (e) {
          // Skip errors
        }
      });

      // Remove duplicates
      const seen = new Set();
      const unique = products.filter(p => {
        if (seen.has(p.ozon_id)) return false;
        seen.add(p.ozon_id);
        return true;
      });

      return {
        title: document.title,
        hasBlockMessage: document.body.innerText.includes('Доступ ограничен'),
        productLinksCount: unique.length,
        searchWidgets: document.querySelectorAll('[data-widget*="searchResults"]').length,
        bodyPreview: document.body.innerText.substring(0, 300),
        products: unique
      };
    });

    console.log('\n📋 Page Info:');
    console.log('Title:', pageInfo.title);
    console.log('Blocked?:', pageInfo.hasBlockMessage);
    console.log('Product links:', pageInfo.productLinksCount);
    console.log('Search widgets:', pageInfo.searchWidgets);
    console.log('');
    console.log('Body preview:');
    console.log(pageInfo.bodyPreview);
    console.log('');

    if (pageInfo.hasBlockMessage) {
      console.log('❌ Still blocked!');
      await page.screenshot({ path: '/tmp/ozon_real_chrome_blocked.png', fullPage: true });
      console.log('📸 Screenshot: /tmp/ozon_real_chrome_blocked.png');
    } else {
      console.log('✅ SUCCESS! No block detected!');
      console.log(`✅ Found ${pageInfo.productLinksCount} product links`);
      await page.screenshot({ path: '/tmp/ozon_real_chrome_success.png', fullPage: true });
      console.log('📸 Screenshot: /tmp/ozon_real_chrome_success.png');
    }

    // Обрабатываем даты доставки и сохраняем/загружаем
    if (pageInfo.products && pageInfo.products.length > 0) {
      // Парсим даты доставки
      pageInfo.products.forEach(p => {
        if (p.delivery_texts && p.delivery_texts.length > 0) {
          const text = p.delivery_texts[0];
          const parsed = parseDeliveryDate(text);
          p.delivery_min_date = parsed.date;
          p.delivery_days = parsed.days;
        }
      });

      console.log(`\n📦 Collected ${pageInfo.products.length} products with FULL data\n`);
      console.log('Sample products:');
      pageInfo.products.slice(0, 3).forEach((p, i) => {
        console.log(`${i + 1}. [${p.ozon_id}] ${p.name || 'No name'}`);
        console.log(`   Price: ${p.price_text || 'N/A'}`);
        console.log(`   Rating: ${p.rating_value || 'N/A'} (${p.reviews_count || 0} reviews)`);
        console.log(`   Delivery: ${p.delivery_days !== null ? p.delivery_days + ' days' : 'N/A'} - ${p.delivery_min_date || 'N/A'}`);
        console.log(`   Image: ${p.images[0] ? 'Yes' : 'No'}`);
      });

      const fs = require('fs');
      fs.writeFileSync('/tmp/ozon_products_full.json', JSON.stringify(pageInfo.products, null, 2));
      console.log('\n💾 Saved to /tmp/ozon_products_full.json');

      // Загружаем на сервер
      console.log(`\n📤 Uploading ${pageInfo.products.length} products to server...`);
      const https = require('https');
      const uploadPromise = new Promise((resolve, reject) => {
        const data = JSON.stringify(pageInfo.products);
        const options = {
          hostname: 'max.gogocrm.ru',
          port: 443,
          path: '/ozon/api/products/bulk',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
          }
        };

        const req = https.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ success: false, error: `Invalid JSON: ${body.substring(0, 200)}` });
            }
          });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });

      try {
        const result = await uploadPromise;
        console.log('\n✅ Upload result:');
        console.log(JSON.stringify(result, null, 2));

        if (result.success) {
          console.log(`\n🎉 Success! ${result.inserted} new, ${result.updated} updated`);
        }
      } catch (uploadError) {
        console.error('\n❌ Upload failed:', uploadError.message);
      }
    }

    // Функция парсинга дат
    function parseDeliveryDate(text) {
      if (!text) return { date: null, days: null };

      const now = new Date();
      const months = {
        'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
        'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
      };

      const match = text.match(/(\d{1,2})\s+([а-я]+)/i);
      if (match) {
        const day = parseInt(match[1], 10);
        const monthName = match[2].toLowerCase();
        const month = months[monthName];

        if (month !== undefined) {
          const year = now.getFullYear();
          const deliveryDate = new Date(year, month, day);
          if (deliveryDate < now) deliveryDate.setFullYear(year + 1);

          const diffTime = deliveryDate - now;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          return {
            date: deliveryDate.toISOString().split('T')[0],
            days: diffDays
          };
        }
      }

      if (text.toLowerCase().includes('завтра')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { date: tomorrow.toISOString().split('T')[0], days: 1 };
      }

      if (text.toLowerCase().includes('сегодня')) {
        return { date: now.toISOString().split('T')[0], days: 0 };
      }

      return { date: null, days: null };
    }

    console.log('\n⏳ Browser will stay open for 10 seconds for inspection...');
    await sleep(10000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('already running')) {
      console.log('\n💡 Решение:');
      console.log('   1. Закройте все окна Google Chrome');
      console.log('   2. Запустите скрипт снова');
      console.log('\n   Или используйте альтернативный метод (см. test_chrome_debugging.js)');
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n✅ Test complete');
}

testWithRealChrome().catch(console.error);
