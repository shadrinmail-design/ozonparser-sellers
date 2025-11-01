/* eslint-disable no-console */
const { MongoClient } = require('mongodb');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const { URL } = require('url');
const pLimit = require('p-limit');
const ProxyChain = require('proxy-chain');

puppeteer.use(StealthPlugin());

const BASE = 'https://www.ozon.ru';
const DEFAULT_START = '/highlight/tovary-iz-kitaya-935133/?from_global=true';

function env(name, def) {
  const v = process.env[name];
  return v == null || v === '' ? def : v;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function buildUA() {
  const ua = new UserAgent({ deviceCategory: 'desktop' });
  return ua.toString();
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

function toFloat(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(',', '.').trim();
    const f = parseFloat(s);
    return Number.isFinite(f) ? f : undefined;
  }
}

function toInt(v) {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    return m ? parseInt(m[0], 10) : undefined;
  }
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

  let priceText;
  const priceSources = [
    getNested(tile, ['price', 'price']),
    getNested(tile, ['price', 'priceString']),
    getNested(item, ['price', 'priceString']),
    getNested(item, ['price', 'price']),
  ];
  for (const p of priceSources) {
    if (typeof p === 'string' && p.trim()) { priceText = p; break; }
  }

  let ratingValue;
  for (const rv of [getNested(tile, ['rating', 'value']), item.ratingValue, item.rating]) {
    const f = toFloat(rv);
    if (f != null && f >= 0 && f <= 5) { ratingValue = f; break; }
  }

  let reviewsCount;
  for (const rc of [getNested(tile, ['rating', 'count']), item.reviewsCount, item.feedbackCount, item.reviewCount, cell.feedbackCount]) {
    const iv = toInt(rc);
    if (iv != null) { reviewsCount = iv; break; }
  }

  if (!pid && !urlPath) return undefined;
  const prod = { ozon_id: pid, name, url_path: urlPath, price_text: priceText };
  if (urlPath) prod.url = BASE + urlPath;
  if (ratingValue != null) prod.rating_value = ratingValue;
  if (reviewsCount != null) prod.reviews_count = reviewsCount;
  return prod;
}

function collectByKeyContains(states, keys) {
  const res = [];
  const keysL = keys.map(k => k.toLowerCase());
  for (const st of states) {
    const stack = [[[], st]];
    while (stack.length) {
      const [path, obj] = stack.pop();
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => stack.push([path.concat(String(i)), v]));
      } else if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          const lp = k.toLowerCase();
          if (keysL.some(x => lp.includes(x))) res.push(v);
          stack.push([path.concat(k), v]);
        }
      }
    }
  }
  return res;
}

function parseDelivery(states) {
  const texts = [];
  const scope = ['deliver', 'eta', 'slot', 'date', 'period', 'time'];
  for (const st of states) {
    const stack = [[[], st]];
    while (stack.length) {
      const [path, obj] = stack.pop();
      const joined = path.join('/').toLowerCase();
      if (scope.some(k => joined.includes(k))) {
        if (typeof obj === 'string' && obj.trim()) texts.push(obj.trim());
      }
      if (Array.isArray(obj)) obj.forEach((v, i) => stack.push([path.concat(String(i)), v]));
      else if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) stack.push([path.concat(k), v]);
      }
    }
  }
  let isoDate;
  for (const t of texts) {
    const m1 = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (m1) { isoDate = m1[1]; break; }
    const m2 = t.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
    if (m2) { isoDate = `${m2[3]}-${m2[2]}-${m2[1]}`; break; }
  }
  return { delivery_texts: [...new Set(texts)].slice(0, 20), delivery_min_date: isoDate };
}

function computeDeliveryDays(iso) {
  try {
    if (!iso) return undefined;
    const [y, m, d] = iso.split('-').map(x => parseInt(x, 10));
    const today = new Date();
    const target = new Date(Date.UTC(y, m - 1, d));
    const diff = Math.round((target - new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))) / 86400000);
    return diff;
  } catch (_) { return undefined; }
}

async function applyCookiesFromHeader(page, cookieHeader) {
  if (!cookieHeader) return;
  const url = new URL(BASE);
  const pairs = cookieHeader.split(';').map(s => s.trim()).filter(Boolean);
  const cookies = pairs.map(pair => {
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    return { name, value, domain: `.${url.hostname}`, path: '/', httpOnly: false };
  });
  try { await page.setCookie(...cookies); } catch (_) {}
}

async function createBrowser() {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-features=IsolateOrigins,site-per-process,TranslateUI',
    '--blink-settings=imagesEnabled=true',
    '--disable-blink-features=AutomationControlled'
  ];
  let proxyUrl = process.env.ALL_PROXY || process.env.SOCKS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  let proxyServer = null;
  if (proxyUrl) {
    if (/^socks(4|5)/i.test(proxyUrl)) {
      // pass SOCKS proxy directly to Chromium
      args.push(`--proxy-server=${proxyUrl}`);
    } else {
      // anonymize HTTP(S) proxy to avoid auth popups
      proxyServer = await ProxyChain.anonymizeProxy(proxyUrl);
      args.push(`--proxy-server=${proxyServer}`);
    }
  }
  const ua = buildUA();
  const headless = process.env.HEADLESS !== '0';

  // Поддержка Chrome профиля с куками (для обхода блокировки)
  const launchOptions = {
    headless,
    args,
    defaultViewport: { width: randomInt(1280, 1440), height: randomInt(800, 960) },
  };

  const chromeProfile = process.env.CHROME_PROFILE;
  if (chromeProfile) {
    launchOptions.userDataDir = chromeProfile;
    launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    launchOptions.ignoreDefaultArgs = ['--enable-automation'];
    // Добавляем аргументы для лучшей маскировки
    launchOptions.args.push('--disable-web-security');
    launchOptions.args.push('--no-first-run');
    launchOptions.args.push('--no-default-browser-check');
    console.log(`[INFO] Using Chrome profile: ${chromeProfile}`);
  }

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await page.setUserAgent(ua);
  await page.setExtraHTTPHeaders({
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
  });
  await page.emulateTimezone('Europe/Moscow');
  return { browser, page, proxyServer };
}

function getNextPageUrlFromStates(states) {
  for (const st of states) {
    const tryObj = (obj) => {
      if (obj && typeof obj === 'object') {
        const url = obj.url || obj.link || obj.href;
        if (typeof url === 'string' && url.startsWith('/')) return url;
      }
    };
    const a = tryObj(st.nextPage);
    if (a) return a;
    if (st.data) {
      const b = tryObj(st.data.nextPage || st.data.next || st.data.loadMore);
      if (b) return b;
    }
  }
  return undefined;
}

async function scrapeListing({ startPath, maxScrolls }) {
  // Try composer API first, then fallback to DOM
  const useAPI = process.env.USE_API !== '0';

  if (useAPI) {
    const { browser, page, proxyServer } = await createBrowser();
    const products = [];
    const seen = new Set();
    const cookieHeader = process.env.OZON_COOKIES || '';
    if (cookieHeader) {
      try { await applyCookiesFromHeader(page, cookieHeader); } catch (_) {}
    }
    // Navigate to establish same-origin context for composer fetches
    await page.goto(BASE + startPath, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 }).catch(() => {});

    let path = startPath;
    for (let i = 0; i < maxScrolls && path; i += 1) {
      // Use in-page fetch to composer API to avoid 403s
      const result = await page.evaluate(async (p) => {
        const u = `https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=${encodeURIComponent(p)}`;
        try {
          const r = await fetch(u, { credentials: 'include' });
          const status = r.status;
          if (!r.ok) return { error: `HTTP ${status}`, status };
          const data = await r.json();
          return { data, status };
        } catch (e) {
          return { error: e.message };
        }
      }, path).catch((e) => ({ error: e.message }));
      console.log(`[DEBUG] Page ${i+1}: status=${result.status}, error=${result.error}, hasData=${!!result.data}`);
      if (!result.data || !result.data.widgetStates) break;
      const data = result.data;
      console.log(`[DEBUG] Page ${i+1}: data=${!!data}, widgetStates=${!!data?.widgetStates}`);
      if (!data || !data.widgetStates) break;
      const states = parseWidgetStates(data.widgetStates);
      console.log(`[DEBUG] Parsed ${states.length} widget states`);
      for (const st of states) {
        const key = st.__state_key || '';
        const lk = String(key).toLowerCase();
        if (!(['search', 'catalog', 'collection', 'product', 'shelf', 'list'].some(s => lk.includes(s)))) continue;
        const items = extractItems(st);
        console.log(`[DEBUG] State key=${key}, items=${items.length}`);
        for (const item of items) {
          const prod = extractProduct(item);
          if (!prod) continue;
          const pid = prod.ozon_id || prod.url_path;
          if (seen.has(pid)) continue;
          seen.add(pid);
          products.push(prod);
        }
      }
      const next = getNextPageUrlFromStates(states);
      if (!next) break;
      path = next;
      await sleep(randomInt(800, 1600));
    }

    await browser.close();
    if (proxyServer) await ProxyChain.closeAnonymizedProxy(proxyServer, true).catch(() => {});
    if (products.length > 0) return products;
  }

  console.log('[INFO] Using DOM extraction fallback');
  // Fallback: DOM extraction of product links with scrolling
  const { browser: b2, page: p2, proxyServer: pr2 } = await createBrowser();
  const cookieHeader = process.env.OZON_COOKIES || '';
  if (cookieHeader) {
    try { await applyCookiesFromHeader(p2, cookieHeader); } catch (_) {}
  }
  console.log('[DEBUG] Navigating to', BASE + startPath);
  await p2.goto(BASE + startPath, { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for page content to load - try different selectors
  console.log('[DEBUG] Waiting for page content...');
  await p2.waitForSelector('a[href*="/product/"]', { timeout: 30000 }).catch(() => {
    console.log('[WARN] No product links found by selector');
  });
  await sleep(3000); // Additional wait for dynamic content

  // Take screenshot for debugging
  const screenshotPath = '/tmp/ozon_page.png';
  await p2.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[DEBUG] Screenshot saved to ${screenshotPath}`);

  // Get page HTML for debugging
  const html = await p2.content();
  const htmlPath = '/tmp/ozon_page.html';
  require('fs').writeFileSync(htmlPath, html);
  console.log(`[DEBUG] HTML saved to ${htmlPath}, length: ${html.length}`);

  const linkSet = new Set();
  for (let i = 0; i < maxScrolls; i += 1) {
    const paths = await p2.evaluate(() => {
      const hrefs = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
      const out = [];
      for (const h of hrefs) {
        if (!h) continue;
        try {
          const u = new URL(h, location.origin);
          if (u.pathname.startsWith('/product/')) out.push(u.pathname + (u.search || ''));
        } catch (_) { /* ignore */ }
      }
      return out;
    }).catch(() => []);
    console.log(`[DEBUG] Scroll ${i+1}: found ${paths.length} product links, total unique: ${linkSet.size}`);
    for (const p of paths) linkSet.add(p);
    await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(randomInt(800, 1600));
    await p2.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});
  }
  const list = Array.from(linkSet).map(h => ({ url_path: h, url: BASE + h }));
  await b2.close();
  if (pr2) await ProxyChain.closeAnonymizedProxy(pr2, true).catch(() => {});
  return list;
}

async function scrapeDetailsBulk(products, concurrency = 3) {
  const limit = pLimit(concurrency);
  const results = await Promise.all(products.map(p => limit(async () => {
    if (!p.url_path) return p;
    const { browser, page, proxyServer } = await createBrowser();
    const cookieHeader = process.env.OZON_COOKIES || '';
    if (cookieHeader) {
      try { await applyCookiesFromHeader(page, cookieHeader); } catch (_) {}
    }
    const statesAll = [];
    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!url.includes('/api/composer-api.bx/page/json')) return;
        if (res.status() !== 200) return;
        const data = await res.json();
        statesAll.push(...parseWidgetStates(data.widgetStates));
      } catch (_) {}
    });
    try {
      await page.goto(BASE + p.url_path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 }).catch(() => {});
      const vals = collectByKeyContains(statesAll, ['rating', 'averageRating', 'ratingValue']);
      const rating = vals.map(toFloat).filter(x => x != null && x >= 0 && x <= 5).sort((a,b)=>b-a)[0];
      const rcands = collectByKeyContains(statesAll, ['reviewsCount','feedbackCount','ratingCount','count']);
      const reviews = rcands.map(toInt).filter(x => x != null).sort((a,b)=>b-a)[0];
      const del = parseDelivery(statesAll);
      const delivery_days = computeDeliveryDays(del.delivery_min_date);
      const titleCands = collectByKeyContains(statesAll, ['productTitle','title','name']).filter(x => typeof x === 'string');
      const brandCands = collectByKeyContains(statesAll, ['brand','brandName']).filter(x => typeof x === 'string');
      const priceCands = collectByKeyContains(statesAll, ['priceString','finalPrice','price']).filter(x => typeof x === 'string');
      const name = titleCands.find(x => x && x.length > 2) || p.name;
      const brand = brandCands.find(x => x && x.length > 1);
      const price_text = priceCands.find(x => x && x.length > 1) || p.price_text;
      return { ...p, rating_value: rating ?? p.rating_value, reviews_count: reviews ?? p.reviews_count, ...del, delivery_days, brand, name, price_text };
    } catch (_) {
      return p;
    } finally {
      await browser.close();
      if (proxyServer) await ProxyChain.closeAnonymizedProxy(proxyServer, true).catch(()=>{});
    }
  })));
  return results;
}

async function upsertProducts(uri, dbName, collection, products) {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(dbName).collection(collection);
    await col.createIndex({ ozon_id: 1 }, { unique: true, sparse: true }).catch(()=>{});
    await col.createIndex({ url: 1 }, { sparse: true }).catch(()=>{});
    await col.createIndex({ reviews_count: 1 }).catch(()=>{});
    await col.createIndex({ rating_value: 1 }).catch(()=>{});
    const now = new Date();
    const ops = [];
    for (const p of products) {
      if (!p) continue;
      const doc = { ...p, updated_at: now };
      const pid = p.ozon_id || p.url || p.url_path;
      if (p.ozon_id) doc._id = p.ozon_id;
      ops.push({ replaceOne: { filter: { _id: doc._id ?? pid }, replacement: doc, upsert: true } });
    }
    if (!ops.length) return { upserted: 0 };
    const res = await col.bulkWrite(ops, { ordered: false });
    return { upserted: res.upsertedCount, modified: res.modifiedCount };
  } finally {
    await client.close();
  }
}

async function upsertMetrics(uri, dbName, metricsCollection, products) {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(dbName).collection(metricsCollection);
    await col.createIndex({ date: 1, ozon_id: 1 }).catch(()=>{});
    const day = new Date().toISOString().slice(0,10);
    const ops = [];
    for (const p of products) {
      const key = `${day}:${p.ozon_id || p.url || p.url_path}`;
      const doc = {
        _id: key,
        date: day,
        ozon_id: p.ozon_id,
        name: p.name,
        price_text: p.price_text,
        rating_value: p.rating_value,
        reviews_count: p.reviews_count,
        delivery_min_date: p.delivery_min_date,
        delivery_days: p.delivery_days,
        url: p.url,
        brand: p.brand,
      };
      ops.push({ replaceOne: { filter: { _id: key }, replacement: doc, upsert: true } });
    }
    if (!ops.length) return { upserted: 0 };
    const res = await col.bulkWrite(ops, { ordered: false });
    return { upserted: res.upsertedCount, modified: res.modifiedCount };
  } finally {
    await client.close();
  }
}

async function main() {
  const startPath = env('OZON_START_URL', DEFAULT_START);
  const maxScrolls = parseInt(env('MAX_SCROLLS', '50'), 10);
  const doDetails = env('NO_DETAILS', '') === '';
  const dryRun = env('DRY_RUN', '') !== '' || env('NO_DB', '') !== '';
  const doMetrics = env('METRICS', '') !== '';
  const concurrency = parseInt(env('DETAILS_CONCURRENCY', '2'), 10);
  const mongoUri = env('MONGODB_URI', 'mongodb://localhost:27017');
  const dbName = env('MONGO_DB', 'ozon');
  const collection = env('MONGO_COLLECTION', 'products');
  const metricsCollection = env('MONGO_METRICS_COLLECTION', 'products_metrics');

  console.log('starting', { startPath, maxScrolls, doDetails, concurrency, dryRun });
  const products = await scrapeListing({ startPath, maxScrolls });
  console.log('listing_collected', products.length);
  const enriched = doDetails ? await scrapeDetailsBulk(products, concurrency) : products;
  console.log('details_done', enriched.length);
  if (dryRun) {
    console.log('dry_run_count', enriched.length);
  } else {
    const upRes = await upsertProducts(mongoUri, dbName, collection, enriched);
    console.log('mongo_upsert', upRes);
    if (doMetrics) {
      const mRes = await upsertMetrics(mongoUri, dbName, metricsCollection, enriched);
      console.log('mongo_metrics', mRes);
    }
  }
}

if (require.main === module) {
  main().catch((err) => { console.error('fatal', err); process.exit(1); });
}
