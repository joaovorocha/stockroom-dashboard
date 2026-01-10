/**
 * WaitWhile API Client
 * 
 * Official API client for WaitWhile appointment and waitlist management.
 * Handles OAuth2 authentication, API requests, and webhook processing.
 * 
 * API Documentation: https://developers.waitwhile.com/
 * 
 * Required Environment Variables:
 * - WAITWHILE_API_KEY: Your WaitWhile API key
 * - WAITWHILE_LOCATION_ID: Your location ID (optional, defaults to first location)
 */

const axios = require('axios');

class WaitWhileClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.WAITWHILE_API_KEY;
    this.locationId = options.locationId || process.env.WAITWHILE_LOCATION_ID;
    this.baseURL = options.baseURL || 'https://api.waitwhile.com/v2';
    
    if (!this.apiKey) {
      console.warn('⚠️  WaitWhile API key not configured. Set WAITWHILE_API_KEY in .env');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'apikey': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          console.error('WaitWhile API error:', error.response.status, error.response.data);
        } else if (error.request) {
          console.error('WaitWhile API no response:', error.message);
        } else {
          console.error('WaitWhile API request error:', error.message);
        }
        throw error;
      }
    );
  }
  
  /**
   * Check if client is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
  
  // ==========================================================================
  // LOCATIONS
  // ==========================================================================
  
  /**
   * Get all locations
   */
  async getLocations() {
    const response = await this.client.get('/locations');
    return response.data;
  }
  
  /**
   * Get location by ID
   */
  async getLocation(locationId = null) {
    const id = locationId || this.locationId;
    if (!id) {
      throw new Error('Location ID required');
    }
    const response = await this.client.get(`/locations/${id}`);
    return response.data;
  }
  
  // ==========================================================================
  // CUSTOMERS
  // ==========================================================================
  
  /**
   * Get all customers
   */
  async getCustomers(params = {}) {
    const response = await this.client.get('/customers', { params });
    return response.data;
  }
  
  /**
   * Get customer by ID
   */
  async getCustomer(customerId) {
    const response = await this.client.get(`/customers/${customerId}`);
    return response.data;
  }
  
  /**
   * Search customers by email or phone
   */
  async searchCustomers(query) {
    const params = {};
    
    if (query.email) {
      params.email = query.email;
    }
    
    if (query.phone) {
      params.phone = query.phone;
    }
    
    if (query.name) {
      params.name = query.name;
    }
    
    const response = await this.client.get('/customers', { params });
    return response.data;
  }
  
  /**
   * Create customer
   */
  async createCustomer(customer) {
    const response = await this.client.post('/customers', customer);
    return response.data;
  }
  
  /**
   * Update customer
   */
  async updateCustomer(customerId, updates) {
    const response = await this.client.put(`/customers/${customerId}`, updates);
    return response.data;
  }
  
  // ==========================================================================
  // VISITS (Appointments/Bookings)
  // ==========================================================================
  
  /**
   * Get all visits for location
   * @param {Object} options - Filter options
   * @param {String} options.locationId - Location ID (defaults to configured location)
   * @param {String} options.state - Filter by state: 'booked', 'waiting', 'serving', 'complete', 'cancelled'
   * @param {Date} options.fromDate - Filter from date
   * @param {Date} options.toDate - Filter to date
   * @param {String} options.resourceId - Filter by resource (staff) ID
   * @param {Number} options.limit - Limit results
   */
  async getVisits(options = {}) {
    const params = {
      locationId: options.locationId || this.locationId
    };
    
    if (options.state) {
      params.state = options.state;
    }
    
    if (options.fromDate) {
      params.fromDate = options.fromDate.toISOString();
    }
    
    if (options.toDate) {
      params.toDate = options.toDate.toISOString();
    }
    
    if (options.resourceId) {
      params.resourceId = options.resourceId;
    }
    
    if (options.limit) {
      params.limit = options.limit;
    }
    
    const response = await this.client.get('/visits', { params });
    return response.data;
  }
  
  /**
   * Get visit by ID
   */
  async getVisit(visitId) {
    const response = await this.client.get(`/visits/${visitId}`);
    return response.data;
  }
  
  /**
   * Get today's bookings
   */
  async getTodaysBookings(locationId = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getVisits({
      locationId: locationId || this.locationId,
      state: 'booked',
      fromDate: today,
      toDate: tomorrow
    });
  }
  
  /**
   * Get current waitlist
   */
  async getWaitlist(locationId = null) {
    return this.getVisits({
      locationId: locationId || this.locationId,
      state: 'waiting'
    });
  }
  
  /**
   * Get currently serving
   */
  async getServing(locationId = null) {
    return this.getVisits({
      locationId: locationId || this.locationId,
      state: 'serving'
    });
  }
  
  /**
   * Get pickup appointments (tagged with 'Pick-Up')
   */
  async getPickupAppointments(options = {}) {
    const visits = await this.getVisits({
      ...options,
      locationId: options.locationId || this.locationId,
      state: options.state || 'booked'
    });
    
    // Filter for pickups (visits with 'Pick-Up' or 'pick-up' tag)
    return visits.filter(visit => {
      const tags = visit.tags || [];
      return tags.some(tag => 
        tag.toLowerCase().includes('pick') || 
        tag.toLowerCase().includes('pickup')
      );
    });
  }
  
  /**
   * Create visit/booking
   */
  async createVisit(visit) {
    const response = await this.client.post('/visits', visit);
    return response.data;
  }
  
  /**
   * Update visit
   */
  async updateVisit(visitId, updates) {
    const response = await this.client.put(`/visits/${visitId}`, updates);
    return response.data;
  }
  
  /**
   * Cancel visit
   */
  async cancelVisit(visitId, reason = null) {
    const updates = { state: 'cancelled' };
    if (reason) {
      updates.notes = reason;
    }
    return this.updateVisit(visitId, updates);
  }
  
  /**
   * Mark visit as complete
   */
  async completeVisit(visitId, notes = null) {
    const updates = { state: 'complete' };
    if (notes) {
      updates.notes = notes;
    }
    return this.updateVisit(visitId, updates);
  }
  
  // ==========================================================================
  // RESOURCES (Staff/Style Advisors)
  // ==========================================================================
  
  /**
   * Get all resources (staff) for location
   */
  async getResources(locationId = null) {
    const params = {
      locationId: locationId || this.locationId
    };
    
    const response = await this.client.get('/resources', { params });
    return response.data;
  }
  
  /**
   * Get resource by ID
   */
  async getResource(resourceId) {
    const response = await this.client.get(`/resources/${resourceId}`);
    return response.data;
  }
  
  // ==========================================================================
  // SERVICES
  // ==========================================================================
  
  /**
   * Get all services for location
   */
  async getServices(locationId = null) {
    const params = {
      locationId: locationId || this.locationId
    };
    
    const response = await this.client.get('/services', { params });
    return response.data;
  }
  
  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================
  
  /**
   * Process webhook event
   * @param {Object} event - Webhook event from WaitWhile
   * @returns {Object} Parsed event data
   */
  processWebhook(event) {
    const eventType = event.type || event.event;
    const data = event.data || event;
    
    return {
      type: eventType,
      timestamp: new Date(event.timestamp || Date.now()),
      data: data,
      
      // Helper methods
      isVisitCreated: () => eventType === 'visit.created',
      isVisitUpdated: () => eventType === 'visit.updated',
      isVisitCancelled: () => eventType === 'visit.cancelled',
      isVisitComplete: () => eventType === 'visit.complete',
      isPickup: () => {
        const tags = data.tags || [];
        return tags.some(tag => tag.toLowerCase().includes('pick'));
      }
    };
  }
  
  // ==========================================================================
  // CUSTOMER LOOKUP FOR PICKUPS
  // ==========================================================================
  
  /**
   * Find all visits for a customer (by email or phone)
   * This is used to connect WaitWhile appointments to Manhattan orders
   */
  async findCustomerVisits(identifier) {
    // First, find customer
    const customers = await this.searchCustomers(identifier);
    
    if (customers.length === 0) {
      return {
        customer: null,
        visits: []
      };
    }
    
    const customer = customers[0];
    
    // Get all visits for this customer
    const params = {
      locationId: this.locationId,
      customerId: customer.id,
      limit: 100
    };
    
    const response = await this.client.get('/visits', { params });
    
    return {
      customer: customer,
      visits: response.data || []
    };
  }
  
  /**
   * Get customer's upcoming pickup appointments
   */
  async getCustomerPickups(identifier) {
    const { customer, visits } = await this.findCustomerVisits(identifier);
    
    if (!customer) {
      return [];
    }
    
    // Filter for pickup appointments (with 'Pick-Up' tag)
    const pickupVisits = visits.filter(visit => {
      const tags = visit.tags || [];
      const isPickup = tags.some(tag => tag.toLowerCase().includes('pick'));
      const notComplete = visit.state !== 'complete' && visit.state !== 'cancelled';
      return isPickup && notComplete;
    });
    
    return pickupVisits;
  }
}

// ==========================================================================
// EXPORTS
// ==========================================================================

// Singleton instance
let defaultClient = null;

/**
 * Get default WaitWhile client instance
 */
function getWaitWhileClient() {
  if (!defaultClient) {
    defaultClient = new WaitWhileClient();
  }
  return defaultClient;
}

module.exports = {
  WaitWhileClient,
  getWaitWhileClient
};
