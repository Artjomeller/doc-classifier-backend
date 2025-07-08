const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage for classifications
let classifications = [];

// Load initial data from JSON file
const loadInitialData = () => {
    try {
        const dataPath = path.join(__dirname, 'data', 'example-classification.json');
        const rawData = fs.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(rawData);

        // Transform data to include IDs and manual edit tracking
        classifications = data.map(doc => ({
            id: uuidv4(),
            document_name: doc.document_name,
            classifications: doc.classifications,
            manually_edited: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));

        console.log(`✅ Loaded ${classifications.length} documents successfully`);
    } catch (error) {
        console.error('❌ Error loading initial data:', error);
        classifications = [];
    }
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        documents_count: classifications.length,
        server: 'Document Classifier API'
    });
});

// Basic route
app.get('/', (req, res) => {
    res.json({
        message: 'Document Classifier Backend API',
        version: '1.0.0',
        documents_loaded: classifications.length,
        endpoints: [
            'GET /health - Health check',
            'GET /classifications - Get all classifications',
            'POST /classifications - Ingest classification data',
            'PATCH /classifications/:id - Update classification'
        ]
    });
});

// Get all classifications (basic version)
app.get('/classifications', (req, res) => {
    try {
        res.json({
            data: classifications,
            total: classifications.length
        });
    } catch (error) {
        console.error('Error in GET /classifications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Document Classifier Backend Server');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log('📚 Loading initial data...');
    loadInitialData();
});

module.exports = app;