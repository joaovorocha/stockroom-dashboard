/**
 * PredictSpring API Client
 * 
 * Integrates with PredictSpring Modern POS for:
 * - Order lookup by customer email
 * - Fulfillment requests (shipments)
 * - Inventory sync
 * - Customer 360 data
 * 
 * API Documentation: Contact PredictSpring support for Swagger docs
 * Architecture: Microservices with REST API + Webhooks
 * 
 * Developer: Victor Rocha, Stockroom Manager @ Suit Supply
 */

const axios = require('axios');

class PredictSpringClient {
  constructor() {
    this.apiKey = process.env.PREDICTSPRING_API_KEY;
    this.tenantId = process.env.PREDICTSPRING_TENANT_ID || 'suitsupply';
    this.baseURL = process.env.PREDICTSPRING_BASE_URL || 'https://api.predictspring.com/v1';
    this.storeLocationId = process.env.PREDICTSPRING_STORE_LOCATION_ID || 'SF';
    
    if (!this.apiKey) {
      console.warn('⚠️  PREDICTSPRING_API_KEY not configured - PredictSpring integration disabled');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Tenant-ID': this.tenantId
      }
    });
    
    // Request/response interceptors
    this.client.interceptors.request.use(
      config => {
        console.log(`[PredictSpring] ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      error => Promise.reject(error)
    );
    
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error(`[PredictSpring] Error: ${error.message}`);
        if (error.response) {
          console.error(`[PredictSpring] Status: ${error.response.status}`);
          console.error(`[PredictSpring] Data:`, error.response.data);
        }
        return Promise.reject(error);
      }
    );
  }
  
  isConfigured() {
    return !!this.apiKey;
  }
  
  // ============================================================================
  // ORDERS
  // ============================================================================
  
  /**
   * Get orders for a customer by email
   * @param {string} email - Customer email
   * @param {object} options - { status, startDate, endDate, limit }
   * @returns {Promise<Array>} Order list
   */
  async getCustomerOrders(email, options = {}) {
    const params = {
      customerEmail: email,
      ...options
    };
    const response = await this.client.get('/orders', { params });
    return response.data.orders || [];
  }
  
  /**
   * Get a specific order by ID
   * @param {string} orderId - PredictSpring order ID
   * @returns {Promise<object>} Order details
   */
  async getOrder(orderId) {
    const response = await this.client.get(`/orders/${orderId}`);
    return response.data;
  }
  
  /**
   * Get order by order number
   * @param {string} orderNumber - Order number (external ID)
   * @returns {Promise<object>} Order details
   */
  async getOrderByNumber(orderNumber) {
    const response = await this.client.get(`/orders/by-number/${orderNumber}`);
    return response.data;
  }
  
  /**
   * Get pending fulfillments for store location
   * @param {object} options - { status, limit }
   * @returns {Promise<Array>} Fulfillment list
   */
  async getPendingFulfillments(options = {}) {
    const params = {
      locationId: this.storeLocationId,
      status: options.status || 'PENDING',
      limit: options.limit || 100
    };
    const response = await this.client.get('/fulfillments', { params });
    return response.data.fulfillments || [];
  }
  
  /**
   * Get fulfillment details
   * @param {string} fulfillmentId - Fulfillment ID
   * @returns {Promise<object>} Fulfillment details
   */
  async getFulfillment(fulfillmentId) {
    const response = await this.client.get(`/fulfillments/${fulfillmentId}`);
    return response.data;
  }
  
  /**
   * Update fulfillment status
   * @param {string} fulfillmentId - Fulfillment ID
   * @param {string} status - New status (PROCESSING, READY_TO_SHIP, SHIPPED, DELIVERED, CANCELLED)
   * @param {object} data - Additional data (tracking number, notes, etc.)
   * @returns {Promise<object>} Updated fulfillment
   */
  async updateFulfillmentStatus(fulfillmentId, status, data = {}) {
    const response = await this.client.patch(`/fulfillments/${fulfillmentId}/status`, {
      status,
      ...data
    });
    return response.data;
  }
  
  // ============================================================================
  // CUSTOMERS
  // ============================================================================
  
  /**
   * Search for customer by email or phone
   * @param {string} query - Email or phone number
   * @returns {Promise<object|null>} Customer data or null
   */
  async searchCustomer(query) {
    try {
      const response = await this.client.get('/customers/search', {
        params: { q: query }
      });
      return response.data.customers?.[0] || null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Get customer by ID
   * @param {string} customerId - Customer ID
   * @returns {Promise<object>} Customer details
   */
  async getCustomer(customerId) {
    const response = await this.client.get(`/customers/${customerId}`);
    return response.data;
  }
  
  /**
   * Get customer's order history
   * @param {string} customerId - Customer ID
   * @param {object} options - { limit, offset }
   * @returns {Promise<Array>} Order history
   */
  async getCustomerOrderHistory(customerId, options = {}) {
    const response = await this.client.get(`/customers/${customerId}/orders`, {
      params: options
    });
    return response.data.orders || [];
  }
  
  // ============================================================================
  // INVENTORY
  // ============================================================================
  
  /**
   * Get inventory for specific item at location
   * @param {string} itemId - Item/SKU ID
   * @param {string} locationId - Location ID (default: store location)
   * @returns {Promise<object>} Inventory details
   */
  async getItemInventory(itemId, locationId = null) {
    const response = await this.client.get(`/inventory/${itemId}`, {
      params: { locationId: locationId || this.storeLocationId }
    });
    return response.data;
  }
  
  /**
   * Reserve inventory for order
   * @param {string} orderId - Order ID
   * @param {Array} items - Array of { itemId, quantity }
   * @returns {Promise<object>} Reservation result
   */
  async reserveInventory(orderId, items) {
    const response = await this.client.post('/inventory/reserve', {
      orderId,
      locationId: this.storeLocationId,
      items
    });
    return response.data;
  }
  
  // ============================================================================
  // WEBHOOKS
  // ============================================================================
  
  /**
   * Process incoming webhook from PredictSpring
   * @param {object} payload - Webhook payload
   * @returns {object} Processed event
   */
  processWebhook(payload) {
    const eventType = payload.eventType || payload.type;
    const data = payload.data || payload;
    
    console.log(`[PredictSpring Webhook] ${eventType}`);
    
    return {
      eventType,
      data,
      timestamp: payload.timestamp || new Date().toISOString(),
      processed: true
    };
  }
  
  /**
   * Check if webhook is a fulfillment request
   * @param {object} payload - Webhook payload
   * @returns {boolean}
   */
  isFulfillmentRequest(payload) {
    const eventType = payload.eventType || payload.type;
    return eventType === 'fulfillment.created' || eventType === 'shipment.requested';
  }
  
  /**
   * Check if webhook is an order update
   * @param {object} payload - Webhook payload
   * @returns {boolean}
   */
  isOrderUpdate(payload) {
    const eventType = payload.eventType || payload.type;
    return eventType === 'order.updated' || eventType === 'order.status_changed';
  }
  
  // ============================================================================
  // SHIPMENT HELPERS
  // ============================================================================
  
  /**
   * Create shipment from PredictSpring fulfillment
   * @param {object} fulfillment - Fulfillment data from PS
   * @returns {object} Shipment data ready for database
   */
  transformFulfillmentToShipment(fulfillment) {
    const customer = fulfillment.customer || {};
    const shippingAddress = fulfillment.shippingAddress || {};
    const items = fulfillment.items || [];
    
    return {
      // Customer info
      customer_name: customer.name || `${customer.firstName} ${customer.lastName}`,
      customer_email: customer.email,
      customer_phone: customer.phone,
      
      // Order info
      order_number: fulfillment.orderNumber || fulfillment.orderId,
      ps_order_id: fulfillment.orderId,
      ps_fulfillment_id: fulfillment.id,
      ps_tenant_id: this.tenantId,
      
      // Shipment type
      shipment_type: fulfillment.shippingMethod === 'NEXT_DAY' ? 'NEXT_DAY' : 'STANDARD',
      requested_by: 'PS_API',
      priority: fulfillment.priority || 0,
      
      // Address
      address_line1: shippingAddress.line1 || shippingAddress.address1,
      address_line2: shippingAddress.line2 || shippingAddress.address2,
      address_city: shippingAddress.city,
      address_state: shippingAddress.state || shippingAddress.province,
      address_zip: shippingAddress.zip || shippingAddress.postalCode,
      address_country: shippingAddress.country || 'US',
      
      // Status
      status: 'REQUESTED',
      
      // Raw data
      ps_raw_data: fulfillment,
      
      // Items
      items: items.map(item => ({
        item_number: item.sku || item.itemId,
        description: item.name || item.description,
        quantity: item.quantity || 1,
        price: item.price,
        category: item.category,
        barcode: item.barcode
      }))
    };
  }
}

module.exports = new PredictSpringClient();
