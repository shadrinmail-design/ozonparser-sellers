/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findTiles() {
  console.log('🔍 Finding product tile structure...\n');

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

    console.log('🔎 Analyzing product tile structure...\n');

    const tileAnalysis = await page.evaluate(() => {
      // Strategy: find a product link, go up to find the tile container
      const firstProductLink = document.querySelector('a[href*="/product/"]');
      if (!firstProductLink) return { error: 'No product links found' };

      let current = firstProductLink;
      const path = [];

      // Go up and analyze structure
      for (let i = 0; i < 15; i++) {
        if (!current) break;

        const tagName = current.tagName;
        const classes = current.className;
        const dataWidget = current.getAttribute('data-widget');
        const childCount = current.children.length;
        const spanCount = current.querySelectorAll('span').length;
        const imgCount = current.querySelectorAll('img').length;
        const linkCount = current.querySelectorAll('a[href*="/product/"]').length;

        path.push({
          level: i,
          tagName,
          classes: classes ? classes.substring(0, 50) : null,
          dataWidget,
          childCount,
          spanCount,
          imgCount,
          linkCount
        });

        current = current.parentElement;
      }

      // Now find the likely tile container - it should have:
      // - Multiple spans (for product info)
      // - An image
      // - Product links
      // - Reasonable number of children

      const likelyTile = path.find(p =>
        p.spanCount > 10 &&
        p.spanCount < 100 &&
        p.imgCount >= 1 &&
        p.linkCount >= 1
      );

      // Find ALL tiles using the same structure
      let allTiles = [];
      if (likelyTile && likelyTile.dataWidget) {
        const selector = `[data-widget="${likelyTile.dataWidget}"]`;
        allTiles = Array.from(document.querySelectorAll(selector)).slice(0, 3);
      }

      // Extract sample data from first tile
      let sampleData = null;
      if (allTiles.length > 0) {
        const tile = allTiles[0];

        // Try to find name
        const allSpans = Array.from(tile.querySelectorAll('span'));
        const longSpans = allSpans.filter(s => s.textContent.trim().length > 20 && s.textContent.trim().length < 200);

        sampleData = {
          linkHref: tile.querySelector('a[href*="/product/"]')?.getAttribute('href'),
          spanCount: allSpans.length,
          longSpansCount: longSpans.length,
          longSpansSample: longSpans.slice(0, 3).map(s => s.textContent.trim().substring(0, 60)),
          priceSpans: allSpans.filter(s => s.textContent.includes('₽')).map(s => s.textContent.trim()),
          deliverySpans: allSpans.filter(s => {
            const t = s.textContent;
            return t.includes('ября') || t.includes('Завтра') || t.includes('Сегодня');
          }).map(s => s.textContent.trim())
        };
      }

      return {
        path,
        likelyTile,
        allTilesCount: allTiles.length,
        sampleData
      };
    });

    console.log('DOM Path Analysis:');
    tileAnalysis.path.forEach(p => {
      console.log(`Level ${p.level}: ${p.tagName} (${p.childCount} children, ${p.spanCount} spans, ${p.imgCount} imgs, ${p.linkCount} links)`);
      if (p.dataWidget) console.log(`  data-widget="${p.dataWidget}"`);
      if (p.classes) console.log(`  class="${p.classes}"`);
    });

    console.log('\n📦 Likely Tile Container:');
    console.log(JSON.stringify(tileAnalysis.likelyTile, null, 2));

    console.log(`\n✅ Found ${tileAnalysis.allTilesCount} tiles with this structure`);

    console.log('\n📋 Sample Data from First Tile:');
    console.log(JSON.stringify(tileAnalysis.sampleData, null, 2));

    console.log('\n⏳ Browser will stay open for 30 seconds...');
    await sleep(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\n✅ Done');
}

findTiles().catch(console.error);
