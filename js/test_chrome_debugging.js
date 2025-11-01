/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testChromeDebugging() {
  console.log('🚀 Подключение к уже запущенному Chrome...\n');
  console.log('📋 Инструкция:');
  console.log('');
  console.log('1. Закройте ВСЕ окна Google Chrome');
  console.log('2. Запустите Chrome с remote debugging:');
  console.log('');
  console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\');
  console.log('     --remote-debugging-port=9222 \\');
  console.log('     --user-data-dir="/Users/mikhailzhirnov/Library/Application Support/Google/Chrome" \\');
  console.log('     --profile-directory="Profile 5" &');
  console.log('');
  console.log('3. Откройте https://www.ozon.ru в этом Chrome');
  console.log('4. Запустите этот скрипт снова');
  console.log('');
  console.log('⏳ Waiting 3 seconds...');
  await sleep(3000);

  let browser;
  try {
    // Подключаемся к уже запущенному Chrome
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
    });

    console.log('✅ Connected to Chrome!\n');

    const pages = await browser.pages();
    console.log(`📄 Found ${pages.length} open tabs`);

    // Ищем вкладку с Ozon или создаем новую
    let ozonPage = pages.find(p => p.url().includes('ozon.ru'));

    if (!ozonPage) {
      console.log('🆕 Creating new tab for Ozon...');
      ozonPage = await browser.newPage();
      await ozonPage.goto('https://www.ozon.ru/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await sleep(2000);
    } else {
      console.log('✅ Found existing Ozon tab');
    }

    // Переходим на целевую страницу
    console.log('🌐 Navigating to target page...\n');
    const response = await ozonPage.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('📊 Response status:', response.status());
    console.log('📊 Response URL:', response.url());

    await sleep(3000);

    // Проверяем результат
    const pageInfo = await ozonPage.evaluate(() => {
      return {
        title: document.title,
        hasBlockMessage: document.body.innerText.includes('Доступ ограничен'),
        productLinksCount: document.querySelectorAll('a[href*="/product/"]').length,
        searchWidgets: document.querySelectorAll('[data-widget*="searchResults"]').length,
        bodyPreview: document.body.innerText.substring(0, 300),
      };
    });

    console.log('\n📋 Page Info:');
    console.log('Title:', pageInfo.title);
    console.log('Blocked?:', pageInfo.hasBlockMessage);
    console.log('Product links:', pageInfo.productLinksCount);
    console.log('Search widgets:', pageInfo.searchWidgets);
    console.log('');

    if (pageInfo.hasBlockMessage) {
      console.log('❌ Still blocked!');
      await ozonPage.screenshot({ path: '/tmp/ozon_debugging_blocked.png', fullPage: true });
      console.log('📸 Screenshot: /tmp/ozon_debugging_blocked.png');
    } else {
      console.log('✅ SUCCESS! No block detected!');
      console.log(`✅ Found ${pageInfo.productLinksCount} product links`);
      await ozonPage.screenshot({ path: '/tmp/ozon_debugging_success.png', fullPage: true });
      console.log('📸 Screenshot: /tmp/ozon_debugging_success.png');

      // Попробуем получить данные через Composer API
      console.log('\n🔍 Testing Composer API...');
      const apiResult = await ozonPage.evaluate(async () => {
        const url = 'https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=%2Fhighlight%2Ftovary-iz-kitaya-935133%2F%3Ffrom_global%3Dtrue';
        try {
          const r = await fetch(url, { credentials: 'include' });
          return {
            status: r.status,
            ok: r.ok,
            hasData: r.ok ? !!(await r.json()).widgetStates : false
          };
        } catch (e) {
          return { error: e.message };
        }
      });

      console.log('API Result:', apiResult);
    }

    console.log('\n⏳ Keeping connection for 20 seconds...');
    await sleep(20000);

    // НЕ закрываем браузер, только отключаемся
    await browser.disconnect();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Chrome не запущен с remote debugging!');
      console.log('   Выполните команду из инструкции выше.');
    }
  }

  console.log('\n✅ Test complete');
}

testChromeDebugging().catch(console.error);
