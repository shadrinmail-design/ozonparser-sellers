/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { MongoClient } = require('mongodb');

puppeteer.use(StealthPlugin());

function env(name, def) {
  const v = process.env[name];
  return v == null || v === '' ? def : v;
}

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
    } catch (_) {
      // ignore
    }
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
    raw: item,
  };
}

async function main() {
  const startPath = env('OZON_START_URL', '/highlight/tovary-iz-kitaya-935133/?from_global=true');
  const maxScrolls = parseInt(env('MAX_SCROLLS', '10'), 10);
  const dryRun = env('DRY_RUN', '1') === '1';
  const mongoUri = env('MONGODB_URI', 'mongodb://localhost:27017');
  const dbName = env('MONGO_DB', 'ozon');
  const collectionName = env('MONGO_COLLECTION', 'products');

  console.log('🚀 Starting Ozon parser with Chrome profile...\n');
  console.log('Settings:');
  console.log('  Start URL:', startPath);
  console.log('  Max scrolls:', maxScrolls);
  console.log('  Dry run:', dryRun);
  console.log('  MongoDB:', dryRun ? 'disabled' : `${mongoUri}/${dbName}/${collectionName}`);
  console.log('');

  // Копируем куки если нужно
  const { execSync } = require('child_process');
  console.log('📋 Copying Chrome cookies...');
  try {
    execSync('node copy_chrome_cookies.js', { cwd: __dirname });
    console.log('✅ Cookies copied\n');
  } catch (err) {
    console.log('⚠️  Failed to copy cookies, using existing ones\n');
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

  console.log('🌐 Navigating to Ozon...\n');

  const products = [];
  const seen = new Set();

  try {
    // Переходим на страницу
    await page.goto(`https://www.ozon.ru${startPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('✅ Page loaded\n');
    await sleep(3000);

    // Начинаем прокрутку и сбор данных
    for (let i = 0; i < maxScrolls; i++) {
      console.log(`📜 Scroll ${i + 1}/${maxScrolls}...`);

      // Пробуем получить данные через Composer API
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
        console.log(`  ✅ API: ${states.length} widget states`);

        for (const st of states) {
          const key = st.__state_key || '';
          if (!/searchResults|catalog/i.test(key)) continue;

          const items = extractItems(st);
          console.log(`  📦 Widget "${key}": ${items.length} items`);

          for (const item of items) {
            const prod = extractProduct(item);
            if (!prod.ozon_id || seen.has(prod.ozon_id)) continue;

            seen.add(prod.ozon_id);
            products.push(prod);
            console.log(`    + ${prod.name?.substring(0, 50)}...`);
          }
        }
      } else {
        console.log('  ⚠️  API failed, trying DOM extraction...');

        const domProducts = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="/product/"]'));
          return links.map(a => {
            const href = a.getAttribute('href');
            const match = href.match(/\/product\/.*?-(\d+)/);
            const id = match ? parseInt(match[1], 10) : null;
            const name = a.textContent.trim().substring(0, 100);
            return { ozon_id: id, url_path: href, name };
          }).filter(p => p.ozon_id);
        });

        for (const prod of domProducts) {
          if (seen.has(prod.ozon_id)) continue;
          seen.add(prod.ozon_id);
          products.push(prod);
          console.log(`    + ${prod.name}`);
        }
      }

      // Прокручиваем страницу
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.8);
      });

      // Случайная задержка
      await sleep(randomInt(1500, 3000));

      console.log(`  Total unique products: ${products.length}\n`);
    }

    console.log(`\n✅ Parsing complete!`);
    console.log(`📊 Total products collected: ${products.length}\n`);

    // Сохраняем в MongoDB если не dry-run
    if (!dryRun) {
      console.log('💾 Saving to MongoDB...');
      const client = new MongoClient(mongoUri);
      await client.connect();
      const db = client.db(dbName);
      const collection = db.collection(collectionName);

      const bulkOps = products.map(p => ({
        updateOne: {
          filter: { ozon_id: p.ozon_id },
          update: {
            $set: {
              ...p,
              updated_at: new Date()
            }
          },
          upsert: true
        }
      }));

      const result = await collection.bulkWrite(bulkOps);
      console.log(`✅ Saved: ${result.upsertedCount} new, ${result.modifiedCount} updated`);

      await client.close();
    } else {
      console.log('🔍 Dry run mode - not saving to database');
      console.log('\nSample products:');
      products.slice(0, 5).forEach((p, i) => {
        console.log(`${i + 1}. [${p.ozon_id}] ${p.name}`);
        console.log(`   ${p.url}`);
        console.log(`   Price: ${p.price_text || 'N/A'}`);
      });
    }

    console.log('\n⏳ Browser will stay open for 10 seconds...');
    await sleep(10000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
