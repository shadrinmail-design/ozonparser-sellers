const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

/**
 * Search Ozon by image URL using Safari automation
 * @param {string} imageUrl - URL of the image to search
 * @returns {Promise<Object>} - Search results
 */
async function searchByImage(imageUrl) {
  console.log(`🔍 Starting image search for: ${imageUrl}`);

  const scriptPath = path.join(__dirname, 'ozon_image_search.applescript');

  try {
    // Run AppleScript with image URL as argument
    const { stdout, stderr } = await execFileAsync('osascript', [scriptPath, imageUrl], {
      timeout: 60000 // 60 second timeout
    });

    console.log('AppleScript output:', stdout);

    if (stderr) {
      console.error('AppleScript errors:', stderr);
    }

    // Parse the result
    const result = parseSearchResult(stdout);

    return result;

  } catch (error) {
    console.error('❌ Image search failed:', error.message);

    if (error.message.includes('Allow JavaScript from Apple Events')) {
      throw new Error(
        'Safari не настроен для автоматизации. Включите: Safari → Develop → Allow JavaScript from Apple Events'
      );
    }

    throw error;
  }
}

/**
 * Parse AppleScript output to extract search results
 * @param {string} output - Raw AppleScript output (now JSON)
 * @returns {Object} - Parsed result
 */
function parseSearchResult(output) {
  try {
    // AppleScript now returns JSON with product data
    const data = JSON.parse(output.trim());

    if (data.success) {
      console.log(`✅ Found ${data.total_count} products`);
      return {
        success: true,
        totalCount: data.total_count,
        products: data.products,
        error: null
      };
    } else {
      return {
        success: false,
        totalCount: 0,
        products: [],
        error: data.error || 'Unknown error'
      };
    }
  } catch (e) {
    console.error('Failed to parse JSON, trying old format...');

    // Fallback to old format parsing
    const result = {
      success: false,
      totalCount: 0,
      products: [],
      error: output
    };

    if (output.includes('OK') && !output.includes('ERROR')) {
      result.success = true;
    }

    return result;
  }
}

/**
 * Get products from Ozon search results page
 * This will be called after image search completes
 * @param {string} searchUrl - URL of search results page
 * @returns {Promise<Array>} - Array of products
 */
async function extractProductsFromResults(searchUrl) {
  // This function will scrape products from the search results
  // Similar to existing scraper but for image search results
  console.log(`📦 Extracting products from: ${searchUrl}`);

  // TODO: Implement product extraction
  // For now, return empty array
  return [];
}

module.exports = {
  searchByImage,
  extractProductsFromResults
};

// Test if run directly
if (require.main === module) {
  const testImageUrl = process.argv[2] || 'https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg';

  searchByImage(testImageUrl)
    .then(result => {
      console.log('\n✅ Search completed:');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('\n❌ Search failed:', error.message);
      process.exit(1);
    });
}
