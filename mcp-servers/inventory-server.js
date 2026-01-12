#!/usr/bin/env node

// Simple MCP Server for Stockroom Inventory
// This demonstrates the basic structure - expand with full MCP SDK when available

const fs = require('fs');
const path = require('path');

class SimpleMCPServer {
  constructor(name) {
    this.name = name;
    this.tools = {};
  }

  // Register a tool
  registerTool(name, handler, schema) {
    this.tools[name] = { handler, schema };
  }

  // Handle incoming messages (simplified)
  async handleMessage(message) {
    try {
      const data = JSON.parse(message);

      if (data.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: data.id,
          result: {
            tools: Object.entries(this.tools).map(([name, { schema }]) => ({
              name,
              ...schema
            }))
          }
        };
      }

      if (data.method === 'tools/call') {
        const { name, arguments: args } = data.params;
        if (this.tools[name]) {
          const result = await this.tools[name].handler(args);
          return {
            jsonrpc: '2.0',
            id: data.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            }
          };
        }
      }

      return {
        jsonrpc: '2.0',
        id: data.id,
        error: { code: -32601, message: 'Method not found' }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: data.id || null,
        error: { code: -32700, message: 'Parse error', data: error.message }
      };
    }
  }

  // Start the server
  async start() {
    console.error(`${this.name} MCP Server starting...`);

    process.stdin.on('data', async (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        const response = await this.handleMessage(message);
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    });

    process.stdin.on('end', () => {
      console.error(`${this.name} MCP Server shutting down...`);
      process.exit(0);
    });
  }
}

// Create inventory server
const server = new SimpleMCPServer('stockroom-inventory');

// Register tools
server.registerTool(
  'get_inventory_status',
  async (args) => {
    try {
      const dataDir = process.env.STOCKROOM_DATA_DIR || '/var/lib/stockroom-dashboard/data';
      const inventoryPath = path.join(dataDir, 'inventory.json');

      if (!fs.existsSync(inventoryPath)) {
        return { error: 'No inventory data found' };
      }

      const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
      const items = inventory.items || [];

      return {
        total_items: items.length,
        categories: [...new Set(items.map(item => item.category || 'uncategorized'))],
        locations: [...new Set(items.map(item => item.location || 'unknown'))],
        low_stock: items.filter(item => (item.quantity || 0) < 5).length
      };
    } catch (error) {
      return { error: error.message };
    }
  },
  {
    description: 'Get current inventory status and statistics',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category (optional)' },
        location: { type: 'string', description: 'Filter by location (optional)' }
      }
    }
  }
);

server.registerTool(
  'search_inventory',
  async (args) => {
    try {
      const dataDir = process.env.STOCKROOM_DATA_DIR || '/var/lib/stockroom-dashboard/data';
      const inventoryPath = path.join(dataDir, 'inventory.json');

      if (!fs.existsSync(inventoryPath)) {
        return { error: 'No inventory data found' };
      }

      const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
      const items = inventory.items || [];
      const query = (args.query || '').toLowerCase();
      const limit = args.limit || 10;

      const results = items
        .filter(item =>
          (item.name || '').toLowerCase().includes(query) ||
          (item.description || '').toLowerCase().includes(query) ||
          (item.sku || '').toLowerCase().includes(query)
        )
        .slice(0, limit);

      return results;
    } catch (error) {
      return { error: error.message };
    }
  },
  {
    description: 'Search for items in inventory',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results to return', default: 10 }
      },
      required: ['query']
    }
  }
);

// Start the server
server.start().catch(console.error);