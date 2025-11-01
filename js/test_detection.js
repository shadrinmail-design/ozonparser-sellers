/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function testDetection() {
  console.log('🔍 Testing browser detection...\n');

  const browser = await puppeteer.launch({
    headless: false, // видимый режим
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1366, height: 768 },
  });

  const page = await browser.newPage();

  // Устанавливаем обычный User-Agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  await page.setExtraHTTPHeaders({
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
  });

  await page.emulateTimezone('Europe/Moscow');

  console.log('📋 Checking detection signals...\n');

  // Проверяем признаки автоматизации
  const detectionResults = await page.evaluate(() => {
    const results = {
      // WebDriver detection
      hasWebdriver: navigator.webdriver !== undefined,
      webdriverValue: navigator.webdriver,

      // Chrome detection
      hasChrome: !!window.chrome,
      chromeRuntime: !!window.chrome?.runtime,

      // Automation flags
      hasAutomation: !!(window.navigator.webdriver),

      // Permissions
      permissionsQuery: navigator.permissions ? 'exists' : 'missing',

      // Plugins
      pluginsLength: navigator.plugins.length,

      // Languages
      languages: navigator.languages,

      // Platform
      platform: navigator.platform,

      // Headless indicators
      headlessCheck: {
        // Некоторые headless браузеры не имеют этих свойств
        hasNotifications: 'Notification' in window,
        hasPermissions: 'permissions' in navigator,
        hasConnection: 'connection' in navigator,
        hasBattery: 'getBattery' in navigator,
      },

      // Canvas fingerprint test
      canvasTest: (() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (!gl) return 'no-webgl';
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return 'no-debug-info';
        return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      })(),

      // Проверка iframe
      iframeTest: window.top === window.self,

      // User agent
      userAgent: navigator.userAgent,
    };

    return results;
  });

  console.log('Detection Results:');
  console.log(JSON.stringify(detectionResults, null, 2));
  console.log('\n');

  // Теперь пробуем открыть Ozon
  console.log('🌐 Opening Ozon...\n');

  try {
    const response = await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Response status:', response.status());
    console.log('Response URL:', response.url());

    // Проверяем, что на странице
    await page.waitForTimeout(2000);

    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        hasBlockMessage: document.body.innerText.includes('Доступ ограничен'),
        hasProducts: document.querySelectorAll('[data-widget="searchResultsV2"]').length > 0,
        bodyLength: document.body.innerText.length,
      };
    });

    console.log('\nPage Info:');
    console.log(JSON.stringify(pageInfo, null, 2));

    // Делаем скриншот
    await page.screenshot({ path: '/tmp/ozon_detection_test.png', fullPage: true });
    console.log('\n📸 Screenshot saved to /tmp/ozon_detection_test.png');

    // Ждем 10 секунд чтобы посмотреть
    console.log('\n⏳ Waiting 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('Error:', error.message);
  }

  await browser.close();
  console.log('\n✅ Test complete');
}

testDetection().catch(console.error);
