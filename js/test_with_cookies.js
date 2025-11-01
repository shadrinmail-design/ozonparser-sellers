/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWithCookies() {
  console.log('🚀 Starting test with cookies and improved stealth...\n');

  // Проверяем наличие файла с куками
  const cookiesFile = path.join(__dirname, 'cookies.txt');
  const cookiesJsonFile = path.join(__dirname, 'cookies.json');

  let cookies = [];

  if (fs.existsSync(cookiesJsonFile)) {
    console.log('✅ Found cookies.json');
    cookies = JSON.parse(fs.readFileSync(cookiesJsonFile, 'utf8'));
  } else if (fs.existsSync(cookiesFile)) {
    console.log('✅ Found cookies.txt');
    const cookieStr = fs.readFileSync(cookiesFile, 'utf8').trim();
    // Конвертируем строку кук в формат Puppeteer
    cookies = cookieStr.split('; ').map(c => {
      const [name, ...v] = c.split('=');
      return {
        name: name.trim(),
        value: v.join('=').trim(),
        domain: '.ozon.ru',
        path: '/'
      };
    });
  } else {
    console.log('⚠️  No cookies file found!');
    console.log('   Create cookies.txt or cookies.json in js/ folder');
    console.log('   Run: node get_cookies.js for instructions\n');
  }

  const browser = await puppeteer.launch({
    headless: false, // видимый режим
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--lang=ru-RU',
      // Эмулируем обычный браузер
      '--window-size=1366,768',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
    defaultViewport: null, // используем размер окна
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  // Устанавливаем куки ДО навигации
  if (cookies.length > 0) {
    console.log(`🍪 Setting ${cookies.length} cookies...`);
    await page.setCookie(...cookies);
  }

  // Устанавливаем правильные заголовки
  await page.setExtraHTTPHeaders({
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webgl,image/apng,*/*;q=0.8',
    'accept-encoding': 'gzip, deflate, br',
    'cache-control': 'max-age=0',
  });

  await page.emulateTimezone('Europe/Moscow');

  // Дополнительно маскируем признаки автоматизации
  await page.evaluateOnNewDocument(() => {
    // Удаляем webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Фиксим chrome.runtime
    window.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };

    // Фиксим languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ru-RU', 'ru', 'en-US', 'en'],
    });

    // Фиксим plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  console.log('🌐 Opening Ozon with improved stealth...\n');

  try {
    // Сначала идем на главную, чтобы установить сессию
    console.log('Step 1: Going to homepage...');
    await page.goto('https://www.ozon.ru/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Случайная задержка
    await sleep(2000 + Math.random() * 1000);

    // Эмулируем движение мыши
    await page.mouse.move(100, 100);
    await sleep(500);
    await page.mouse.move(200, 200);
    await sleep(300);

    console.log('Step 2: Going to target page...');
    const response = await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('\nResponse status:', response.status());
    console.log('Response URL:', response.url());

    // Ждем загрузки
    await sleep(3000);

    // Проверяем результат
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        hasBlockMessage: document.body.innerText.includes('Доступ ограничен'),
        hasProducts: document.querySelectorAll('[data-widget*="searchResults"]').length > 0,
        productCount: document.querySelectorAll('a[href*="/product/"]').length,
        bodyText: document.body.innerText.substring(0, 200),
      };
    });

    console.log('\n📊 Page Info:');
    console.log(JSON.stringify(pageInfo, null, 2));

    if (pageInfo.hasBlockMessage) {
      console.log('\n❌ Still blocked!');
      await page.screenshot({ path: '/tmp/ozon_with_cookies.png', fullPage: true });
      console.log('📸 Screenshot saved to /tmp/ozon_with_cookies.png');
    } else {
      console.log('\n✅ SUCCESS! No block message detected!');
      console.log(`Found ${pageInfo.productCount} product links`);
      await page.screenshot({ path: '/tmp/ozon_success.png', fullPage: true });
      console.log('📸 Screenshot saved to /tmp/ozon_success.png');
    }

    console.log('\n⏳ Keeping browser open for 15 seconds for manual inspection...');
    await sleep(15000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  await browser.close();
  console.log('\n✅ Test complete');
}

testWithCookies().catch(console.error);
