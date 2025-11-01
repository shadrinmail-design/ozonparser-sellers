const express = require('express');
const path = require('path');
const { searchByImage } = require('./image_search');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Serve test page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test_image_search.html'));
});

// API endpoint for image search
app.post('/api/image-search', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }

    console.log(`📸 Received image search request: ${imageUrl}`);

    // Run image search via Safari
    const result = await searchByImage(imageUrl);

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in image search:', error);

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Image Search Server running on http://localhost:${PORT}`);
  console.log(`📝 Open http://localhost:${PORT} to test image search\n`);
  console.log(`⚠️  Make sure Safari is configured:`);
  console.log(`   Safari → Develop → Allow JavaScript from Apple Events\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully');
  process.exit(0);
});
