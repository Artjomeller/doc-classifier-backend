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

// NEW: Undo history storage
let undoHistory = new Map(); // documentId -> previousState

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

        console.log(`Loaded ${classifications.length} documents successfully`);
    } catch (error) {
        console.error('Error loading initial data:', error);
        classifications = [];
    }
};

// GET /classifications - Get all classifications with optional filtering and sorting
app.get('/classifications', (req, res) => {
    try {
        let results = [...classifications];

        // Filter by classification type
        if (req.query.type) {
            results = results.filter(doc =>
                doc.classifications.some(c =>
                    c.label.toLowerCase().includes(req.query.type.toLowerCase())
                )
            );
        }

        // Filter by confidence range
        if (req.query.min_confidence) {
            const minConf = parseFloat(req.query.min_confidence);
            results = results.filter(doc =>
                doc.classifications.some(c => c.score >= minConf)
            );
        }

        if (req.query.max_confidence) {
            const maxConf = parseFloat(req.query.max_confidence);
            results = results.filter(doc =>
                doc.classifications.some(c => c.score <= maxConf)
            );
        }

        // Sort results
        if (req.query.sort) {
            const sortBy = req.query.sort;
            const order = req.query.order === 'desc' ? -1 : 1;

            results.sort((a, b) => {
                switch (sortBy) {
                    case 'name':
                        return order * a.document_name.localeCompare(b.document_name);
                    case 'confidence':
                        const aMax = Math.max(...a.classifications.map(c => c.score));
                        const bMax = Math.max(...b.classifications.map(c => c.score));
                        return order * (aMax - bMax);
                    case 'updated':
                        return order * (new Date(a.updated_at) - new Date(b.updated_at));
                    default:
                        return 0;
                }
            });
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedResults = results.slice(startIndex, endIndex);

        res.json({
            data: paginatedResults,
            pagination: {
                page,
                limit,
                total: results.length,
                pages: Math.ceil(results.length / limit)
            }
        });
    } catch (error) {
        console.error('Error in GET /classifications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /classifications - Ingest new classification data
app.post('/classifications', (req, res) => {
    try {
        const newClassifications = req.body;

        if (!Array.isArray(newClassifications)) {
            return res.status(400).json({ error: 'Expected array of classifications' });
        }

        const processedData = newClassifications.map(doc => ({
            id: uuidv4(),
            document_name: doc.document_name,
            classifications: doc.classifications,
            manually_edited: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));

        classifications.push(...processedData);

        console.log(`📄 Added ${processedData.length} new documents`);

        res.status(201).json({
            message: `Successfully ingested ${processedData.length} classifications`,
            data: processedData
        });
    } catch (error) {
        console.error('Error in POST /classifications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /classifications/:id - Update a specific classification (UPDATED WITH UNDO SUPPORT)
app.patch('/classifications/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const docIndex = classifications.findIndex(doc => doc.id === id);

        if (docIndex === -1) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Save previous state for undo (NEW)
        const previousState = { ...classifications[docIndex] };
        undoHistory.set(id, {
            previousState,
            timestamp: new Date(),
            canUndo: true
        });

        // Update the document
        const updatedDoc = {
            ...classifications[docIndex],
            ...updates,
            manually_edited: true,
            updated_at: new Date().toISOString()
        };

        classifications[docIndex] = updatedDoc;

        console.log(`Updated document: ${updatedDoc.document_name}`);

        res.json({
            message: 'Classification updated successfully',
            data: updatedDoc,
            canUndo: true  // NEW: Indicate undo is available
        });
    } catch (error) {
        console.error('Error in PATCH /classifications/:id:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// NEW: POST /classifications/:id/undo - Undo last change
app.post('/classifications/:id/undo', (req, res) => {
    try {
        const { id } = req.params;

        const undoData = undoHistory.get(id);
        if (!undoData || !undoData.canUndo) {
            return res.status(400).json({ error: 'No changes to undo' });
        }

        // Check if undo is still valid (within time limit)
        const timeDiff = new Date() - undoData.timestamp;
        const undoTimeLimit = 30 * 1000; // 30 seconds

        if (timeDiff > undoTimeLimit) {
            undoHistory.delete(id);
            return res.status(400).json({ error: 'Undo time limit exceeded' });
        }

        const docIndex = classifications.findIndex(doc => doc.id === id);
        if (docIndex === -1) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Restore previous state
        classifications[docIndex] = undoData.previousState;

        // Clear undo history for this document
        undoHistory.delete(id);

        console.log(`🔄 Undone changes for document: ${classifications[docIndex].document_name}`);

        res.json({
            message: 'Changes undone successfully',
            data: classifications[docIndex]
        });
    } catch (error) {
        console.error('Error in POST /classifications/:id/undo:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /classifications/:id - Get specific classification
app.get('/classifications/:id', (req, res) => {
    try {
        const { id } = req.params;
        const doc = classifications.find(doc => doc.id === id);

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({ data: doc });
    } catch (error) {
        console.error('Error in GET /classifications/:id:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        documents_count: classifications.length,
        undo_history_count: undoHistory.size,  // NEW
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
            'GET /classifications/:id - Get specific classification',
            'POST /classifications - Ingest classification data',
            'PATCH /classifications/:id - Update classification',
            'POST /classifications/:id/undo - Undo last change'  // NEW
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
    console.log('Document Classifier Backend Server');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log('Loading initial data...');
    loadInitialData();
});

module.exports = app;