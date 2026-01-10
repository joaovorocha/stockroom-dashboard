const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const PICKUPS_FILE = path.join(__dirname, '../data/pickups-mock.json');

// GET /api/pickups - Get all pickups with stats
router.get('/', async (req, res) => {
    try {
        const data = await fs.readFile(PICKUPS_FILE, 'utf8');
        const pickupsData = JSON.parse(data);
        
        // Filter by status if requested
        const { status, alert } = req.query;
        let filteredPickups = pickupsData.pickups;
        
        if (status) {
            filteredPickups = filteredPickups.filter(p => p.status.startsWith(status));
        }
        
        if (alert === 'true') {
            filteredPickups = filteredPickups.filter(p => p.alert !== null);
        }
        
        res.json({
            success: true,
            lastSync: pickupsData.lastSync,
            stats: pickupsData.stats,
            pickups: filteredPickups
        });
    } catch (error) {
        console.error('Error reading pickups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup data',
            error: error.message
        });
    }
});

// GET /api/pickups/stats - Get just the stats
router.get('/stats', async (req, res) => {
    try {
        const data = await fs.readFile(PICKUPS_FILE, 'utf8');
        const pickupsData = JSON.parse(data);
        
        res.json({
            success: true,
            lastSync: pickupsData.lastSync,
            stats: pickupsData.stats
        });
    } catch (error) {
        console.error('Error reading pickup stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup stats',
            error: error.message
        });
    }
});

// GET /api/pickups/alerts - Get only pickups with alerts
router.get('/alerts', async (req, res) => {
    try {
        const data = await fs.readFile(PICKUPS_FILE, 'utf8');
        const pickupsData = JSON.parse(data);
        
        const alertPickups = pickupsData.pickups.filter(p => p.alert !== null);
        
        res.json({
            success: true,
            count: alertPickups.length,
            alerts: alertPickups.map(p => ({
                id: p.id,
                customer: p.customer,
                phone: p.phone,
                items: p.items,
                daysWaiting: p.daysWaiting,
                alert: p.alert,
                notes: p.notes
            }))
        });
    } catch (error) {
        console.error('Error reading pickup alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup alerts',
            error: error.message
        });
    }
});

// GET /api/pickups/:id - Get single pickup details
router.get('/:id', async (req, res) => {
    try {
        const data = await fs.readFile(PICKUPS_FILE, 'utf8');
        const pickupsData = JSON.parse(data);
        
        const pickup = pickupsData.pickups.find(p => p.id === req.params.id);
        
        if (!pickup) {
            return res.status(404).json({
                success: false,
                message: 'Pickup not found'
            });
        }
        
        res.json({
            success: true,
            pickup
        });
    } catch (error) {
        console.error('Error reading pickup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup',
            error: error.message
        });
    }
});

// POST /api/pickups/sync - Simulate sync (for demo)
router.post('/sync', async (req, res) => {
    try {
        // In real implementation, this would call WaitWhile API
        // For demo, just return current data timestamp
        const data = await fs.readFile(PICKUPS_FILE, 'utf8');
        const pickupsData = JSON.parse(data);
        
        res.json({
            success: true,
            message: 'Sync completed (demo mode - using mock data)',
            syncedAt: new Date().toISOString(),
            stats: pickupsData.stats
        });
    } catch (error) {
        console.error('Error simulating sync:', error);
        res.status(500).json({
            success: false,
            message: 'Sync failed',
            error: error.message
        });
    }
});

module.exports = router;
