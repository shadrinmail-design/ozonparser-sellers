/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 Checking ratings in live browser...\n');

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

    // Scroll a bit more to load products
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
      await sleep(2000);
    }

    console.log('⏳ Waiting for ratings to load...\n');
    await sleep(3000);

    const results = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile-root"]');
      const products = [];

      for (let i = 0; i < Math.min(10, tiles.length); i++) {
        const tile = tiles[i];
        const allSpans = Array.from(tile.querySelectorAll('span'));

        // Name
        const nameEl = allSpans.find(el => {
          const text = el.textContent.trim();
          return text.length > 20 && text.length < 300 &&
                 !text.includes('₽') && !text.includes('%') &&
                 !text.includes('баллов') && !text.includes('Распродажа');
        });
        const name = nameEl ? nameEl.textContent.trim().substring(0, 50) : 'Unknown';

        // Rating
        let rating = null;
        const ratingSpan = allSpans.find(el => {
          const style = el.getAttribute('style');
          const text = el.textContent.trim();
          return style && style.includes('var(--textPremium)') && /^\d+\.\d+$/.test(text);
        });
        if (ratingSpan) rating = ratingSpan.textContent.trim();

        // Reviews
        let reviews = null;
        const reviewsSpan = allSpans.find(el => {
          const style = el.getAttribute('style');
          const text = el.textContent.trim();
          return style && style.includes('var(--textSecondary)') && text.match(/\d+\s*(отзыв|отзыва|отзывов)/);
        });
        if (reviewsSpan) reviews = reviewsSpan.textContent.trim();

        products.push({ index: i, name, rating, reviews });
      }

      return products;
    });

    console.log('📊 Results:\n');
    results.forEach(p => {
      console.log(`${p.index + 1}. ${p.name}`);
      console.log(`   Rating: ${p.rating || 'NOT FOUND'}`);
      console.log(`   Reviews: ${p.reviews || 'NOT FOUND'}`);
      console.log('');
    });

    const withRating = results.filter(p => p.rating).length;
    const withReviews = results.filter(p => p.reviews).length;
    console.log(`\n✅ Success rate: ${withRating}/10 ratings, ${withReviews}/10 reviews\n`);

    console.log('⏳ Browser will stay open for 30 seconds...');
    await sleep(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
