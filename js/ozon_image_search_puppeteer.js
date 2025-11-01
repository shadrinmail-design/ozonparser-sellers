const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function searchByImage(imageUrl) {
  console.log('🚀 Starting image search with Puppeteer...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--lang=ru-RU',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();

    // Load cookies from Chrome profile
    const cookiesPath = '/tmp/chrome-puppeteer-profile/Cookies';
    console.log('🍪 Loading cookies from Chrome profile...');

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🌐 Navigating to Ozon...');
    await page.goto('https://www.ozon.ru/', { waitUntil: 'networkidle2', timeout: 30000 });

    // Set cookies from file (if available)
    try {
      const cookiesString = fs.readFileSync(path.join(__dirname, '../ozon_cookies_converted.txt'), 'utf8').trim();
      if (cookiesString) {
        const cookies = cookiesString.split(';').map(c => {
          const [name, value] = c.trim().split('=');
          return { name, value, domain: '.ozon.ru' };
        });
        await page.setCookie(...cookies);
        console.log('✅ Cookies loaded');

        // Reload page with cookies
        await page.reload({ waitUntil: 'networkidle2' });
      }
    } catch (err) {
      console.log('⚠️  No cookies file found, continuing without cookies');
    }

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('📷 Looking for camera button...');

    // Find and click camera button
    const cameraButton = await page.$('button.rn6_29');
    if (!cameraButton) {
      throw new Error('Camera button not found');
    }

    console.log('✅ Camera button found, clicking...');
    await cameraButton.click();
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🔍 Looking for image URL input field...');

    // Find the image URL input (last visible text input, excluding main search)
    const inputSet = await page.evaluate((url) => {
      const inputs = document.querySelectorAll('input[type="text"]');
      let targetInput = null;

      // Get the last visible input (should be the image URL field)
      for (let i = inputs.length - 1; i >= 0; i--) {
        const inp = inputs[i];
        const rect = inp.getBoundingClientRect();
        // Skip the main search bar (has placeholder 'Искать на Ozon')
        if (rect.width > 0 && rect.height > 0 && inp.placeholder !== 'Искать на Ozon') {
          targetInput = inp;
          break;
        }
      }

      if (!targetInput) {
        return { success: false, error: 'Image URL input not found' };
      }

      // Focus and set value
      targetInput.focus();
      targetInput.click();
      targetInput.value = url;

      // Trigger events
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      return {
        success: true,
        value: targetInput.value,
        placeholder: targetInput.placeholder || '',
        classList: Array.from(targetInput.classList).join(' ')
      };
    }, imageUrl);

    console.log('📝 Input set result:', inputSet);

    if (!inputSet.success) {
      throw new Error(inputSet.error);
    }

    // Wait for Ozon to validate URL (button might auto-trigger or appear)
    console.log('⏳ Waiting for search to process...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Try to click "Найти" button (might not be needed if auto-triggered)
    console.log('🔘 Looking for search button...');
    const clickResult = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      let findBtn = null;

      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const text = btn.textContent.toLowerCase();
          if (text.includes('найти') || text.includes('search')) {
            findBtn = btn;
            break;
          }
        }
      }

      if (findBtn) {
        findBtn.click();
        return 'OK: Found and clicked search button';
      }

      return 'INFO: Search button not found (might auto-trigger)';
    });

    console.log('🔘 Click result:', clickResult);

    // Wait for results
    console.log('⏳ Waiting for search results...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Extract products
    console.log('📦 Extracting products...');
    const results = await page.evaluate((clickRes) => {
      try {
        const tiles = document.querySelectorAll('div[data-index]');
        const products = [];

        for (let i = 0; i < tiles.length; i++) {
          const tile = tiles[i];
          const link = tile.querySelector('a[href*="/product/"]');
          const url = link ? link.href : '';

          // Extract product ID from URL
          let id = 'N/A';
          if (url) {
            const idMatch = url.match(/product\/[^/]*-(\d+)/);
            if (idMatch) {
              id = idMatch[1];
            }
          }

          // Get title
          const spans = tile.querySelectorAll('span');
          let title = 'N/A';
          for (let k = 0; k < spans.length; k++) {
            const txt = spans[k].textContent.trim();
            if (txt.length > 10) {
              title = txt.substring(0, 100);
              break;
            }
          }

          products.push({
            index: i + 1,
            id: id,
            title: title,
            url: url
          });
        }

        return {
          success: true,
          total_count: tiles.length,
          click_result: clickRes,
          products: products
        };
      } catch(e) {
        return {
          success: false,
          error: e.message,
          click_result: clickRes
        };
      }
    }, clickResult);

    console.log('\n✅ Search completed!');
    console.log(`📊 Total products found: ${results.total_count}`);

    return results;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Keep browser open for inspection
    console.log('\n⏸️  Browser will stay open for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    if (browser) await browser.close();
  }
}

// Main execution
const imageUrl = process.argv[2] || 'https://ir.ozone.ru/s3/multimedia-1-5/wc600/7249026173.jpg';

searchByImage(imageUrl)
  .then(results => {
    console.log('\n📄 Results:');
    console.log(JSON.stringify(results, null, 2));
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
