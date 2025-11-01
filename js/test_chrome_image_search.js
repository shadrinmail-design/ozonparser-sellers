const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function testImageSearch() {
  console.log('🔍 Testing Ozon image search in Chrome...');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome/Default',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🌐 Navigating to Ozon...');
    await page.goto('https://www.ozon.ru/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('📷 Checking for image search elements...');

    const elements = await page.evaluate(() => {
      const result = {
        camera_buttons: [],
        file_inputs: [],
        all_buttons_in_header: [],
        page_title: document.title,
        user_logged_in: false
      };

      // Check if user is logged in
      const userElements = document.querySelectorAll('[class*="user"], [class*="profile"], [class*="account"]');
      result.user_logged_in = userElements.length > 0;

      // Find ALL buttons in header/search area
      const allButtons = document.querySelectorAll('button');
      allButtons.forEach((btn, idx) => {
        if (idx < 20) { // First 20 buttons only
          const rect = btn.getBoundingClientRect();
          result.all_buttons_in_header.push({
            index: idx,
            classList: Array.from(btn.classList).join(' '),
            visible: rect.width > 0 && rect.height > 0,
            innerHTML: btn.innerHTML.substring(0, 150),
            ariaLabel: btn.getAttribute('aria-label') || ''
          });
        }
      });

      // Find camera buttons (various selectors)
      const cameraSelectors = [
        'button.rn6_29',
        'button[class*="rn6"]',
        'button[class*="camera"]',
        'button[aria-label*="изображ"]',
        'button[aria-label*="фото"]'
      ];

      cameraSelectors.forEach(sel => {
        const btns = document.querySelectorAll(sel);
        btns.forEach((btn, idx) => {
          const rect = btn.getBoundingClientRect();
          result.camera_buttons.push({
            selector: sel,
            index: idx,
            classList: Array.from(btn.classList).join(' '),
            visible: rect.width > 0 && rect.height > 0
          });
        });
      });

      // Find file inputs
      const fileInputs = document.querySelectorAll('input[type="file"]');
      fileInputs.forEach((inp, idx) => {
        const rect = inp.getBoundingClientRect();
        result.file_inputs.push({
          index: idx,
          id: inp.id || '',
          name: inp.name || '',
          accept: inp.accept || '',
          classList: Array.from(inp.classList).join(' '),
          visible: rect.width > 0 && rect.height > 0
        });
      });

      return result;
    });

    console.log('\n📊 Found elements:');
    console.log(JSON.stringify(elements, null, 2));

    console.log('\n⏸️  Browser will stay open for 60 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 60000));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testImageSearch();
