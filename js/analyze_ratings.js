/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeRatings() {
  console.log('🔍 Analyzing ratings structure...\n');

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/tmp/chrome-puppeteer-profile',
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU',
      '--window-size=1366,768',
    ],
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

    // Scroll to load more products
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2000);

    const analysis = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile-root"]');
      const results = [];

      for (let i = 0; i < Math.min(5, tiles.length); i++) {
        const tile = tiles[i];

        // Get product name
        const nameEl = Array.from(tile.querySelectorAll('span')).find(el => {
          const text = el.textContent.trim();
          return text.length > 20 && text.length < 300 &&
                 !text.includes('₽') && !text.includes('%') &&
                 !text.includes('баллов') && !text.includes('Распродажа');
        });
        const name = nameEl ? nameEl.textContent.trim().substring(0, 50) : 'Unknown';

        // Get ALL text content
        const allText = tile.innerText;

        // Find all elements with numbers
        const allSpans = Array.from(tile.querySelectorAll('span, div'));
        const numbersFound = [];

        allSpans.forEach(el => {
          const text = el.textContent.trim();
          // Look for rating patterns (e.g., "4.5", "4.8")
          const ratingMatch = text.match(/^(\d+\.\d+)$/);
          if (ratingMatch) {
            numbersFound.push({
              type: 'rating_candidate',
              value: ratingMatch[1],
              class: el.className.substring(0, 50),
              parent: el.parentElement?.className.substring(0, 50)
            });
          }

          // Look for review patterns (e.g., "123 отзыва")
          const reviewMatch = text.match(/(\d+)\s*(отзыв|отзыва|отзывов)/);
          if (reviewMatch) {
            numbersFound.push({
              type: 'reviews',
              value: reviewMatch[1],
              text: text,
              class: el.className.substring(0, 50)
            });
          }
        });

        results.push({
          index: i,
          name,
          numbersFound,
          textPreview: allText.substring(0, 300)
        });
      }

      return results;
    });

    console.log('📊 Analysis Results:\n');
    analysis.forEach(item => {
      console.log(`${item.index + 1}. ${item.name}`);
      console.log('   Numbers found:');
      item.numbersFound.forEach(num => {
        console.log(`     ${num.type}: ${num.value} ${num.text || ''}`);
        console.log(`       class: ${num.class}`);
      });
      console.log('   Text preview:', item.textPreview.replace(/\n/g, ' '));
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

analyzeRatings().catch(console.error);
