const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function testAuthProxy() {
  const proxyHost = '95.181.175.97';
  const proxyPort = '40628';
  const proxyUser = 'c6ef988dd0';
  const proxyPass = '968df8d6c1';

  console.log(`Testing authenticated proxy: ${proxyHost}:${proxyPort}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=http://${proxyHost}:${proxyPort}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      executablePath: '/usr/bin/google-chrome',
    });

    const page = await browser.newPage();

    // Authenticate with proxy
    await page.authenticate({
      username: proxyUser,
      password: proxyPass,
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to Ozon...');
    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const content = await page.content();
    const title = await page.title();

    console.log(`Page title: ${title}`);

    // Save page content and screenshot for analysis
    fs.writeFileSync('/tmp/ozon_auth_proxy_page.html', content);
    await page.screenshot({ path: '/tmp/ozon_auth_proxy_page.png', fullPage: true });

    if (content.includes('Доступ ограничен') || content.includes('Access denied')) {
      console.log(`❌ Proxy BLOCKED by Ozon`);

      // Try to get the blocked IP
      const blockedIpMatch = content.match(/<b>IP:<\/b>\s*([\d\.]+)/);
      if (blockedIpMatch) {
        console.log(`Blocked IP: ${blockedIpMatch[1]}`);
      }
    } else if (content.includes('товар') || content.includes('Товары из Китая')) {
      console.log(`✅ Proxy SUCCESS! Page loaded correctly`);
      return true;
    } else {
      console.log(`⚠️  Unknown page content (${content.length} chars)`);
      console.log('First 500 chars:', content.substring(0, 500));
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return false;
}

testAuthProxy().catch(console.error);
