/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');
const http = require('http');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseWidgetStates(widgetStates) {
  const out = [];
  if (!widgetStates || typeof widgetStates !== 'object') return out;
  for (const [key, val] of Object.entries(widgetStates)) {
    if (typeof val !== 'string') continue;
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object') {
        parsed.__state_key = key;
        out.push(parsed);
      }
    } catch (_) {}
  }
  return out;
}

function extractItems(state) {
  if (!state || typeof state !== 'object') return [];
  if (Array.isArray(state.items)) return state.items.filter(x => x && typeof x === 'object');
  if (state.data && Array.isArray(state.data.items)) return state.data.items.filter(x => x && typeof x === 'object');
  return [];
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
}

function getNested(obj, path) {
  let cur = obj;
  for (const p of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function extractProduct(item) {
  const cell = item.cellTrackingInfo || {};
  const tile = item.tile || {};
  const action = item.action || {};
  let pid = cell.id || cell.productId || item.id || item.sku || item.skuId || tile.sku || tile.id;
  if (typeof pid === 'string' && /^\d+$/.test(pid)) pid = parseInt(pid, 10);

  const name = firstNonEmpty(
    getNested(tile, ['title', 'text']),
    getNested(item, ['title', 'text']),
    item.name,
  );

  const urlPath = firstNonEmpty(action.link, item.link, tile.link);
  const priceText = getNested(tile, ['mainState', 0, 'atom', 'price', 'text']) ||
                    getNested(tile, ['price', 'text']);

  return {
    ozon_id: pid,
    name,
    url_path: urlPath,
    url: urlPath ? `https://www.ozon.ru${urlPath}` : null,
    price_text: priceText,
  };
}

async function uploadToAPI(products, apiUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const data = JSON.stringify(products);

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          resolve({ success: false, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const startPath = process.env.OZON_START_URL || '/highlight/tovary-iz-kitaya-935133/?from_global=true';
  const maxScrolls = parseInt(process.env.MAX_SCROLLS || '3', 10);
  const apiUrl = process.env.API_URL || 'https://max.gogocrm.ru/ozon/api/products/bulk';

  console.log('🚀 Starting parser with API upload...\n');
  console.log('Settings:');
  console.log('  Start URL:', startPath);
  console.log('  Max scrolls:', maxScrolls);
  console.log('  API URL:', apiUrl);
  console.log('');

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

  const products = [];
  const seen = new Set();

  try {
    console.log('🌐 Navigating to Ozon...\n');
    await page.goto(`https://www.ozon.ru${startPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('✅ Page loaded\n');
    await sleep(3000);

    // Парсинг
    for (let i = 0; i < maxScrolls; i++) {
      console.log(`📜 Scroll ${i + 1}/${maxScrolls}...`);

      const apiResult = await page.evaluate(async (path) => {
        const url = `https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=${encodeURIComponent(path)}`;
        try {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) return { error: `HTTP ${r.status}`, status: r.status };
          const data = await r.json();
          return { data, status: r.status };
        } catch (e) {
          return { error: e.message };
        }
      }, startPath);

      if (apiResult.data && apiResult.data.widgetStates) {
        const states = parseWidgetStates(apiResult.data.widgetStates);

        for (const st of states) {
          const key = st.__state_key || '';
          if (!/searchResults|catalog/i.test(key)) continue;

          const items = extractItems(st);
          for (const item of items) {
            const prod = extractProduct(item);
            if (!prod.ozon_id || seen.has(prod.ozon_id)) continue;

            seen.add(prod.ozon_id);
            products.push(prod);
          }
        }
      }

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
      await sleep(randomInt(1500, 3000));

      console.log(`  Total unique products: ${products.length}`);
    }

    console.log(`\n✅ Parsing complete! Collected ${products.length} products\n`);

    if (products.length > 0) {
      console.log('📤 Uploading to API...');
      console.log(`URL: ${apiUrl}`);

      try {
        const result = await uploadToAPI(products, apiUrl);
        console.log('\n✅ Upload result:');
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('\n❌ Upload failed:', error.message);
        console.log('\n📝 Saving to file instead...');
        const fs = require('fs');
        fs.writeFileSync('/tmp/ozon_products.json', JSON.stringify(products, null, 2));
        console.log('✅ Saved to /tmp/ozon_products.json');
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
