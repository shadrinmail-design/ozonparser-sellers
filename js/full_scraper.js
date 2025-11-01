/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDeliveryDate(text) {
  if (!text) return null;

  const now = new Date();
  const months = {
    'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
    'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
  };

  // "3 ноября" -> Date
  const match = text.match(/(\d{1,2})\s+([а-я]+)/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthName = match[2].toLowerCase();
    const month = months[monthName];

    if (month !== undefined) {
      const year = now.getFullYear();
      const deliveryDate = new Date(year, month, day);

      // Если дата в прошлом, значит следующий год
      if (deliveryDate < now) {
        deliveryDate.setFullYear(year + 1);
      }

      // Вычисляем количество дней
      const diffTime = deliveryDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        date: deliveryDate.toISOString().split('T')[0],
        days: diffDays,
        text: text.trim()
      };
    }
  }

  // "Завтра"
  if (text.toLowerCase().includes('завтра')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: tomorrow.toISOString().split('T')[0],
      days: 1,
      text: text.trim()
    };
  }

  // "Сегодня"
  if (text.toLowerCase().includes('сегодня')) {
    return {
      date: now.toISOString().split('T')[0],
      days: 0,
      text: text.trim()
    };
  }

  return { date: null, days: null, text: text.trim() };
}

async function uploadToAPI(products) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(products);
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
          resolve({ success: false, error: `Invalid JSON: ${body.substring(0, 100)}` });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 Starting FULL Ozon scraper...\n');

  // Копируем куки
  const { execSync } = require('child_process');
  console.log('📋 Copying Chrome cookies...');
  try {
    execSync('node copy_chrome_cookies.js', { cwd: __dirname });
    console.log('✅ Cookies copied\n');
  } catch (err) {
    console.log('⚠️  Using existing cookies\n');
  }

  // Запускаем браузер
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/tmp/chrome-puppeteer-profile',
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--lang=ru-RU',
      '--window-size=1366,768',
    ],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  try {
    console.log('🌐 Opening Ozon...\n');
    const response = await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }).catch(err => {
      console.log('⚠️  Navigation error:', err.message);
      return null;
    });

    if (!response) {
      await sleep(5000);
    } else {
      console.log(`✅ Page loaded (${response.status()})\n`);
    }

    await sleep(2000);

    // Закрываем cookie баннер
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const cookieButton = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          return text.includes('ок') || text.includes('принять') || text.includes('согласен');
        });
        if (cookieButton) cookieButton.click();
      });
      console.log('✅ Cookie banner closed\n');
      await sleep(1000);
    } catch (e) {
      console.log('⚠️  No cookie banner\n');
    }

    // СОБИРАЕМ ВСЕ ДАННЫЕ О ТОВАРАХ
    console.log('📦 Collecting product data...\n');

    const products = await page.evaluate(() => {
      const results = [];

      // Ищем все карточки товаров
      const tiles = document.querySelectorAll('[data-widget="searchResultsV2"] > div > div');

      tiles.forEach(tile => {
        try {
          // Ссылка на товар
          const link = tile.querySelector('a[href*="/product/"]');
          if (!link) return;

          const href = link.getAttribute('href');
          const match = href.match(/\/product\/.*?-(\d+)/);
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
            // Убираем параметры размера для получения оригинала
            if (image) {
              image = image.split('?')[0];
            }
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
            if (ratingMatch) {
              rating_value = parseFloat(ratingMatch[1]);
            }
          }

          // Количество отзывов
          const reviewsEl = tile.querySelector('span[class*="tsCaption"]');
          let reviews_count = null;
          if (reviewsEl) {
            const reviewsText = reviewsEl.textContent;
            const reviewsMatch = reviewsText.match(/(\d+)\s*(отзыв|отзыва|отзывов)/);
            if (reviewsMatch) {
              reviews_count = parseInt(reviewsMatch[1], 10);
            }
          }

          // Дата доставки
          const deliveryTexts = [];
          const deliveryEls = tile.querySelectorAll('span[class*="tsBodyControl"]');
          deliveryEls.forEach(el => {
            const text = el.textContent.trim();
            if (text && (text.includes('ября') || text.includes('Завтра') || text.includes('Сегодня'))) {
              deliveryTexts.push(text);
            }
          });

          results.push({
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
          console.error('Error parsing tile:', e);
        }
      });

      return results;
    });

    console.log(`✅ Found ${products.length} products\n`);

    // Обрабатываем даты доставки
    products.forEach(p => {
      if (p.delivery_texts && p.delivery_texts.length > 0) {
        const parsed = parseDeliveryDate(p.delivery_texts[0]);
        p.delivery_min_date = parsed.date;
        p.delivery_days = parsed.days;
      }
    });

    // Показываем примеры
    console.log('📋 Sample products:\n');
    products.slice(0, 3).forEach((p, i) => {
      console.log(`${i + 1}. [${p.ozon_id}] ${p.name || 'No name'}`);
      console.log(`   Price: ${p.price_text || 'N/A'}`);
      console.log(`   Rating: ${p.rating_value || 'N/A'} (${p.reviews_count || 0} reviews)`);
      console.log(`   Delivery: ${p.delivery_days !== null ? p.delivery_days + ' days' : 'N/A'} - ${p.delivery_min_date || 'N/A'}`);
      console.log(`   Image: ${p.images[0] ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Сохраняем в файл
    const fs = require('fs');
    fs.writeFileSync('/tmp/ozon_products_full.json', JSON.stringify(products, null, 2));
    console.log('💾 Saved to /tmp/ozon_products_full.json\n');

    // Загружаем на сервер
    if (products.length > 0) {
      console.log(`📤 Uploading ${products.length} products to server...\n`);

      try {
        const result = await uploadToAPI(products);
        console.log('✅ Upload result:');
        console.log(JSON.stringify(result, null, 2));

        if (result.success) {
          console.log(`\n🎉 Success! ${result.inserted} inserted, ${result.updated} updated`);
        }
      } catch (uploadError) {
        console.error('\n❌ Upload failed:', uploadError.message);
        console.log('📝 Products saved to file for manual upload');
      }
    }

    console.log('\n⏳ Browser will stay open for 5 seconds...');
    await sleep(5000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
