/**
 * Mock PredictSpring Client
 * 
 * Simulates PredictSpring OMS API responses for development/testing.
 * Replace with real PredictSpring integration when API credentials are available.
 * 
 * This mock maintains the same interface as the real client, so switching is seamless.
 */

const MOCK_ENABLED = process.env.MOCK_PREDICTSPRING === 'true' || !process.env.PREDICTSPRING_API_KEY;

class MockPredictSpringClient {
  constructor() {
    this.mockOrders = new Map();
    this.initializeMockData();
  }

  /**
   * Initialize sample order data
   */
  initializeMockData() {
    // Sample orders for testing
    const sampleOrders = [
      {
        id: 'mock-001',
        orderNumber: 'ORD-2026-001',
        psuNumber: 'PSU12345',
        customerName: 'John Smith',
        customerEmail: 'john.smith@example.com',
        status: 'CONFIRMED',
        totalAmount: 1299.00,
        createdAt: new Date('2026-01-08T10:30:00Z'),
        items: [
          {
            id: 'item-001',
            sku: 'SUIT-BLK-42R',
            description: 'Black Napoli Suit 42R',
            price: 599.00,
            quantity: 1,
            size: '42R',
            color: 'Black'
          },
          {
            id: 'item-002',
            sku: 'SHIRT-WHT-16-34',
            description: 'White Dress Shirt 16/34',
            price: 129.00,
            quantity: 2,
            size: '16/34',
            color: 'White'
          },
          {
            id: 'item-003',
            sku: 'TIE-NAVY-STD',
            description: 'Navy Silk Tie',
            price: 89.00,
            quantity: 3,
            size: 'One Size',
            color: 'Navy'
          },
          {
            id: 'item-004',
            sku: 'SHOES-BRN-10',
            description: 'Brown Leather Shoes Size 10',
            price: 299.00,
            quantity: 1,
            size: '10',
            color: 'Brown'
          }
        ],
        shippingAddress: {
          name: 'John Smith',
          street1: '123 Market St',
          street2: 'Apt 4B',
          city: 'San Francisco',
          state: 'CA',
          zip: '94103',
          country: 'US',
          phone: '415-555-0123'
        },
        fulfillmentStatus: 'PENDING_PICK'
      },
      {
        id: 'mock-002',
        orderNumber: 'ORD-2026-002',
        psuNumber: 'PSU67890',
        customerName: 'Sarah Johnson',
        customerEmail: 'sarah.j@example.com',
        status: 'READY_TO_SHIP',
        totalAmount: 899.00,
        createdAt: new Date('2026-01-09T14:15:00Z'),
        items: [
          {
            id: 'item-005',
            sku: 'SUIT-NVY-40R',
            description: 'Navy Lazio Suit 40R',
            price: 699.00,
            quantity: 1,
            size: '40R',
            color: 'Navy'
          },
          {
            id: 'item-006',
            sku: 'TIE-RED-STD',
            description: 'Red Silk Tie',
            price: 89.00,
            quantity: 1,
            size: 'One Size',
            color: 'Red'
          },
          {
            id: 'item-007',
            sku: 'BELT-BLK-36',
            description: 'Black Leather Belt Size 36',
            price: 119.00,
            quantity: 1,
            size: '36',
            color: 'Black'
          }
        ],
        shippingAddress: {
          name: 'Sarah Johnson',
          street1: '456 Valencia St',
          city: 'San Francisco',
          state: 'CA',
          zip: '94110',
          country: 'US',
          phone: '415-555-0456'
        },
        fulfillmentStatus: 'PICKED'
      },
      {
        id: 'mock-003',
        orderNumber: 'ORD-2026-003',
        psuNumber: 'PSU11111',
        customerName: 'Michael Chen',
        customerEmail: 'mchen@example.com',
        status: 'SHIPPED',
        totalAmount: 2199.00,
        createdAt: new Date('2026-01-07T09:00:00Z'),
        items: [
          {
            id: 'item-008',
            sku: 'SUIT-GRY-44L',
            description: 'Gray Havana Suit 44L',
            price: 799.00,
            quantity: 1,
            size: '44L',
            color: 'Gray'
          },
          {
            id: 'item-009',
            sku: 'COAT-BLK-44',
            description: 'Black Overcoat Size 44',
            price: 899.00,
            quantity: 1,
            size: '44',
            color: 'Black'
          },
          {
            id: 'item-010',
            sku: 'SCARF-GRY-STD',
            description: 'Gray Wool Scarf',
            price: 149.00,
            quantity: 1,
            size: 'One Size',
            color: 'Gray'
          }
        ],
        shippingAddress: {
          name: 'Michael Chen',
          street1: '789 Mission St',
          city: 'San Francisco',
          state: 'CA',
          zip: '94105',
          country: 'US',
          phone: '415-555-0789'
        },
        fulfillmentStatus: 'SHIPPED',
        trackingNumber: 'UPS1234567890'
      }
    ];

    sampleOrders.forEach(order => {
      this.mockOrders.set(order.psuNumber, order);
      this.mockOrders.set(order.orderNumber, order);
    });

    console.log('[MockPredictSpring] Initialized with', sampleOrders.length, 'sample orders');
  }

  /**
   * Get order by PSU number or order number
   * Signature matches real PredictSpring client
   */
  async getOrder(identifier) {
    if (!MOCK_ENABLED) {
      throw new Error('PredictSpring mock is disabled. Set MOCK_PREDICTSPRING=true or provide PREDICTSPRING_API_KEY');
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const order = this.mockOrders.get(identifier);
    
    if (!order) {
      throw new Error(`Order not found: ${identifier}`);
    }

    console.log(`[MockPredictSpring] Retrieved order: ${identifier}`);
    return order;
  }

  /**
   * Get multiple orders with filters
   */
  async getOrders(filters = {}) {
    if (!MOCK_ENABLED) {
      throw new Error('PredictSpring mock is disabled');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    let orders = Array.from(this.mockOrders.values())
      .filter((order, index, self) => 
        // Deduplicate (orders are stored twice: by PSU and order number)
        self.findIndex(o => o.id === order.id) === index
      );

    // Apply filters
    if (filters.status) {
      orders = orders.filter(o => o.status === filters.status);
    }
    if (filters.fulfillmentStatus) {
      orders = orders.filter(o => o.fulfillmentStatus === filters.fulfillmentStatus);
    }
    if (filters.fromDate) {
      orders = orders.filter(o => new Date(o.createdAt) >= new Date(filters.fromDate));
    }

    console.log(`[MockPredictSpring] Retrieved ${orders.length} orders with filters:`, filters);
    return orders;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(identifier, status) {
    if (!MOCK_ENABLED) {
      throw new Error('PredictSpring mock is disabled');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const order = this.mockOrders.get(identifier);
    if (!order) {
      throw new Error(`Order not found: ${identifier}`);
    }

    order.status = status;
    order.updatedAt = new Date();

    console.log(`[MockPredictSpring] Updated order ${identifier} status to ${status}`);
    return order;
  }

  /**
   * Add mock order (for testing)
   */
  addMockOrder(order) {
    if (!order.psuNumber || !order.orderNumber) {
      throw new Error('Order must have psuNumber and orderNumber');
    }

    this.mockOrders.set(order.psuNumber, order);
    this.mockOrders.set(order.orderNumber, order);
    
    console.log(`[MockPredictSpring] Added mock order: ${order.psuNumber}`);
    return order;
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'ok',
      mock: true,
      ordersCount: Array.from(this.mockOrders.values()).filter((order, index, self) => 
        self.findIndex(o => o.id === order.id) === index
      ).length
    };
  }
}

// Export singleton instance
const mockClient = new MockPredictSpringClient();

module.exports = {
  MockPredictSpringClient,
  mockClient,
  MOCK_ENABLED
};
