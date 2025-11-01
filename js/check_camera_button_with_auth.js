/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function checkCameraButton() {
  console.log('🔍 Checking for camera button with Profile 5 cookies...\n');

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
      '--disable-web-security',
    ],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('🌐 Navigating to Ozon...\n');
  await page.goto('https://www.ozon.ru/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('📊 Checking page status...\n');

  const pageInfo = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      isBlocked: document.body.innerText.includes('Доступ ограничен'),

      // Check login status
      loginButton: Array.from(document.querySelectorAll('button, a'))
        .find(el => el.textContent.toLowerCase().includes('войти')) !== undefined,

      profileMenu: document.querySelector('[data-widget="profileMenu"]') !== null,

      // Check for camera button with various selectors
      cameraButtons: {
        'button.rn6_29': document.querySelectorAll('button.rn6_29').length,
        'button[class*="rn6"]': document.querySelectorAll('button[class*="rn6"]').length,
        'button[class*="camera"]': document.querySelectorAll('button[class*="camera"]').length,
        'input[type="file"]': document.querySelectorAll('input[type="file"]').length,
      },

      // Get all buttons in header area
      headerButtons: Array.from(document.querySelectorAll('header button, [role="banner"] button'))
        .slice(0, 10)
        .map(btn => ({
          text: btn.textContent.trim().substring(0, 50),
          classes: btn.className,
          ariaLabel: btn.getAttribute('aria-label')
        })),

      // Check user agent
      userAgent: navigator.userAgent,
      platform: navigator.platform,

      bodyPreview: document.body.innerText.substring(0, 300)
    };
  });

  console.log('📋 Page Info:');
  console.log(`   Title: ${pageInfo.title}`);
  console.log(`   URL: ${pageInfo.url}`);
  console.log(`   Blocked: ${pageInfo.isBlocked ? '❌ YES' : '✅ NO'}`);
  console.log(`   Login button visible: ${pageInfo.loginButton ? '❌ YES (not logged in)' : '✅ NO (logged in)'}`);
  console.log(`   Profile menu: ${pageInfo.profileMenu ? '✅ YES' : '❌ NO'}`);
  console.log('');

  console.log('📷 Camera Button Search:');
  Object.entries(pageInfo.cameraButtons).forEach(([selector, count]) => {
    console.log(`   ${selector}: ${count} found`);
  });
  console.log('');

  console.log('🔘 Header Buttons (first 10):');
  pageInfo.headerButtons.forEach((btn, i) => {
    if (btn.text) {
      console.log(`   ${i + 1}. "${btn.text}" (${btn.classes.substring(0, 30)})`);
    }
  });
  console.log('');

  console.log('🌐 Browser Info:');
  console.log(`   User-Agent: ${pageInfo.userAgent.substring(0, 100)}...`);
  console.log(`   Platform: ${pageInfo.platform}`);
  console.log('');

  console.log('📄 Body preview:');
  console.log(pageInfo.bodyPreview);
  console.log('');

  // Take screenshot
  await page.screenshot({ path: '/tmp/ozon_auth_check.png', fullPage: true });
  console.log('📸 Screenshot saved: /tmp/ozon_auth_check.png');

  console.log('\n⏸️  Browser will stay open for 60 seconds for inspection...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  await browser.close();
}

checkCameraButton().catch(console.error);
