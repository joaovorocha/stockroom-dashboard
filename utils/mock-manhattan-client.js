/**
 * Mock Manhattan Active Cloud Client
 * 
 * Simulates Manhattan WMS API responses for development/testing.
 * Replace with real Manhattan integration when API credentials are available.
 * 
 * This mock maintains the same interface as the real client, so switching is seamless.
 */

const MOCK_ENABLED = process.env.MOCK_MANHATTAN === 'true' || !process.env.MANHATTAN_API_KEY;

class MockManhattanClient {
  constructor() {
    this.mockInventory = new Map();
    this.mockLocations = new Map();
    this.initializeMockData();
  }

  /**
   * Initialize sample inventory data
   */
  initializeMockData() {
    // Sample inventory records
    const sampleInventory = [
      {
        unitId: 'UNIT-001-SF-42R',
        sku: 'SUIT-BLK-42R',
        description: 'Black Napoli Suit 42R',
        location: 'A1-B2',
        zone: 'SUITS',
        quantity: 3,
        status: 'AVAILABLE',
        lastUpdated: new Date('2026-01-10T08:00:00Z')
      },
      {
        unitId: 'UNIT-002-SF-40R',
        sku: 'SUIT-NVY-40R',
        description: 'Navy Lazio Suit 40R',
        location: 'A1-B3',
        zone: 'SUITS',
        quantity: 5,
        status: 'AVAILABLE',
        lastUpdated: new Date('2026-01-10T08:00:00Z')
      },
      {
        unitId: 'UNIT-003-SF-44L',
        sku: 'SUIT-GRY-44L',
        description: 'Gray Havana Suit 44L',
        location: 'A2-C1',
        zone: 'SUITS',
        quantity: 2,
        status: 'AVAILABLE',
        lastUpdated: new Date('2026-01-10T08:00:00Z')
      },
      {
        unitId: 'UNIT-004-SF-16-34',
        sku: 'SHIRT-WHT-16-34',
        description: 'White Dress Shirt 16/34',
        location: 'B1-A1',
        zone: 'SHIRTS',
        quantity: 12,
        status: 'AVAILABLE',
        lastUpdated: new Date('2026-01-10T08:00:00Z')
      },
      {
        unitId: 'UNIT-005-SF-TIE',
        sku: 'TIE-NAVY-STD',
        description: 'Navy Silk Tie',
        location: 'C1-D2',
        zone: 'ACCESSORIES',
        quantity: 8,
        status: 'AVAILABLE',
        lastUpdated: new Date('2026-01-10T08:00:00Z')
      },
      {
        unitId: 'UNIT-006-SF-SH10',
        sku: 'SHOES-BRN-10',
        description: 'Brown Leather Shoes Size 10',
        location: 'D1-E3',
        zone: 'SHOES',
        quantity: 4,
        status: 'AVAILABLE',
        lastUpdated: new Date('2026-01-10T08:00:00Z')
      }
    ];

    sampleInventory.forEach(item => {
      this.mockInventory.set(item.unitId, item);
      // Also index by SKU for quick lookup
      const skuItems = this.mockInventory.get(`sku:${item.sku}`) || [];
      skuItems.push(item);
      this.mockInventory.set(`sku:${item.sku}`, skuItems);
    });

    // Sample location data
    const sampleLocations = [
      { code: 'A1-B2', zone: 'SUITS', capacity: 50, occupied: 35, type: 'HANGING' },
      { code: 'A1-B3', zone: 'SUITS', capacity: 50, occupied: 42, type: 'HANGING' },
      { code: 'A2-C1', zone: 'SUITS', capacity: 50, occupied: 28, type: 'HANGING' },
      { code: 'B1-A1', zone: 'SHIRTS', capacity: 100, occupied: 67, type: 'SHELF' },
      { code: 'C1-D2', zone: 'ACCESSORIES', capacity: 200, occupied: 145, type: 'DRAWER' },
      { code: 'D1-E3', zone: 'SHOES', capacity: 75, occupied: 52, type: 'SHELF' }
    ];

    sampleLocations.forEach(loc => {
      this.mockLocations.set(loc.code, loc);
    });

    console.log('[MockManhattan] Initialized with', sampleInventory.length, 'inventory items and', sampleLocations.length, 'locations');
  }

  /**
   * Get unit inventory by Unit ID
   */
  async getUnitInventory(unitId) {
    if (!MOCK_ENABLED) {
      throw new Error('Manhattan mock is disabled. Set MOCK_MANHATTAN=true or provide MANHATTAN_API_KEY');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const unit = this.mockInventory.get(unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    console.log(`[MockManhattan] Retrieved unit: ${unitId}`);
    return unit;
  }

  /**
   * Get inventory by SKU
   */
  async getInventoryBySKU(sku) {
    if (!MOCK_ENABLED) {
      throw new Error('Manhattan mock is disabled');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const items = this.mockInventory.get(`sku:${sku}`) || [];
    
    console.log(`[MockManhattan] Retrieved ${items.length} items for SKU: ${sku}`);
    return items;
  }

  /**
   * Get location details
   */
  async getLocation(locationCode) {
    if (!MOCK_ENABLED) {
      throw new Error('Manhattan mock is disabled');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const location = this.mockLocations.get(locationCode);
    if (!location) {
      throw new Error(`Location not found: ${locationCode}`);
    }

    console.log(`[MockManhattan] Retrieved location: ${locationCode}`);
    return location;
  }

  /**
   * Update inventory quantity
   */
  async updateInventory(unitId, quantity) {
    if (!MOCK_ENABLED) {
      throw new Error('Manhattan mock is disabled');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const unit = this.mockInventory.get(unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    unit.quantity = quantity;
    unit.lastUpdated = new Date();

    console.log(`[MockManhattan] Updated unit ${unitId} quantity to ${quantity}`);
    return unit;
  }

  /**
   * Get all inventory (with optional filters)
   */
  async getAllInventory(filters = {}) {
    if (!MOCK_ENABLED) {
      throw new Error('Manhattan mock is disabled');
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    let inventory = Array.from(this.mockInventory.values())
      .filter(item => item.unitId) // Filter out indexed entries
      .filter(item => {
        if (filters.zone && item.zone !== filters.zone) return false;
        if (filters.location && item.location !== filters.location) return false;
        if (filters.status && item.status !== filters.status) return false;
        return true;
      });

    console.log(`[MockManhattan] Retrieved ${inventory.length} inventory items with filters:`, filters);
    return inventory;
  }

  /**
   * Add mock inventory (for testing)
   */
  addMockInventory(item) {
    if (!item.unitId || !item.sku) {
      throw new Error('Item must have unitId and sku');
    }

    this.mockInventory.set(item.unitId, item);
    
    const skuItems = this.mockInventory.get(`sku:${item.sku}`) || [];
    skuItems.push(item);
    this.mockInventory.set(`sku:${item.sku}`, skuItems);

    console.log(`[MockManhattan] Added mock inventory: ${item.unitId}`);
    return item;
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      status: 'ok',
      mock: true,
      inventoryCount: Array.from(this.mockInventory.values()).filter(item => item.unitId).length,
      locationsCount: this.mockLocations.size
    };
  }
}

// Export singleton instance
const mockClient = new MockManhattanClient();

module.exports = {
  MockManhattanClient,
  mockClient,
  MOCK_ENABLED
};
