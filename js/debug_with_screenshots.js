const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 Debug scraper with screenshots\n');

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/tmp/chrome-puppeteer-profile',
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled', '--lang=ru-RU', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 },
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = (await browser.pages())[0];
    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
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

    // Scroll to category section
    console.log('📍 Scrolling to category section...\n');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const categoryEl = elements.find(el => el.textContent.includes('Категория'));
      if (categoryEl) {
        categoryEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    await sleep(3000);

    // Take screenshot of initial state
    await page.screenshot({ path: '/tmp/ozon_initial.png', fullPage: false });
    console.log('📸 Screenshot 1: /tmp/ozon_initial.png\n');

    // Scroll 10 times
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
      await sleep(2000);
    }

    await sleep(3000);
    await page.screenshot({ path: '/tmp/ozon_after_10_scrolls.png', fullPage: false });
    console.log('📸 Screenshot 2: /tmp/ozon_after_10_scrolls.png\n');

    // Extract all product data
    const results = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile-root"]');
      const products = [];

      tiles.forEach((tile, index) => {
        try {
          // Get product link
          const link = tile.querySelector('a[href*="/product/"]');
          if (!link) return;

          const href = link.getAttribute('href');
          const match = href.match(/\/product\/.*?-(\d+)/);

          const allSpans = Array.from(tile.querySelectorAll('span'));

          // Name
          const nameEl = allSpans.find(el => {
            const text = el.textContent.trim();
            return text.length > 20 && text.length < 300 &&
                   !text.includes('₽') && !text.includes('%') &&
                   !text.includes('баллов') && !text.includes('Распродажа');
          });
          const name = nameEl ? nameEl.textContent.trim() : null;

          products.push({
            index,
            ozon_id: match ? match[1] : 'NO_ID',
            url: href,
            name: name || 'NO NAME'
          });
        } catch (e) {
          products.push({
            index,
            error: e.message
          });
        }
      });

      return products;
    });

    console.log(`📊 Found ${results.length} product tiles\n`);
    console.log('First 20 products:\n');
    results.slice(0, 20).forEach(p => {
      console.log(`${p.index + 1}. [${p.ozon_id}] ${p.name.substring(0, 60)}`);
      if (p.error) console.log(`   ERROR: ${p.error}`);
    });

    // Continue scrolling to see if more products load
    console.log('\n🔄 Scrolling 50 more times...\n');
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
      await sleep(2000);

      if (i % 10 === 9) {
        const count = await page.evaluate(() => {
          return document.querySelectorAll('[class*="tile-root"]').length;
        });
        console.log(`  After ${i + 11} more scrolls: ${count} tiles`);
      }
    }

    await sleep(3000);
    await page.screenshot({ path: '/tmp/ozon_after_60_scrolls.png', fullPage: false });
    console.log('\n📸 Screenshot 3: /tmp/ozon_after_60_scrolls.png\n');

    // Final count
    const finalResults = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile-root"]');
      const uniqueIds = new Set();

      tiles.forEach(tile => {
        const link = tile.querySelector('a[href*="/product/"]');
        if (!link) return;
        const href = link.getAttribute('href');
        const match = href.match(/\/product\/.*?-(\d+)/);
        if (match) uniqueIds.add(match[1]);
      });

      return {
        totalTiles: tiles.length,
        uniqueProducts: uniqueIds.size,
        ids: Array.from(uniqueIds)
      };
    });

    console.log('\n📈 Final results:');
    console.log(`Total tiles: ${finalResults.totalTiles}`);
    console.log(`Unique product IDs: ${finalResults.uniqueProducts}`);
    console.log(`\nSample IDs: ${finalResults.ids.slice(0, 10).join(', ')}...`);

    // Save full data
    fs.writeFileSync('/tmp/debug_products.json', JSON.stringify(finalResults, null, 2));
    console.log('\n💾 Saved to /tmp/debug_products.json');

    console.log('\n⏳ Browser will stay open for 30 seconds...');
    await sleep(30000);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
