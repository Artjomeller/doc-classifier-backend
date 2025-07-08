const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage for classifications
let classifications = [];

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
        endpoints: [
            'GET /health - Health check',
            'POST /classifications - Ingest classification data',
            'GET /classifications - Get all classifications',
            'PATCH /classifications/:id - Update classification'
        ]
    });
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
});

module.exports = app;