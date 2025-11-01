const { MongoClient } = require('mongodb');
const fs = require('fs').promises;

/**
 * Save image search results to MongoDB
 *
 * Collections:
 * - products: Original products (existing)
 * - image_search_results: Similar products found by image search
 */

async function saveToMongoDB() {
  // MongoDB connection
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGO_DB || 'ozon';
  const collectionName = process.env.MONGO_COLLECTION || 'image_search_results';

  // Load results from JSON file
  const resultsFile = process.env.RESULTS_FILE || './image_search_results.json';

  console.log('📦 Loading results from', resultsFile);

  let data;
  try {
    const fileContent = await fs.readFile(resultsFile, 'utf8');
    data = JSON.parse(fileContent);
  } catch (error) {
    console.error('❌ Failed to load results:', error.message);
    process.exit(1);
  }

  console.log(`✅ Loaded ${data.results.length} search results`);

  // Connect to MongoDB
  console.log('🔌 Connecting to MongoDB...');
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Create index on source product ID
    await collection.createIndex({ 'source_product.id': 1 }, { unique: true });
    console.log('✅ Index created');

    // Prepare documents for upsert
    const bulkOps = data.results.map(result => ({
      updateOne: {
        filter: { 'source_product.id': result.source_product.id },
        update: {
          $set: {
            source_product: result.source_product,
            search_result: result.search_result,
            searched_at: new Date(result.searched_at),
            updated_at: new Date()
          }
        },
        upsert: true
      }
    }));

    // Execute bulk operation
    console.log(`💾 Saving ${bulkOps.length} documents...`);
    const result = await collection.bulkWrite(bulkOps);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SAVED TO MONGODB');
    console.log('='.repeat(60));
    console.log(`Database: ${dbName}`);
    console.log(`Collection: ${collectionName}`);
    console.log(`Inserted: ${result.upsertedCount}`);
    console.log(`Updated: ${result.modifiedCount}`);
    console.log(`Matched: ${result.matchedCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ MongoDB error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  saveToMongoDB().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { saveToMongoDB };
