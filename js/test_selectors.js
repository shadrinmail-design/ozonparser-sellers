/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/tmp/chrome-puppeteer-profile',
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled', '--lang=ru-RU', '--window-size=1366,768'],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = (await browser.pages())[0];
    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await sleep(5000);

    // Close cookie banner
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cookieButton = buttons.find(btn => btn.textContent.toLowerCase().includes('ок'));
        if (cookieButton) cookieButton.click();
      });
      await sleep(1000);
    } catch (e) {}

    // Scroll once
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2000);

    const testResults = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile-root"]');
      const results = [];

      for (let i = 0; i < Math.min(3, tiles.length); i++) {
        const tile = tiles[i];

        // Get product name
        const allSpans = Array.from(tile.querySelectorAll('span'));
        const nameEl = allSpans.find(el => {
          const text = el.textContent.trim();
          return text.length > 20 && text.length < 300 &&
                 !text.includes('₽') && !text.includes('%') &&
                 !text.includes('баллов') && !text.includes('Распродажа');
        });
        const name = nameEl ? nameEl.textContent.trim().substring(0, 50) : 'Unknown';

        // Test rating selector
        const ratingSpan = allSpans.find(el => {
          const style = el.getAttribute('style');
          const text = el.textContent.trim();
          return style && style.includes('--textPremium') && /^\d+\.\d+$/.test(text);
        });

        // Test reviews selector
        const reviewsSpan = allSpans.find(el => {
          const style = el.getAttribute('style');
          const text = el.textContent.trim();
          return style && style.includes('--textSecondary') && text.match(/\d+\s*(отзыв|отзыва|отзывов)/);
        });

        results.push({
          index: i,
          name,
          ratingFound: ratingSpan ? ratingSpan.textContent.trim() : 'NOT FOUND',
          ratingStyle: ratingSpan ? ratingSpan.getAttribute('style').substring(0, 100) : 'N/A',
          reviewsFound: reviewsSpan ? reviewsSpan.textContent.trim() : 'NOT FOUND',
          reviewsStyle: reviewsSpan ? reviewsSpan.getAttribute('style').substring(0, 100) : 'N/A',
          allSpansCount: allSpans.length
        });
      }

      return results;
    });

    console.log('🔍 Selector Test Results:\n');
    testResults.forEach(item => {
      console.log(`${item.index + 1}. ${item.name}`);
      console.log(`   Total spans: ${item.allSpansCount}`);
      console.log(`   Rating: ${item.ratingFound}`);
      console.log(`   Rating style: ${item.ratingStyle}`);
      console.log(`   Reviews: ${item.reviewsFound}`);
      console.log(`   Reviews style: ${item.reviewsStyle}`);
      console.log('');
    });

    console.log('\n⏳ Browser will stay open for 30 seconds...');
    await sleep(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
