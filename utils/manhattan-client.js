/**
 * Manhattan Active® API Client
 * 
 * Official API client for Manhattan Active® Omni and WMS.
 * Handles OAuth2 authentication, inventory queries, and RFID tracking.
 * 
 * API Documentation: https://developer.manh.com/
 * 
 * Required Environment Variables:
 * - MANHATTAN_CLIENT_ID: OAuth client ID
 * - MANHATTAN_CLIENT_SECRET: OAuth client secret
 * - MANHATTAN_TENANT_ID: Your tenant ID
 * - MANHATTAN_BASE_URL: API base URL (e.g., https://api.manh.com)
 * - MANHATTAN_AUTH_URL: OAuth token URL
 */

const axios = require('axios');

class ManhattanClient {
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.MANHATTAN_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.MANHATTAN_CLIENT_SECRET;
    this.tenantId = options.tenantId || process.env.MANHATTAN_TENANT_ID;
    this.baseURL = options.baseURL || process.env.MANHATTAN_BASE_URL || 'https://api.manh.com';
    this.authURL = options.authURL || process.env.MANHATTAN_AUTH_URL;
    
    this.accessToken = null;
    this.tokenExpiry = null;
    
    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  Manhattan API not configured. Set MANHATTAN_CLIENT_ID and MANHATTAN_CLIENT_SECRET in .env');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Add request interceptor to handle authentication
    this.client.interceptors.request.use(async (config) => {
      await this.ensureAuthenticated();
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      async error => {
        if (error.response?.status === 401) {
          // Token expired, retry once
          this.accessToken = null;
          await this.ensureAuthenticated();
          error.config.headers.Authorization = `Bearer ${this.accessToken}`;
          return axios.request(error.config);
        }
        
        if (error.response) {
          console.error('Manhattan API error:', error.response.status, error.response.data);
        } else if (error.request) {
          console.error('Manhattan API no response:', error.message);
        } else {
          console.error('Manhattan API request error:', error.message);
        }
        throw error;
      }
    );
  }
  
  /**
   * Check if client is configured
   */
  isConfigured() {
    return !!(this.clientId && this.clientSecret);
  }
  
  /**
   * Authenticate with Manhattan OAuth2
   */
  async authenticate() {
    if (!this.isConfigured()) {
      throw new Error('Manhattan API credentials not configured');
    }
    
    try {
      const authUrl = this.authURL || `${this.baseURL}/oauth/token`;
      
      const response = await axios.post(authUrl, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'omni.inventory omni.orders wms.inventory'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + (expiresIn * 1000);
      
      console.log('✅ Manhattan API authenticated');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Manhattan authentication failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Ensure we have a valid access token
   */
  async ensureAuthenticated() {
    if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
      await this.authenticate();
    }
  }
  
  // ==========================================================================
  // INVENTORY - Unit Inventory (RFID-tagged items)
  // ==========================================================================
  
  /**
   * Get unit inventory by SGTIN (RFID tag)
   * @param {String} sgtin - RFID tag (e.g., '010872073119063521536873870')
   */
  async getUnitBySGTIN(sgtin) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        sgtin: sgtin,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Get unit inventory by Item ID
   * @param {String} itemId - Item ID (e.g., 'SW186706')
   */
  async getUnitsByItemId(itemId) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        itemId: itemId,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Get unit inventory by Package ID
   * @param {String} packageId - Package ID (e.g., 'P7677407639154')
   */
  async getUnitsByPackage(packageId) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        packageId: packageId,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Get unit inventory by Location
   * @param {String} locationId - Location ID (e.g., 'SR-US-SanFrancisco-Maiden')
   * @param {Object} filters - Additional filters
   */
  async getUnitsByLocation(locationId, filters = {}) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        locationId: locationId,
        tenantId: this.tenantId,
        ...filters
      }
    });
    return response.data;
  }
  
  /**
   * Get units by status
   * @param {String} status - Unit inventory status (Available, InBound, Reserved, Departed, etc.)
   * @param {String} locationId - Optional location filter
   */
  async getUnitsByStatus(status, locationId = null) {
    const params = {
      unitInventoryStatus: status,
      tenantId: this.tenantId
    };
    
    if (locationId) {
      params.locationId = locationId;
    }
    
    const response = await this.client.get('/omni/v1/units', { params });
    return response.data;
  }
  
  /**
   * Get RFID-tagged units at location
   * @param {String} locationId - Location ID
   */
  async getRFIDUnitsAtLocation(locationId) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        locationId: locationId,
        isRfidTagged: true,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  // ==========================================================================
  // ORDERS
  // ==========================================================================
  
  /**
   * Get order by order number
   * @param {String} orderNumber - Order number
   */
  async getOrder(orderNumber) {
    const response = await this.client.get(`/omni/v1/orders/${orderNumber}`, {
      params: {
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Get orders for customer
   * @param {String} customerId - Customer ID or email
   */
  async getOrdersForCustomer(customerId) {
    const response = await this.client.get('/omni/v1/orders', {
      params: {
        customerId: customerId,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Get fulfillment details
   * @param {String} fulfillmentId - Fulfillment ID
   */
  async getFulfillment(fulfillmentId) {
    const response = await this.client.get(`/omni/v1/fulfillments/${fulfillmentId}`, {
      params: {
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  // ==========================================================================
  // CUSTOMER ORDERS (for pickup tracking)
  // ==========================================================================
  
  /**
   * Get all orders for customer by email
   * This is used to connect WaitWhile appointments to Manhattan orders
   * @param {String} email - Customer email
   */
  async getCustomerOrders(email) {
    try {
      // First, search for customer
      const customerResponse = await this.client.get('/omni/v1/customers', {
        params: {
          email: email,
          tenantId: this.tenantId
        }
      });
      
      const customers = customerResponse.data;
      if (!customers || customers.length === 0) {
        return {
          customer: null,
          orders: [],
          units: []
        };
      }
      
      const customer = customers[0];
      
      // Get orders for customer
      const ordersResponse = await this.client.get('/omni/v1/orders', {
        params: {
          customerId: customer.id,
          tenantId: this.tenantId
        }
      });
      
      const orders = ordersResponse.data || [];
      
      // Get units for each order
      const units = [];
      for (const order of orders) {
        try {
          const orderUnits = await this.getUnitsByOrder(order.orderNumber);
          units.push(...orderUnits);
        } catch (error) {
          console.error('Error fetching units for order:', order.orderNumber, error);
        }
      }
      
      return {
        customer,
        orders,
        units
      };
    } catch (error) {
      console.error('Error fetching customer orders:', error);
      throw error;
    }
  }
  
  /**
   * Get units for an order
   * @param {String} orderNumber - Order number
   */
  async getUnitsByOrder(orderNumber) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        orderNumber: orderNumber,
        tenantId: this.tenantId
      }
    });
    return response.data || [];
  }
  
  // ==========================================================================
  // RFID TRACKING
  // ==========================================================================
  
  /**
   * Get RFID read history for a unit
   * @param {String} sgtin - RFID tag
   */
  async getRFIDHistory(sgtin) {
    const response = await this.client.get('/wms/v1/rfid/history', {
      params: {
        sgtin: sgtin,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Get last RFID read for a unit
   * @param {String} sgtin - RFID tag
   */
  async getLastRFIDRead(sgtin) {
    try {
      const unit = await this.getUnitBySGTIN(sgtin);
      
      if (!unit || unit.length === 0) {
        return null;
      }
      
      const item = unit[0];
      
      return {
        sgtin: item.sgtin,
        locationId: item.locationId,
        lastRead: item.lastReadDateTime,
        overheadLastRead: item.overheadLastReadDateTime,
        xCoordinate: item.xCoordinate,
        yCoordinate: item.yCoordinate,
        zone: item.zone
      };
    } catch (error) {
      console.error('Error fetching last RFID read:', error);
      return null;
    }
  }
  
  // ==========================================================================
  // INVENTORY STATUS LOOKUP
  // ==========================================================================
  
  /**
   * Parse unit inventory status to human-readable description
   * Based on UnitInventoryStatus.csv provided by user
   */
  parseUnitStatus(status) {
    const statusMap = {
      'Available': {
        description: 'Unit available to a location',
        category: 'ready'
      },
      'InBound': {
        description: 'Unit inbound to a location',
        category: 'in_transit'
      },
      'Reserved': {
        description: 'Unit is reserved for a package',
        category: 'allocated'
      },
      'Departed': {
        description: 'Unit is departed to a location or address',
        category: 'in_transit'
      },
      'Received': {
        description: 'Unit is received in a location',
        category: 'ready'
      },
      'Missing': {
        description: 'Unit is not received as part of the package',
        category: 'alert'
      },
      'Unexpected': {
        description: 'Unexpected unit found during Store counting',
        category: 'alert'
      },
      'Removed': {
        description: 'Unit written off/subtracted using adjustment type',
        category: 'removed'
      },
      'PendingReceipt': {
        description: 'Unit found for a package receiving unit',
        category: 'in_transit'
      },
      'TemporaryUnavailable': {
        description: 'Temporary unavailable due to external event (loaning or tailoring)',
        category: 'in_production'
      }
    };
    
    return statusMap[status] || {
      description: status,
      category: 'unknown'
    };
  }
  
  /**
   * Map Manhattan status to pickup workflow stage
   */
  mapStatusToWorkflowStage(unitStatus, storeEvent) {
    // TemporaryUnavailable + tailoring = in production
    if (unitStatus === 'TemporaryUnavailable') {
      if (storeEvent && storeEvent.toLowerCase().includes('tailor')) {
        return 'production';
      }
      return 'measuring';
    }
    
    // Available = ready for pickup
    if (unitStatus === 'Available') {
      return 'ready';
    }
    
    // Received = received from warehouse
    if (unitStatus === 'Received') {
      return 'received';
    }
    
    // Reserved = allocated to customer
    if (unitStatus === 'Reserved') {
      return 'production';
    }
    
    // InBound/Departed = in transit
    if (unitStatus === 'InBound' || unitStatus === 'Departed') {
      return 'received';
    }
    
    return 'received';
  }
  
  // ==========================================================================
  // LOCATION TRACKING
  // ==========================================================================
  
  /**
   * Get units in specific zone
   * @param {String} locationId - Location ID
   * @param {String} zone - Zone name
   */
  async getUnitsInZone(locationId, zone) {
    const response = await this.client.get('/omni/v1/units', {
      params: {
        locationId: locationId,
        zone: zone,
        tenantId: this.tenantId
      }
    });
    return response.data;
  }
  
  /**
   * Track unit movement through zones
   * Useful for tracking COG → BOH → Rack flow
   */
  async trackUnitMovement(sgtin) {
    try {
      const history = await this.getRFIDHistory(sgtin);
      
      // Parse history to extract zone movements
      const movements = history.map(event => ({
        timestamp: event.timestamp,
        location: event.locationId,
        zone: event.zone,
        xCoordinate: event.xCoordinate,
        yCoordinate: event.yCoordinate,
        scanType: event.scanType,
        event: event.storeEvent
      }));
      
      // Sort by timestamp
      movements.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      return movements;
    } catch (error) {
      console.error('Error tracking unit movement:', error);
      return [];
    }
  }
}

// ==========================================================================
// EXPORTS
// ==========================================================================

// Singleton instance
let defaultClient = null;

/**
 * Get default Manhattan client instance
 */
function getManhattanClient() {
  if (!defaultClient) {
    defaultClient = new ManhattanClient();
  }
  return defaultClient;
}

module.exports = {
  ManhattanClient,
  getManhattanClient
};
