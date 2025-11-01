/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function helpManualLogin() {
  console.log('🔓 Manual Login Helper\n');
  console.log('This script will:');
  console.log('1. Open Chrome with a clean temporary profile');
  console.log('2. Let you manually log in to Ozon');
  console.log('3. Save the cookies for future use\n');

  const tempDir = '/tmp/chrome-manual-login';

  // Удаляем старый профиль
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: tempDir,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU',
    ],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('🌐 Opening Ozon...\n');
  await page.goto('https://www.ozon.ru/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('⏸️  Please manually log in to Ozon in the opened Chrome window');
  console.log('   Press ENTER when you are logged in...');

  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  console.log('\n💾 Saving cookies...');

  const cookies = await page.cookies();
  const cookiesPath = '/tmp/ozon_cookies.json';
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));

  console.log(`✅ Cookies saved to: ${cookiesPath}`);
  console.log(`   Total cookies: ${cookies.length}`);

  // Also save to the puppeteer profile location
  const targetDir = '/tmp/chrome-puppeteer-profile/Default';
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy cookies and storage
  const { execSync } = require('child_process');
  try {
    execSync(`cp -r "${tempDir}/Default/Cookies" "${targetDir}/" 2>/dev/null || true`);
    execSync(`cp -r "${tempDir}/Default/Local Storage" "${targetDir}/" 2>/dev/null || true`);
    execSync(`cp -r "${tempDir}/Default/Session Storage" "${targetDir}/" 2>/dev/null || true`);
    console.log('✅ Cookies copied to /tmp/chrome-puppeteer-profile/Default');
  } catch (error) {
    console.log('⚠️  Could not copy cookies:', error.message);
  }

  console.log('\n✅ Done! Now you can run:');
  console.log('   node ozon_image_search_puppeteer.js');

  await browser.close();

  // Cleanup manual login profile
  fs.rmSync(tempDir, { recursive: true, force: true });
}

helpManualLogin().catch(console.error);
