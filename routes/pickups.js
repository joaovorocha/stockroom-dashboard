/**
 * Pickup Routes - PRODUCTION VERSION
 * 
 * Real-time pickup tracking with PostgreSQL database.
 * Integrates with WaitWhile appointments and Manhattan inventory.
 */

const express = require('express');
const router = express.Router();
const pgDal = require('../utils/dal/pg');
const { getWaitWhileClient } = require('../utils/waitwhile-client');
const { getManhattanClient } = require('../utils/manhattan-client');

// ==========================================================================
// GET /api/pickups - Get all pickups with stats
// ==========================================================================
router.get('/', async (req, res) => {
    try {
        const { status, state, search, limit } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (state) filters.state = state;
        if (search) filters.search = search;
        if (limit) filters.limit = parseInt(limit);
        
        // Get pickups from database
        const pickups = await pgDal.getPickups(filters);
        
        // Get stats
        const stats = await pgDal.getPickupStats();
        
        // Get last sync time
        const syncResult = await pgDal.query(`
            SELECT MAX(completed_at) as last_sync
            FROM sync_log
            WHERE sync_status = 'success'
              AND sync_type IN ('waitwhile_appointments', 'manhattan_inventory')
        `);
        
        const lastSync = syncResult.rows[0]?.last_sync || null;
        
        // Format pickups for frontend (match existing mock structure)
        const formattedPickups = pickups.map(p => ({
            id: p.id.toString(),
            customer: p.customer_name,
            phone: p.customer_phone,
            styleAdvisor: p.sa_name || p.style_advisor_name,
            tailor: p.tailor_full_name || p.tailor_name,
            bohContact: p.boh_name || p.boh_contact_name,
            productionTeam: [
                p.tailor_name,
                p.boh_name
            ].filter(Boolean),
            waitwhileId: p.waitwhile_id,
            waitwhileUrl: p.waitwhile_url,
            items: [], // Will be populated if needed
            status: p.status,
            state: p.state,
            daysWaiting: p.days_waiting || 0,
            pickupLocation: {
                inRack: p.in_rack,
                rackPosition: p.rack_position,
                assignedForPickup: p.assigned_for_pickup,
                lastScanned: p.updated_at
            },
            alterationWorkflow: {
                stage: p.alteration_stage,
                receivedFrom: p.received_from,
                completedStages: p.completed_stages || [],
                currentStep: p.current_step,
                needsMeasurement: p.needs_measurement,
                assignedTailor: p.tailor_name
            },
            tags: p.tags || [],
            notes: p.notes,
            alert: p.alert_message ? {
                type: p.alert_type,
                message: p.alert_message
            } : null
        }));
        
        res.json({
            success: true,
            lastSync: lastSync,
            stats: {
                total: parseInt(stats.total || 0),
                ready: parseInt(stats.ready || 0),
                inProduction: parseInt(stats.in_production || 0),
                overdue: parseInt(stats.overdue || 0),
                inRack: parseInt(stats.in_rack || 0),
                assignedForPickup: parseInt(stats.assigned_for_pickup || 0),
                needsMeasurement: parseInt(stats.needs_measurement || 0),
                orphaned: parseInt(stats.orphaned || 0)
            },
            pickups: formattedPickups
        });
    } catch (error) {
        console.error('Error fetching pickups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup data',
            error: error.message
        });
    }
});

// ==========================================================================
// GET /api/pickups/stats - Get just the stats
// ==========================================================================
router.get('/stats', async (req, res) => {
    try {
        const stats = await pgDal.getPickupStats();
        
        const syncResult = await pgDal.query(`
            SELECT MAX(completed_at) as last_sync
            FROM sync_log
            WHERE sync_status = 'success'
        `);
        
        const lastSync = syncResult.rows[0]?.last_sync || null;
        
        res.json({
            success: true,
            lastSync: lastSync,
            stats: {
                total: parseInt(stats.total || 0),
                ready: parseInt(stats.ready || 0),
                inProduction: parseInt(stats.in_production || 0),
                overdue: parseInt(stats.overdue || 0),
                inRack: parseInt(stats.in_rack || 0),
                assignedForPickup: parseInt(stats.assigned_for_pickup || 0),
                needsMeasurement: parseInt(stats.needs_measurement || 0),
                orphaned: parseInt(stats.orphaned || 0)
            }
        });
    } catch (error) {
        console.error('Error fetching pickup stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup stats',
            error: error.message
        });
    }
});

// ==========================================================================
// GET /api/pickups/alerts - Get only pickups with alerts
// ==========================================================================
router.get('/alerts', async (req, res) => {
    try {
        const result = await pgDal.query(`
            SELECT 
                p.*,
                COUNT(DISTINCT pi.id) as item_count
            FROM pickups p
            LEFT JOIN pickup_items pi ON p.id = pi.pickup_id
            WHERE p.alert_message IS NOT NULL
            GROUP BY p.id
            ORDER BY p.days_waiting DESC
        `);
        
        const alerts = result.rows.map(p => ({
            id: p.id,
            customer: p.customer_name,
            phone: p.customer_phone,
            items: [], // Simplified for alerts view
            daysWaiting: p.days_waiting,
            alert: {
                type: p.alert_type,
                message: p.alert_message
            },
            notes: p.notes
        }));
        
        res.json({
            success: true,
            count: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('Error fetching pickup alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup alerts',
            error: error.message
        });
    }
});

// ==========================================================================
// GET /api/pickups/:id - Get single pickup details with items
// ==========================================================================
router.get('/:id', async (req, res) => {
    try {
        const pickup = await pgDal.getPickupById(parseInt(req.params.id));
        
        if (!pickup) {
            return res.status(404).json({
                success: false,
                message: 'Pickup not found'
            });
        }
        
        // Format for frontend
        const formatted = {
            id: pickup.id.toString(),
            customer: pickup.customer_name,
            phone: pickup.customer_phone,
            email: pickup.customer_email,
            styleAdvisor: pickup.sa_name || pickup.style_advisor_name,
            tailor: pickup.tailor_full_name || pickup.tailor_name,
            bohContact: pickup.boh_name || pickup.boh_contact_name,
            waitwhileId: pickup.waitwhile_id,
            waitwhileUrl: pickup.waitwhile_url,
            orderNumber: pickup.order_number,
            status: pickup.status,
            state: pickup.state,
            daysWaiting: pickup.days_waiting || 0,
            pickupLocation: {
                inRack: pickup.in_rack,
                rackPosition: pickup.rack_position,
                assignedForPickup: pickup.assigned_for_pickup,
                zone: pickup.current_zone_name,
                lastScanned: pickup.updated_at
            },
            alterationWorkflow: {
                stage: pickup.alteration_stage,
                receivedFrom: pickup.received_from,
                completedStages: pickup.completed_stages || [],
                currentStep: pickup.current_step,
                needsMeasurement: pickup.needs_measurement,
                assignedTailor: pickup.tailor_name
            },
            items: (pickup.items || []).map(item => ({
                description: item.description,
                service: item.service_type,
                sku: item.sku,
                rfidTag: item.rfid_tag,
                status: item.item_status,
                zone: item.zone_name,
                lastScanned: item.last_scanned_at
            })),
            productionStages: pickup.production_stages || [],
            tags: pickup.tags || [],
            notes: pickup.notes,
            alert: pickup.alert_message ? {
                type: pickup.alert_type,
                message: pickup.alert_message
            } : null,
            createdAt: pickup.created_at,
            updatedAt: pickup.updated_at
        };
        
        res.json({
            success: true,
            pickup: formatted
        });
    } catch (error) {
        console.error('Error fetching pickup:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load pickup',
            error: error.message
        });
    }
});

// ==========================================================================
// POST /api/pickups/sync - Real sync with WaitWhile and Manhattan
// ==========================================================================
router.post('/sync', async (req, res) => {
    try {
        const waitwhileClient = getWaitWhileClient();
        const manhattanClient = getManhattanClient();
        
        const results = {
            waitwhile: { enabled: false, synced: 0 },
            manhattan: { enabled: false, synced: 0 },
            errors: []
        };
        
        // Sync WaitWhile appointments
        if (waitwhileClient.isConfigured()) {
            try {
                const pickups = await waitwhileClient.getPickupAppointments();
                results.waitwhile.enabled = true;
                results.waitwhile.synced = pickups.length;
                
                // TODO: Create pickups in database from WaitWhile data
            } catch (error) {
                results.errors.push(`WaitWhile: ${error.message}`);
            }
        }
        
        // Sync Manhattan inventory
        if (manhattanClient.isConfigured()) {
            try {
                // TODO: Sync inventory items and update pickup statuses
                results.manhattan.enabled = true;
            } catch (error) {
                results.errors.push(`Manhattan: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            message: results.errors.length === 0 ? 'Sync completed' : 'Sync completed with errors',
            syncedAt: new Date().toISOString(),
            results
        });
    } catch (error) {
        console.error('Error syncing pickups:', error);
        res.status(500).json({
            success: false,
            message: 'Sync failed',
            error: error.message
        });
    }
});

module.exports = router;
