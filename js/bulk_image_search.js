const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execFileAsync = promisify(execFile);

/**
 * Массовый поиск похожих товаров по изображениям
 *
 * Алгоритм:
 * 1. Получить товары из MongoDB (или из JSON файла)
 * 2. Для каждого товара взять URL главного изображения
 * 3. Запустить поиск по изображению через Safari
 * 4. Сохранить результаты в файл JSON
 */

/**
 * Load products from MongoDB or JSON file
 * @returns {Promise<Array>} - Products with images
 */
async function loadProducts() {
  // Для начала будем читать из JSON файла
  const productsFile = process.env.PRODUCTS_FILE || './products_for_image_search.json';

  try {
    const data = await fs.readFile(productsFile, 'utf8');
    const products = JSON.parse(data);
    console.log(`✅ Loaded ${products.length} products from ${productsFile}`);
    return products;
  } catch (error) {
    console.error(`❌ Failed to load products: ${error.message}`);
    console.log('💡 Tip: Export products from MongoDB first:');
    console.log('   mongoexport --uri="mongodb://..." --collection=products --out=products.json');
    return [];
  }
}

/**
 * Search by image using Safari automation
 * @param {string} imageUrl - URL of product image
 * @returns {Promise<Object>} - Search results
 */
async function searchByImage(imageUrl) {
  console.log(`🔍 Searching for: ${imageUrl}`);

  const scriptPath = path.join(__dirname, 'ozon_image_search_full.applescript');

  try {
    const { stdout, stderr } = await execFileAsync('osascript', [scriptPath, imageUrl], {
      timeout: 60000 // 60 seconds
    });

    if (stderr) {
      console.error('AppleScript stderr:', stderr);
    }

    const result = JSON.parse(stdout.trim());

    if (result.success) {
      console.log(`✅ Found ${result.total_count} similar products`);
    } else {
      console.error(`❌ Search failed: ${result.error || 'Unknown error'}`);
    }

    return result;

  } catch (error) {
    console.error(`❌ Search failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      total_count: 0,
      products: []
    };
  }
}

/**
 * Delay between searches to avoid rate limiting
 * @param {number} ms - Milliseconds to wait
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Save search results to file
 * @param {string} filename - Output filename
 * @param {Object} data - Data to save
 */
async function saveResults(filename, data) {
  await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved results to ${filename}`);
}

/**
 * Main function: process all products
 */
async function main() {
  const startTime = Date.now();

  // Load products
  const products = await loadProducts();

  if (products.length === 0) {
    console.error('❌ No products to process');
    process.exit(1);
  }

  // Get limit from environment
  const limit = parseInt(process.env.LIMIT || '0');
  const productsToProcess = limit > 0 ? products.slice(0, limit) : products;

  console.log(`\n📦 Processing ${productsToProcess.length} products...\n`);

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < productsToProcess.length; i++) {
    const product = productsToProcess[i];

    console.log(`\n[${i + 1}/${productsToProcess.length}] Product: ${product.id || product.sku}`);
    console.log(`   Title: ${(product.title || product.name || '').substring(0, 60)}...`);

    // Get main image URL
    let imageUrl = null;

    // Try different possible image field names
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      imageUrl = product.images[0];
    } else if (product.image) {
      imageUrl = product.image;
    } else if (product.picture) {
      imageUrl = product.picture;
    } else if (product.photo) {
      imageUrl = product.photo;
    }

    if (!imageUrl) {
      console.log('   ⚠️  No image found, skipping...');
      failCount++;
      continue;
    }

    console.log(`   Image: ${imageUrl.substring(0, 60)}...`);

    // Search by image
    const searchResult = await searchByImage(imageUrl);

    // Save result
    results.push({
      source_product: {
        id: product.id || product.sku,
        title: product.title || product.name,
        image: imageUrl,
        price: product.price,
        url: product.url
      },
      search_result: searchResult,
      searched_at: new Date().toISOString()
    });

    if (searchResult.success) {
      successCount++;
    } else {
      failCount++;
    }

    // Save progress after each search
    await saveResults('image_search_results.json', {
      total_processed: i + 1,
      total_products: productsToProcess.length,
      success_count: successCount,
      fail_count: failCount,
      results: results
    });

    // Delay between searches (Safari needs time to reset)
    if (i < productsToProcess.length - 1) {
      const delayMs = parseInt(process.env.DELAY_MS || '5000');
      console.log(`   ⏳ Waiting ${delayMs}ms before next search...`);
      await delay(delayMs);
    }
  }

  // Final summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log('✅ COMPLETED!');
  console.log('='.repeat(60));
  console.log(`Total processed: ${results.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Results saved to: image_search_results.json`);
  console.log('='.repeat(60));
}

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  loadProducts,
  searchByImage,
  saveResults
};
