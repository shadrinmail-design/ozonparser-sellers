/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function debugSelectors() {
  console.log('🔍 Debugging selectors...\n');

  const tempUserDataDir = '/tmp/chrome-puppeteer-profile';

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: tempUserDataDir,
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
    let page = pages[0] || await browser.newPage();

    console.log('📍 Going to Ozon page...');
    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('⏳ Waiting for page to fully load...');
    await sleep(5000); // Wait longer for dynamic content

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
      await sleep(1000);
    } catch (e) {
      // ignore
    }

    console.log('\n🔎 Checking data-widget attributes...\n');
    const widgetInfo = await page.evaluate(() => {
      const widgets = document.querySelectorAll('[data-widget]');
      const widgetNames = new Set();
      widgets.forEach(w => {
        const name = w.getAttribute('data-widget');
        widgetNames.add(name);
      });

      return {
        totalWidgets: widgets.length,
        uniqueWidgetNames: Array.from(widgetNames),
        searchResults: document.querySelectorAll('[data-widget*="searchResult"]').length
      };
    });

    console.log('Total widgets:', widgetInfo.totalWidgets);
    console.log('Unique widget names:');
    widgetInfo.uniqueWidgetNames.forEach(name => console.log('  -', name));
    console.log('Search result widgets:', widgetInfo.searchResults);

    console.log('\n🔎 Trying different selectors...\n');
    const selectorTests = await page.evaluate(() => {
      const results = [];

      const selectors = [
        '[data-widget="searchResultsV2"]',
        '[data-widget*="searchResult"]',
        '[data-widget="searchResultsV2"] > div',
        '[data-widget="searchResultsV2"] > div > div',
        'a[href*="/product/"]',
        '[data-widget="webGallery"]',
        '[data-widget="webProductHeading"]',
      ];

      selectors.forEach(sel => {
        const elements = document.querySelectorAll(sel);
        results.push({
          selector: sel,
          count: elements.length
        });
      });

      return results;
    });

    console.log('Selector test results:');
    selectorTests.forEach(test => {
      console.log(`  ${test.selector}: ${test.count} elements`);
    });

    console.log('\n🔎 Looking for product links...\n');
    const linkInfo = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/product/"]');
      const samples = [];

      for (let i = 0; i < Math.min(5, links.length); i++) {
        const link = links[i];
        samples.push({
          href: link.getAttribute('href'),
          text: link.textContent.substring(0, 50).trim(),
          parent: link.parentElement.tagName,
          grandparent: link.parentElement.parentElement?.tagName
        });
      }

      return {
        totalLinks: links.length,
        samples
      };
    });

    console.log('Product links found:', linkInfo.totalLinks);
    console.log('\nSample links:');
    linkInfo.samples.forEach((s, i) => {
      console.log(`${i + 1}. ${s.href}`);
      console.log(`   Text: ${s.text}`);
      console.log(`   DOM: ${s.grandparent} > ${s.parent} > A`);
    });

    console.log('\n⏳ Browser will stay open for 30 seconds...');
    await sleep(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Debug complete');
}

debugSelectors().catch(console.error);
