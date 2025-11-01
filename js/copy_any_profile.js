/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const profileName = process.argv[2] || 'Default';

async function copyChromeData() {
  console.log(`🔧 Copying Chrome profile data from: ${profileName}\n`);

  const sourceProfile = `/Users/mikhailzhirnov/Library/Application Support/Google/Chrome/${profileName}`;
  const targetProfile = '/tmp/chrome-puppeteer-profile/Default';

  if (!fs.existsSync(sourceProfile)) {
    console.error(`❌ Profile not found: ${sourceProfile}`);
    console.log('\nAvailable profiles:');
    const chromeBase = '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome';
    const profiles = fs.readdirSync(chromeBase)
      .filter(name => name === 'Default' || name.startsWith('Profile'));
    profiles.forEach(p => console.log(`   - ${p}`));
    process.exit(1);
  }

  // Создаем целевую директорию
  if (!fs.existsSync(targetProfile)) {
    fs.mkdirSync(targetProfile, { recursive: true });
  }

  // Копируем важные файлы
  const filesToCopy = [
    'Cookies',
    'Network/Cookies',
    'Local Storage',
    'Session Storage',
    'Preferences',
  ];

  console.log('📋 Copying files:');
  for (const file of filesToCopy) {
    const source = path.join(sourceProfile, file);
    const target = path.join(targetProfile, file);

    try {
      if (fs.existsSync(source)) {
        // Создаем родительскую директорию если нужно
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Копируем файл или директорию
        if (fs.statSync(source).isDirectory()) {
          execSync(`cp -r "${source}" "${target}"`);
        } else {
          fs.copyFileSync(source, target);
        }
        console.log(`✅ ${file}`);
      } else {
        console.log(`⚠️  ${file} (not found)`);
      }
    } catch (error) {
      console.log(`❌ ${file}: ${error.message}`);
    }
  }

  console.log(`\n✅ Profile data copied from ${profileName} to /tmp/chrome-puppeteer-profile`);
  console.log('');
  console.log('Now run: node ozon_image_search_puppeteer.js');
}

copyChromeData().catch(console.error);
