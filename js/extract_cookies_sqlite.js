/* eslint-disable no-console */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const profileName = process.argv[2] || 'Default';

console.log(`🔍 Extracting cookies from ${profileName}...\n`);

const sourceProfile = `/Users/mikhailzhirnov/Library/Application Support/Google/Chrome/${profileName}`;
const cookiesDb = path.join(sourceProfile, 'Cookies');

if (!fs.existsSync(cookiesDb)) {
  console.error(`❌ Cookies database not found: ${cookiesDb}`);
  process.exit(1);
}

// Копируем файл кук во временную локацию (чтобы избежать блокировки)
const tempCookies = '/tmp/cookies_temp.db';
if (fs.existsSync(tempCookies)) {
  fs.unlinkSync(tempCookies);
}

fs.copyFileSync(cookiesDb, tempCookies);

console.log('📊 Extracting Ozon cookies from database...\n');

try {
  // Извлекаем куки для ozon.ru используя sqlite3
  const query = `SELECT name, value, host_key, path, expires_utc, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%ozon.ru%'`;

  const result = execSync(`sqlite3 "${tempCookies}" "${query}"`, { encoding: 'utf8' });

  const lines = result.trim().split('\n').filter(l => l);

  console.log(`Found ${lines.length} Ozon cookies:\n`);

  if (lines.length === 0) {
    console.log('❌ No Ozon cookies found in this profile');
    console.log('💡 This means you are NOT logged in to Ozon in this profile\n');

    // Показываем все профили
    console.log('Available Chrome profiles:');
    const chromeBase = '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome';
    const profiles = fs.readdirSync(chromeBase)
      .filter(name => name === 'Default' || name.startsWith('Profile'));
    profiles.forEach(p => console.log(`   - ${p}`));
    console.log('\nTry another profile: node extract_cookies_sqlite.js "Profile 1"');

  } else {
    lines.forEach((line, i) => {
      const parts = line.split('|');
      console.log(`${i + 1}. ${parts[0]} = ${parts[1].substring(0, 30)}...`);
    });

    console.log('\n✅ This profile HAS Ozon cookies!');
    console.log(`\n💡 Copy this profile:\n   node copy_any_profile.js "${profileName}"`);
  }

  // Cleanup
  fs.unlinkSync(tempCookies);

} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n💡 Make sure sqlite3 is installed: brew install sqlite3');
  if (fs.existsSync(tempCookies)) {
    fs.unlinkSync(tempCookies);
  }
}
