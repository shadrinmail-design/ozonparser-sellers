#!/usr/bin/env node

/**
 * Парсинг через УЖЕ ЗАПУЩЕННЫЙ Chrome браузер (Remote Debugging)
 * Используйте ваш обычный Chrome с Profile 5
 */

const puppeteer = require('puppeteer-core');

async function parseWithActiveChrome(startUrl, maxScrolls = 10) {
  console.log('\n🔗 Connecting to active Chrome...\n');

  let browser;
  try {
    // Подключаемся к активному Chrome
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });

    console.log('✅ Connected to Chrome!\n');

    const pages = await browser.pages();
    console.log(`📄 Found ${pages.length} open pages`);

    // Создаем новую вкладку или используем существующую
    let page = pages.find(p => p.url().includes('ozon.ru')) || await browser.newPage();

    const targetUrl = `https://www.ozon.ru${startUrl}`;
    console.log(`🌐 Navigating to: ${targetUrl}\n`);

    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('⏳ Waiting for products to load...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Прокрутка и сбор товаров
    const products = new Set();

    for (let scroll = 0; scroll < maxScrolls; scroll++) {
      console.log(`📜 Scroll ${scroll + 1}/${maxScrolls}...`);

      // Извлекаем ссылки на товары
      const links = await page.evaluate(() => {
        const productLinks = Array.from(document.querySelectorAll('a[href*="/product/"]'));
        return productLinks.map(a => a.href).filter(href => /product\/[^\/]*-\d+/.test(href));
      });

      const before = products.size;
      links.forEach(link => products.add(link));
      const found = products.size - before;

      console.log(`   Found ${found} new products (total: ${products.size})`);

      // Прокрутка вниз
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n✅ Collected ${products.size} unique products\n`);

    // Извлекаем ID товаров
    const productData = Array.from(products).map(url => {
      const match = url.match(/product\/[^\/]*-(\d+)/);
      return {
        id: match ? match[1] : null,
        url: url
      };
    }).filter(p => p.id);

    console.log('📦 Sample products:');
    productData.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i + 1}. ID: ${p.id}`);
    });

    return productData;

  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Chrome не запущен с remote debugging!');
      console.log('   Запустите Chrome так:');
      console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="/Users/mikhailzhirnov/Library/Application Support/Google/Chrome/Profile 5"\n');
    }

    throw error;
  } finally {
    if (browser) {
      // НЕ закрываем браузер - он ваш активный!
      await browser.disconnect();
    }
  }
}

// Если запущен напрямую
if (require.main === module) {
  const startUrl = process.argv[2] || '/seller/guangzhouganxinmaoyidian-3366398';
  const maxScrolls = parseInt(process.argv[3] || '10');

  console.log('🚀 Ozon Parser - Active Chrome Mode\n');
  console.log('📍 URL:', startUrl);
  console.log('📜 Scrolls:', maxScrolls);

  parseWithActiveChrome(startUrl, maxScrolls)
    .then(products => {
      console.log(`\n✅ Done! Total products: ${products.length}\n`);
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { parseWithActiveChrome };
