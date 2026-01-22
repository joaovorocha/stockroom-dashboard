/**
 * Webhooks API Routes
 *
 * Endpoints for receiving real-time updates from external services like UPS.
 */

const express = require('express');
const router = express.Router();
const pgDal = require('../utils/dal/pg');
const upsClient = require('../utils/ups-client');

// Helper function to convert snake_case to camelCase
function snakeToCamel(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = snakeToCamel(value);
  }
  return result;
}

// ============================================================================
// POST /api/webhooks/ups - Receive UPS Tracking Updates
// ============================================================================
router.post('/ups', async (req, res) => {
  const webhookSecret = req.get('Authorization');

  // --- 1. Security Check ---
  if (webhookSecret !== `Bearer ${process.env.UPS_WEBHOOK_SECRET}`) {
    console.warn('[UPS Webhook] Unauthorized request received. Invalid secret.');
    return res.status(401).send('Unauthorized');
  }

  console.log('[UPS Webhook] Received a new tracking update.');

  try {
    const trackingEvent = req.body;
    const trackingNumber = trackingEvent.trackingNumber;

    if (!trackingNumber) {
      console.warn('[UPS Webhook] Received event without a tracking number.');
      return res.status(400).send('Bad Request: Missing tracking number.');
    }

    // --- 2. Find the Shipment ---
    const shipment = await pgDal.getShipmentByTracking(trackingNumber);
    if (!shipment) {
      console.warn(`[UPS Webhook] Received update for unknown tracking number: ${trackingNumber}`);
      // Still return 200 so UPS doesn't retry.
      return res.status(200).send('Event received for unknown shipment.');
    }

    // --- 3. Process the Update ---
    const newStatus = upsClient.mapUPSToInternalStatus(trackingEvent.activityStatus?.code, trackingEvent.activityStatus?.type);
    const eventTimestamp = new Date(`${trackingEvent.localActivityDate}T${trackingEvent.localActivityTime}`).toISOString();

    // Update the main shipment record
    await pgDal.updateShipment(shipment.id, {
      last_ups_status: newStatus,
      last_ups_status_updated_at: eventTimestamp,
      status: newStatus, // Also update the primary status
    });

    // Add to the detailed event history
    await pgDal.createShipmentTrackingEvents(shipment.id, [{
      event_timestamp: eventTimestamp,
      status: newStatus,
      details: trackingEvent.activityStatus?.description,
      location: {
        city: trackingEvent.activityLocation?.city,
        state: trackingEvent.activityLocation?.stateProvince,
        country: trackingEvent.activityLocation?.country,
      },
    }]);

    // --- 4. Broadcast to Frontend Clients ---
    const broadcastUpdate = req.app.get('broadcastUpdate');
    if (broadcastUpdate) {
      // Get the full updated shipment record to ensure all fields are fresh
      const updatedShipment = await pgDal.getShipmentById(shipment.id);
      
      broadcastUpdate('shipment_updated', {
        ...snakeToCamel(updatedShipment), // Convert to camelCase for the frontend
        message: `Shipment ${trackingNumber} is now ${newStatus}.`
      });
    }

    console.log(`[UPS Webhook] Successfully processed update for ${trackingNumber}. New status: ${newStatus}`);

    // --- 5. Acknowledge Receipt ---
    res.status(200).send('Event processed successfully');

  } catch (err) {
    console.error('[UPS Webhook] Error processing tracking update:', err);
    // Still send a 200 to prevent UPS retries for data we can't process.
    res.status(200).send('Error processing event.');
  }
});

// ============================================================================
// POST /api/webhooks/gmail - Receive Gmail Push Notifications
// ============================================================================
router.post('/gmail', async (req, res) => {
  console.log('[Gmail Webhook] Received push notification');
  
  try {
    // Immediately respond to Google (required within 10 seconds)
    res.status(200).send('OK');
    
    // Parse the Pub/Sub message
    const message = req.body.message;
    
    if (!message || !message.data) {
      console.log('[Gmail Webhook] No message data received');
      return;
    }
    
    // Decode the base64 message data
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const notification = JSON.parse(decodedData);
    
    console.log('[Gmail Webhook] Notification:', notification);
    
    // Gmail notification format:
    // {
    //   "emailAddress": "user@gmail.com",
    //   "historyId": "123456"
    // }
    
    // Trigger email processing asynchronously
    setImmediate(async () => {
      try {
        console.log('[Gmail Webhook] Triggering email processor...');
        const { getUnifiedProcessor } = require('../utils/unified-gmail-processor');
        const processor = getUnifiedProcessor();
        
        const results = await processor.processEmails();
        console.log('[Gmail Webhook] Processing completed:', {
          success: results.success,
          emailsProcessed: results.emailsProcessed
        });
      } catch (error) {
        console.error('[Gmail Webhook] Error processing emails:', error);
      }
    });
    
  } catch (error) {
    console.error('[Gmail Webhook] Error handling notification:', error);
    // Don't return error to Google - we already sent 200 OK
  }
});

module.exports = router;
