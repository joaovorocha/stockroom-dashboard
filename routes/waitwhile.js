/**
 * WaitWhile API Routes
 * 
 * Endpoints for integrating with WaitWhile appointment system.
 * Handles appointment sync, customer lookup, and webhooks.
 */

const express = require('express');
const router = express.Router();
const { getWaitWhileClient } = require('../utils/waitwhile-client');
const pgDal = require('../utils/dal/pg');

// ==========================================================================
// MIDDLEWARE
// ==========================================================================

/**
 * Check if WaitWhile is configured
 */
function requireWaitWhile(req, res, next) {
  const client = getWaitWhileClient();
  if (!client.isConfigured()) {
    return res.status(503).json({
      error: 'WaitWhile not configured',
      message: 'Set WAITWHILE_API_KEY in environment variables'
    });
  }
  next();
}

// ==========================================================================
// LOCATIONS
// ==========================================================================

/**
 * GET /api/waitwhile/locations
 * Get all WaitWhile locations
 */
router.get('/locations', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const locations = await client.getLocations();
    
    res.json({
      success: true,
      locations
    });
  } catch (error) {
    console.error('Error fetching WaitWhile locations:', error);
    res.status(500).json({
      error: 'Failed to fetch locations',
      message: error.message
    });
  }
});

// ==========================================================================
// CUSTOMERS
// ==========================================================================

/**
 * GET /api/waitwhile/customers
 * Search customers by email, phone, or name
 */
router.get('/customers', requireWaitWhile, async (req, res) => {
  try {
    const { email, phone, name } = req.query;
    
    if (!email && !phone && !name) {
      return res.status(400).json({
        error: 'Missing search parameter',
        message: 'Provide email, phone, or name'
      });
    }
    
    const client = getWaitWhileClient();
    const customers = await client.searchCustomers({ email, phone, name });
    
    res.json({
      success: true,
      count: customers.length,
      customers
    });
  } catch (error) {
    console.error('Error searching WaitWhile customers:', error);
    res.status(500).json({
      error: 'Failed to search customers',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/customers/:customerId
 * Get customer by ID
 */
router.get('/customers/:customerId', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const customer = await client.getCustomer(req.params.customerId);
    
    res.json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('Error fetching WaitWhile customer:', error);
    res.status(error.response?.status === 404 ? 404 : 500).json({
      error: 'Failed to fetch customer',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/customers/:customerId/visits
 * Get all visits for a customer
 */
router.get('/customers/:customerId/visits', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const customer = await client.getCustomer(req.params.customerId);
    const { visits } = await client.findCustomerVisits({ 
      email: customer.email 
    });
    
    res.json({
      success: true,
      customer,
      count: visits.length,
      visits
    });
  } catch (error) {
    console.error('Error fetching customer visits:', error);
    res.status(500).json({
      error: 'Failed to fetch visits',
      message: error.message
    });
  }
});

// ==========================================================================
// VISITS/APPOINTMENTS
// ==========================================================================

/**
 * GET /api/waitwhile/visits
 * Get visits with filters
 */
router.get('/visits', requireWaitWhile, async (req, res) => {
  try {
    const { state, fromDate, toDate, resourceId, limit } = req.query;
    
    const options = {};
    if (state) options.state = state;
    if (resourceId) options.resourceId = resourceId;
    if (limit) options.limit = parseInt(limit);
    
    if (fromDate) {
      options.fromDate = new Date(fromDate);
    }
    
    if (toDate) {
      options.toDate = new Date(toDate);
    }
    
    const client = getWaitWhileClient();
    const visits = await client.getVisits(options);
    
    res.json({
      success: true,
      count: visits.length,
      visits
    });
  } catch (error) {
    console.error('Error fetching WaitWhile visits:', error);
    res.status(500).json({
      error: 'Failed to fetch visits',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/visits/today
 * Get today's bookings
 */
router.get('/visits/today', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const visits = await client.getTodaysBookings();
    
    res.json({
      success: true,
      date: new Date().toISOString().split('T')[0],
      count: visits.length,
      visits
    });
  } catch (error) {
    console.error('Error fetching today\'s bookings:', error);
    res.status(500).json({
      error: 'Failed to fetch bookings',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/visits/waitlist
 * Get current waitlist
 */
router.get('/visits/waitlist', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const visits = await client.getWaitlist();
    
    res.json({
      success: true,
      count: visits.length,
      visits
    });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({
      error: 'Failed to fetch waitlist',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/visits/serving
 * Get currently serving
 */
router.get('/visits/serving', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const visits = await client.getServing();
    
    res.json({
      success: true,
      count: visits.length,
      visits
    });
  } catch (error) {
    console.error('Error fetching serving visits:', error);
    res.status(500).json({
      error: 'Failed to fetch serving visits',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/visits/pickups
 * Get pickup appointments (tagged with 'Pick-Up')
 */
router.get('/visits/pickups', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const pickups = await client.getPickupAppointments();
    
    res.json({
      success: true,
      count: pickups.length,
      pickups
    });
  } catch (error) {
    console.error('Error fetching pickup appointments:', error);
    res.status(500).json({
      error: 'Failed to fetch pickups',
      message: error.message
    });
  }
});

/**
 * GET /api/waitwhile/visits/:visitId
 * Get visit by ID
 */
router.get('/visits/:visitId', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const visit = await client.getVisit(req.params.visitId);
    
    res.json({
      success: true,
      visit
    });
  } catch (error) {
    console.error('Error fetching WaitWhile visit:', error);
    res.status(error.response?.status === 404 ? 404 : 500).json({
      error: 'Failed to fetch visit',
      message: error.message
    });
  }
});

// ==========================================================================
// RESOURCES (Staff)
// ==========================================================================

/**
 * GET /api/waitwhile/resources
 * Get all staff/resources
 */
router.get('/resources', requireWaitWhile, async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const resources = await client.getResources();
    
    res.json({
      success: true,
      count: resources.length,
      resources
    });
  } catch (error) {
    console.error('Error fetching WaitWhile resources:', error);
    res.status(500).json({
      error: 'Failed to fetch resources',
      message: error.message
    });
  }
});

// ==========================================================================
// SYNC OPERATIONS
// ==========================================================================

/**
 * POST /api/waitwhile/sync
 * Sync WaitWhile data to database
 */
router.post('/sync', requireWaitWhile, async (req, res) => {
  const startTime = Date.now();
  const syncLog = {
    sync_type: 'waitwhile_appointments',
    sync_status: 'started',
    started_at: new Date(),
    records_processed: 0,
    records_created: 0,
    records_updated: 0,
    records_failed: 0
  };
  
  try {
    const client = getWaitWhileClient();
    
    // Get today's bookings and pickup appointments
    const [bookings, pickups] = await Promise.all([
      client.getTodaysBookings(),
      client.getPickupAppointments()
    ]);
    
    const allVisits = [...bookings, ...pickups];
    syncLog.records_processed = allVisits.length;
    
    // Sync each visit to database
    for (const visit of allVisits) {
      try {
        // Sync customer first
        if (visit.customerId) {
          const customer = await client.getCustomer(visit.customerId);
          
          await pgDal.query(`
            INSERT INTO waitwhile_customers (
              waitwhile_id, email, phone, first_name, last_name, full_name, customer_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (waitwhile_id) DO UPDATE SET
              email = EXCLUDED.email,
              phone = EXCLUDED.phone,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              full_name = EXCLUDED.full_name,
              customer_data = EXCLUDED.customer_data,
              updated_at = NOW()
          `, [
            customer.id,
            customer.email || null,
            customer.phone || null,
            customer.firstName || null,
            customer.lastName || null,
            customer.name || null,
            JSON.stringify(customer)
          ]);
        }
        
        // Sync appointment
        const tags = visit.tags || [];
        const isPickup = tags.some(tag => tag.toLowerCase().includes('pick'));
        
        await pgDal.query(`
          INSERT INTO waitwhile_appointments (
            waitwhile_id, customer_email, customer_phone, customer_name,
            appointment_date, appointment_duration, status, service_type,
            assigned_sa_name, tags, notes, waitwhile_url, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (waitwhile_id) DO UPDATE SET
            customer_email = EXCLUDED.customer_email,
            customer_phone = EXCLUDED.customer_phone,
            customer_name = EXCLUDED.customer_name,
            appointment_date = EXCLUDED.appointment_date,
            appointment_duration = EXCLUDED.appointment_duration,
            status = EXCLUDED.status,
            service_type = EXCLUDED.service_type,
            assigned_sa_name = EXCLUDED.assigned_sa_name,
            tags = EXCLUDED.tags,
            notes = EXCLUDED.notes,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()
          RETURNING id
        `, [
          visit.id,
          visit.email || null,
          visit.phone || null,
          visit.name || null,
          visit.bookingDateTime || visit.createdDate || new Date(),
          visit.duration || 30,
          visit.state || 'scheduled',
          isPickup ? 'Pick-Up' : (visit.service || visit.serviceLabel || null),
          visit.resourceName || visit.resource?.name || null,
          tags,
          visit.notes || null,
          visit.url || `https://app.waitwhile.com/visits/${visit.id}`,
          JSON.stringify(visit)
        ]);
        
        syncLog.records_created++;
      } catch (error) {
        console.error('Error syncing visit:', visit.id, error);
        syncLog.records_failed++;
      }
    }
    
    syncLog.sync_status = syncLog.records_failed > 0 ? 'partial' : 'success';
    syncLog.completed_at = new Date();
    syncLog.sync_duration_ms = Date.now() - startTime;
    
    await pgDal.logSync(syncLog);
    
    res.json({
      success: true,
      message: 'WaitWhile data synced successfully',
      stats: {
        processed: syncLog.records_processed,
        created: syncLog.records_created,
        failed: syncLog.records_failed,
        duration_ms: syncLog.sync_duration_ms
      }
    });
    
  } catch (error) {
    console.error('Error syncing WaitWhile data:', error);
    
    syncLog.sync_status = 'failed';
    syncLog.error_message = error.message;
    syncLog.completed_at = new Date();
    syncLog.sync_duration_ms = Date.now() - startTime;
    
    await pgDal.logSync(syncLog);
    
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
});

// ==========================================================================
// WEBHOOKS
// ==========================================================================

/**
 * POST /api/waitwhile/webhook
 * Handle WaitWhile webhooks
 */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const client = getWaitWhileClient();
    const event = client.processWebhook(req.body);
    
    console.log('WaitWhile webhook received:', event.type);
    
    // Handle different event types
    if (event.isVisitCreated() || event.isVisitUpdated()) {
      // Sync this visit to database
      const visit = event.data;
      
      // TODO: Implement real-time sync logic here
      // This is triggered when appointments are created/updated in WaitWhile
      
      console.log('Visit updated:', visit.id, visit.state);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
});

// ==========================================================================
// CUSTOMER LOOKUP (for connecting to Manhattan orders)
// ==========================================================================

/**
 * GET /api/waitwhile/lookup
 * Look up customer and their visits by email or phone
 * Used to connect WaitWhile appointments to Manhattan orders
 */
router.get('/lookup', requireWaitWhile, async (req, res) => {
  try {
    const { email, phone } = req.query;
    
    if (!email && !phone) {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Provide email or phone'
      });
    }
    
    const client = getWaitWhileClient();
    const identifier = email ? { email } : { phone };
    const result = await client.findCustomerVisits(identifier);
    
    res.json({
      success: true,
      customer: result.customer,
      visits: result.visits,
      pickup_count: result.visits.filter(v => {
        const tags = v.tags || [];
        return tags.some(tag => tag.toLowerCase().includes('pick'));
      }).length
    });
  } catch (error) {
    console.error('Error looking up customer:', error);
    res.status(500).json({
      error: 'Lookup failed',
      message: error.message
    });
  }
});

module.exports = router;
