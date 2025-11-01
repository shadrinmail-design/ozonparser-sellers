/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function uploadToAPI(products) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(products);
    const options = {
      hostname: 'max.gogocrm.ru',
      port: 443,
      path: '/ozon/api/products/bulk',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data, 'utf8')
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
    req.write(data, 'utf8');
    req.end();
  });
}

async function main() {
  const MAX_SCROLLS = parseInt(process.env.MAX_SCROLLS || '10', 10);
  const DRY_RUN = process.env.DRY_RUN === '1';
  let products = []; // Declare at function scope

  console.log(`🚀 Starting Ozon scraper with ${MAX_SCROLLS} scrolls...\n`);

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

  try {
    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    console.log('🌐 Opening Ozon...');
    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('✅ Page loaded\n');
    await sleep(3000);

    // Close cookie banner
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

    // First, scroll to find the "Категория" section (where products with ratings start)
    console.log('📍 Scrolling to product catalog section...\n');
    await page.evaluate(() => {
      // Find element containing "Категория" text
      const elements = Array.from(document.querySelectorAll('*'));
      const categoryEl = elements.find(el => el.textContent.includes('Категория'));
      if (categoryEl) {
        categoryEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // Fallback: scroll to first tile-root
        const firstTile = document.querySelector('[class*="tile-root"]');
        if (firstTile) firstTile.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    await sleep(2000);

    // Scroll to load products
    console.log(`📜 Scrolling ${MAX_SCROLLS} times to load products...\n`);
    for (let i = 0; i < MAX_SCROLLS; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.8); // Scroll by viewport height
      });
      await sleep(3000); // Wait longer for products and their details to load

      const count = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/product/"]').length;
      });

      console.log(`  Scroll ${i + 1}/${MAX_SCROLLS}: ${count} product links`);
    }

    // Wait extra time for all dynamic content to load (especially ratings/reviews)
    console.log('⏳ Waiting for dynamic content (ratings/reviews) to load...');
    await sleep(5000);

    console.log('\n📦 Collecting product data...\n');

    // Extract products
    products = await page.evaluate(() => {
      const productMap = new Map();

      // Find all product tiles
      const tiles = document.querySelectorAll('[class*="tile-root"]');

      tiles.forEach(tile => {
        try {
          // Get product link
          const link = tile.querySelector('a[href*="/product/"]');
          if (!link) return;

          const href = link.getAttribute('href');
          const match = href.match(/\/product\/.*?-(\d+)/);
          if (!match) return;

          const ozon_id = parseInt(match[1], 10);
          if (productMap.has(ozon_id)) return; // Skip duplicates

          // Extract all spans once
          const allSpans = Array.from(tile.querySelectorAll('span'));

          // Name - look for longer text that's not price/promo
          const name = (() => {
            const nameEl = allSpans.find(el => {
              const text = el.textContent.trim();
              return text.length > 20 && text.length < 300 &&
                     !text.includes('₽') && !text.includes('%') &&
                     !text.includes('баллов') && !text.includes('отзыв') &&
                     !text.includes('Распродажа') && !text.includes('ября') &&
                     !text.includes('Завтра') && !text.includes('Сегодня');
            });
            return nameEl ? nameEl.textContent.trim() : null;
          })();

          // Image
          const img = tile.querySelector('img');
          let image = null;
          if (img) {
            image = img.src || img.getAttribute('data-src') || null;
            if (image) image = image.split('?')[0];
          }

          // Price - find span with ₽ that's not too long
          const priceEl = allSpans.find(el => {
            const text = el.textContent;
            return text.includes('₽') && text.length < 30 && !text.includes('-');
          });
          const price_text = priceEl ? priceEl.textContent.trim() : null;

          // Parse price value as number
          let price_value = null;
          if (price_text) {
            const priceMatch = price_text.match(/[\d\s]+/);
            if (priceMatch) {
              price_value = parseFloat(priceMatch[0].replace(/\s/g, ''));
            }
          }

          // Rating - look for span with color:var(--textPremium) containing a number
          let rating_value = null;
          const ratingSpan = allSpans.find(el => {
            const style = el.getAttribute('style');
            const text = el.textContent.trim();
            return style && style.includes('var(--textPremium)') && /^\d+\.\d+$/.test(text);
          });
          if (ratingSpan) {
            rating_value = parseFloat(ratingSpan.textContent.trim());
          }

          // Reviews - look for span with color:var(--textSecondary) containing "отзыв"
          let reviews_count = null;
          const reviewsSpan = allSpans.find(el => {
            const style = el.getAttribute('style');
            const text = el.textContent.trim();
            return style && style.includes('var(--textSecondary)') && text.match(/\d+\s*(отзыв|отзыва|отзывов)/);
          });
          if (reviewsSpan) {
            const reviewsMatch = reviewsSpan.textContent.match(/(\d+)/);
            if (reviewsMatch) {
              reviews_count = parseInt(reviewsMatch[1], 10);
            }
          }

          // Delivery - find dates in buttons and spans
          const deliveryTexts = [];
          const buttons = tile.querySelectorAll('button');
          buttons.forEach(btn => {
            const text = btn.textContent.trim();
            if (text && (text.includes('ября') || text.includes('Завтра') || text.includes('Сегодня'))) {
              if (!deliveryTexts.includes(text)) {
                deliveryTexts.push(text);
              }
            }
          });
          // Also check spans as fallback
          if (deliveryTexts.length === 0) {
            allSpans.forEach(el => {
              const text = el.textContent.trim();
              if (text && (text.includes('ября') || text.includes('Завтра') || text.includes('Сегодня'))) {
                if (!deliveryTexts.includes(text)) {
                  deliveryTexts.push(text);
                }
              }
            });
          }

          productMap.set(ozon_id, {
            ozon_id,
            name,
            url_path: href,
            url: `https://www.ozon.ru${href}`,
            price_text,
            price_value,
            rating_value,
            reviews_count,
            images: image ? [image] : [],
            delivery_texts: deliveryTexts
          });

        } catch (e) {
          // Skip errors
        }
      });

      return Array.from(productMap.values());
    });

    console.log(`✅ Collected ${products.length} unique products\n`);

    // Process delivery dates
    products.forEach(p => {
      if (p.delivery_texts && p.delivery_texts.length > 0) {
        const parsed = parseDeliveryDate(p.delivery_texts[0]);
        p.delivery_min_date = parsed.date;
        p.delivery_days = parsed.days;
      }
    });

    // Show samples
    console.log('📋 Sample products:\n');
    products.slice(0, 5).forEach((p, i) => {
      console.log(`${i + 1}. [${p.ozon_id}] ${p.name || 'No name'}`);
      console.log(`   Price: ${p.price_text || 'N/A'}`);
      console.log(`   Rating: ${p.rating_value || 'N/A'} (${p.reviews_count || 0} reviews)`);
      console.log(`   Delivery: ${p.delivery_days !== null ? p.delivery_days + ' days' : 'N/A'} - ${p.delivery_min_date || 'N/A'}`);
      console.log(`   Image: ${p.images[0] ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Save to file
    const fs = require('fs');
    fs.writeFileSync('/tmp/ozon_products_full.json', JSON.stringify(products, null, 2));
    console.log('💾 Saved to /tmp/ozon_products_full.json\n');

    // Upload to server
    if (!DRY_RUN && products.length > 0) {
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
      }
    } else if (DRY_RUN) {
      console.log('🔍 DRY RUN - skipping upload to server\n');
    }

    console.log('\n⏳ Browser will stay open for 5 seconds...');
    await sleep(5000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Done!');

  // Save history snapshot if products were uploaded
  if (!DRY_RUN && products.length > 0) {
    console.log('\n💾 Saving history snapshot...');
    const { execSync } = require('child_process');
    try {
      const output = execSync('ssh -o StrictHostKeyChecking=no -p 2209 root@157.180.78.70 "cd /home/ozon-parser && python3 save_history.py"', {
        encoding: 'utf-8',
        timeout: 30000
      });
      console.log(output);
    } catch (err) {
      console.error('⚠️  Failed to save history:', err.message);
    }
  }
}

main().catch(console.error);
