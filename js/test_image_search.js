const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testOzonImageSearch(imageUrl) {
  console.log('🔍 Testing Ozon image search...\n');
  console.log(`Image URL: ${imageUrl}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/tmp/chrome-puppeteer-profile',
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

    // Try to find the camera icon in search bar
    const cameraIconFound = await page.evaluate(() => {
      // Look for SVG camera icon or button with camera
      const svgs = Array.from(document.querySelectorAll('svg, button, a, [class*="camera"], [class*="image"], [class*="photo"]'));

      for (const el of svgs) {
        const html = el.outerHTML.toLowerCase();
        const text = el.textContent.toLowerCase();

        if (html.includes('camera') ||
            html.includes('photo') ||
            text.includes('фото') ||
            text.includes('изображен')) {
          console.log('Found potential camera element:', el.outerHTML.substring(0, 200));
          return true;
        }
      }

      // Check for input type="file" for image upload
      const fileInputs = document.querySelectorAll('input[type="file"]');
      if (fileInputs.length > 0) {
        console.log('Found file input:', fileInputs[0].outerHTML);
        return true;
      }

      return false;
    });

    if (cameraIconFound) {
      console.log('✅ Found potential image search element');
    } else {
      console.log('❌ No obvious image search button found');
    }

    // Take screenshot
    await page.screenshot({ path: '/tmp/ozon_main_page.png', fullPage: false });
    console.log('\n📸 Screenshot saved to /tmp/ozon_main_page.png');

    // Try to find search input and look nearby
    console.log('\n🔍 Analyzing search bar area...');
    const searchInfo = await page.evaluate(() => {
      const searchInput = document.querySelector('input[type="text"][name*="text"], input[placeholder*="искать"]');
      if (searchInput) {
        const parent = searchInput.parentElement;
        const siblings = Array.from(parent.children);

        return {
          found: true,
          inputHTML: searchInput.outerHTML.substring(0, 200),
          parentHTML: parent.outerHTML.substring(0, 500),
          siblingCount: siblings.length,
          siblings: siblings.map(s => ({
            tag: s.tagName,
            classes: s.className,
            html: s.outerHTML.substring(0, 150)
          }))
        };
      }
      return { found: false };
    });

    console.log('Search bar info:', JSON.stringify(searchInfo, null, 2));

    console.log('\n⏳ Browser will stay open for 30 seconds to examine...');
    await sleep(30000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Test with a sample image URL
const testImageUrl = 'https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg';
testOzonImageSearch(testImageUrl).catch(console.error);
