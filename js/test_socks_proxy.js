const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function testSOCKSProxy() {
  console.log('Testing SOCKS5 proxy on localhost:1080');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--proxy-server=socks5://127.0.0.1:1080',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      executablePath: '/usr/bin/google-chrome',
    });

    const page = await browser.newPage();

    // Load cookies if available
    const cookieEnv = process.env.OZON_COOKIES;
    if (cookieEnv) {
      console.log('Loading cookies from environment');
      // Parse cookies and add them
      const cookies = cookieEnv.split('; ').map(c => {
        const [name, ...valueParts] = c.split('=');
        return {
          name: name.trim(),
          value: valueParts.join('=').trim(),
          domain: '.ozon.ru',
          path: '/',
        };
      });
      await page.setCookie(...cookies);
    }

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to Ozon...');
    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const content = await page.content();
    const title = await page.title();

    console.log(`Page title: ${title}`);
    console.log(`Content length: ${content.length} chars`);

    // Save page content and screenshot for analysis
    fs.writeFileSync('/tmp/ozon_socks_page.html', content);
    await page.screenshot({ path: '/tmp/ozon_socks_page.png', fullPage: true });

    if (content.includes('Доступ ограничен') || content.includes('Access denied')) {
      console.log(`❌ SOCKS proxy BLOCKED by Ozon`);

      // Try to get the blocked IP
      const blockedIpMatch = content.match(/<b>IP:<\/b>\s*([\d\.]+)/);
      if (blockedIpMatch) {
        console.log(`Blocked IP: ${blockedIpMatch[1]}`);
      }
    } else if (content.includes('товар') || content.includes('Товары из Китая') || content.includes('ozon')) {
      console.log(`✅ SOCKS proxy SUCCESS! Page loaded correctly`);

      // Check if we got product data
      const productCount = (content.match(/widget":{"skuId"/g) || []).length;
      console.log(`Found ${productCount} product widgets in page`);

      return true;
    } else {
      console.log(`⚠️  Unknown page content`);
      console.log('Content preview:', content.substring(0, 300));
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return false;
}

testSOCKSProxy().catch(console.error);
