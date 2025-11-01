const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testOzonImageSearchSafari(imageUrl) {
  console.log('🔍 Testing Ozon image search with Safari user agent...\n');
  console.log(`Image URL: ${imageUrl}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/tmp/chrome-puppeteer-safari-profile',
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU',
      '--window-size=1920,1080'
    ],
    defaultViewport: { width: 1920, height: 1080 },
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = (await browser.pages())[0];

    // Set Safari user agent
    const safariUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    await page.setUserAgent(safariUserAgent);

    console.log(`📱 User Agent set to Safari: ${safariUserAgent}\n`);

    // Go to Ozon main page
    console.log('📍 Opening Ozon.ru...');
    await page.goto('https://www.ozon.ru/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await sleep(3000);

    // Close cookie banner
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cookieButton = buttons.find(btn => btn.textContent.toLowerCase().includes('ок'));
        if (cookieButton) cookieButton.click();
      });
      await sleep(1000);
    } catch (e) {}

    // Look for camera/image search button
    console.log('🔍 Looking for image search button...\n');

    // Take screenshot first
    await page.screenshot({ path: '/tmp/ozon_safari_main.png', fullPage: false });
    console.log('📸 Screenshot saved to /tmp/ozon_safari_main.png\n');

    // Look for camera icon
    const cameraIconInfo = await page.evaluate(() => {
      // Look for camera icon near search bar
      const allElements = Array.from(document.querySelectorAll('button, a, svg, [role="button"]'));
      const results = [];

      for (const el of allElements) {
        const html = el.outerHTML.toLowerCase();
        const text = el.textContent;

        // Check for camera-related classes or SVG paths
        if (html.includes('camera') ||
            html.includes('photo') ||
            html.includes('image-search') ||
            html.includes('поиск') && html.includes('изображ')) {
          results.push({
            tag: el.tagName,
            class: el.className,
            html: el.outerHTML.substring(0, 300),
            text: text.substring(0, 100)
          });
        }
      }

      // Also check for specific SVG icons near search
      const svgs = Array.from(document.querySelectorAll('svg'));
      const searchBar = document.querySelector('input[placeholder*="искать"], input[placeholder*="Искать"]');

      if (searchBar) {
        const searchContainer = searchBar.closest('form, div[class*="search"], header');
        if (searchContainer) {
          const nearbySvgs = searchContainer.querySelectorAll('svg, button');
          results.push({
            searchBarFound: true,
            nearbySvgCount: nearbySvgs.length,
            nearbySvgs: Array.from(nearbySvgs).slice(0, 5).map(s => ({
              html: s.outerHTML.substring(0, 200)
            }))
          });
        }
      }

      return results;
    });

    console.log('Camera icon search results:');
    console.log(JSON.stringify(cameraIconInfo, null, 2));

    // Try clicking on search input to see if camera appears
    console.log('\n🖱️  Clicking on search input...');
    await page.click('input[placeholder*="Искать"]');
    await sleep(2000);

    await page.screenshot({ path: '/tmp/ozon_safari_search_focused.png', fullPage: false });
    console.log('📸 Screenshot after focus: /tmp/ozon_safari_search_focused.png\n');

    // Check again after focus
    const cameraAfterFocus = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const cameraButtons = [];

      for (const btn of buttons) {
        const html = btn.outerHTML.toLowerCase();
        const hasCamera = html.includes('camera') ||
                         html.includes('фото') ||
                         html.includes('изображен');

        if (hasCamera) {
          cameraButtons.push({
            html: btn.outerHTML.substring(0, 300),
            visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
            rect: btn.getBoundingClientRect()
          });
        }
      }

      return cameraButtons;
    });

    console.log('Camera buttons after focus:');
    console.log(JSON.stringify(cameraAfterFocus, null, 2));

    console.log('\n⏳ Browser will stay open for 60 seconds to examine...');
    await sleep(60000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Test with a sample image URL
const testImageUrl = 'https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg';
testOzonImageSearchSafari(testImageUrl).catch(console.error);
