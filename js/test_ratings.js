/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testRatings() {
  console.log('🔍 Testing rating/reviews extraction...\n');

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
      '--window-size=1366,768',
    ],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const pages = await browser.pages();
    let page = pages[0] || await browser.newPage();

    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await sleep(5000);

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

    // Scroll once
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(2000);

    // Analyze first product tile structure
    const tileAnalysis = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[class*="tile-root"]');
      if (tiles.length === 0) return { error: 'No tiles found' };

      const tile = tiles[0];

      // Get product name
      const allSpans = Array.from(tile.querySelectorAll('span'));
      const nameEl = allSpans.find(el => {
        const text = el.textContent.trim();
        return text.length > 20 && text.length < 300 &&
               !text.includes('₽') && !text.includes('%') &&
               !text.includes('баллов') && !text.includes('отзыв') &&
               !text.includes('Распродажа') && !text.includes('ября');
      });
      const name = nameEl ? nameEl.textContent.trim() : 'NOT FOUND';

      // Get delivery button
      const deliveryButton = tile.querySelector('button');
      const deliveryText = deliveryButton ? deliveryButton.textContent.trim() : 'NOT FOUND';

      // Find all elements between name and delivery button
      const allElements = Array.from(tile.querySelectorAll('*'));

      // Try to find rating/review elements
      const ratingElements = allElements.filter(el => {
        const text = el.textContent;
        return text && (text.match(/\d+\.?\d*/) || text.includes('отзыв'));
      });

      const ratingInfo = ratingElements.slice(0, 10).map(el => ({
        tag: el.tagName,
        class: el.className.substring(0, 50),
        text: el.textContent.trim().substring(0, 100),
        parent: el.parentElement?.tagName
      }));

      // Look specifically for rating stars or icons
      const svgElements = tile.querySelectorAll('svg');
      const svgInfo = Array.from(svgElements).slice(0, 5).map(svg => ({
        parent: svg.parentElement?.tagName,
        parentClass: svg.parentElement?.className.substring(0, 50),
        nextText: svg.parentElement?.textContent.trim().substring(0, 50)
      }));

      return {
        name,
        deliveryText,
        totalSpans: allSpans.length,
        ratingInfo,
        svgInfo
      };
    });

    console.log('📦 First Product Tile Analysis:\n');
    console.log('Name:', tileAnalysis.name);
    console.log('Delivery:', tileAnalysis.deliveryText);
    console.log('Total spans:', tileAnalysis.totalSpans);
    console.log('\n📊 Potential Rating/Review Elements:');
    tileAnalysis.ratingInfo.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag} class="${el.class}">`);
      console.log(`   Text: "${el.text}"`);
    });

    console.log('\n⭐ SVG Elements (likely rating stars):');
    tileAnalysis.svgInfo.forEach((svg, i) => {
      console.log(`${i + 1}. Parent: ${svg.parent}, Class: "${svg.parentClass}"`);
      console.log(`   Next text: "${svg.nextText}"`);
    });

    console.log('\n⏳ Browser will stay open for 30 seconds...');
    await sleep(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Done');
}

testRatings().catch(console.error);
