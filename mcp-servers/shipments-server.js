#!/usr/bin/env node

// Simple MCP Server for Stockroom Shipments
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

// Create shipments server
const server = new SimpleMCPServer('stockroom-shipments');

// Register tools
server.registerTool(
  'get_shipments',
  async (args) => {
    try {
      const dataDir = process.env.STOCKROOM_DATA_DIR || '/var/lib/stockroom-dashboard/data';
      const shipmentsPath = path.join(dataDir, 'shipments.json');

      if (!fs.existsSync(shipmentsPath)) {
        return { error: 'No shipments data found' };
      }

      const shipments = JSON.parse(fs.readFileSync(shipmentsPath, 'utf8'));
      let shipmentList = shipments.shipments || [];

      // Apply filters
      if (args.status) {
        shipmentList = shipmentList.filter(s => s.status === args.status);
      }

      const limit = args.limit || 20;
      shipmentList = shipmentList.slice(0, limit);

      return shipmentList;
    } catch (error) {
      return { error: error.message };
    }
  },
  {
    description: 'Get list of shipments with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (pending, shipped, delivered)' },
        limit: { type: 'number', description: 'Maximum results to return', default: 20 }
      }
    }
  }
);

server.registerTool(
  'get_shipment_details',
  async (args) => {
    try {
      const dataDir = process.env.STOCKROOM_DATA_DIR || '/var/lib/stockroom-dashboard/data';
      const shipmentsPath = path.join(dataDir, 'shipments.json');

      if (!fs.existsSync(shipmentsPath)) {
        return { error: 'No shipments data found' };
      }

      const shipments = JSON.parse(fs.readFileSync(shipmentsPath, 'utf8'));
      const shipmentList = shipments.shipments || [];

      const shipment = shipmentList.find(s => s.trackingNumber === args.trackingNumber);

      if (!shipment) {
        return { error: 'Shipment not found' };
      }

      return shipment;
    } catch (error) {
      return { error: error.message };
    }
  },
  {
    description: 'Get detailed information about a specific shipment',
    inputSchema: {
      type: 'object',
      properties: {
        trackingNumber: { type: 'string', description: 'UPS tracking number' }
      },
      required: ['trackingNumber']
    }
  }
);

server.registerTool(
  'create_shipment',
  async (args) => {
    try {
      const dataDir = process.env.STOCKROOM_DATA_DIR || '/var/lib/stockroom-dashboard/data';
      const shipmentsPath = path.join(dataDir, 'shipments.json');

      let shipments = { shipments: [] };
      if (fs.existsSync(shipmentsPath)) {
        shipments = JSON.parse(fs.readFileSync(shipmentsPath, 'utf8'));
      }

      const newShipment = {
        id: Date.now().toString(),
        trackingNumber: `1Z${Math.random().toString(36).substr(2, 15).toUpperCase()}`,
        recipient: args.recipient,
        address: args.address,
        items: args.items,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      shipments.shipments.push(newShipment);

      fs.writeFileSync(shipmentsPath, JSON.stringify(shipments, null, 2));

      return { success: true, trackingNumber: newShipment.trackingNumber };
    } catch (error) {
      return { error: error.message };
    }
  },
  {
    description: 'Create a new shipment record',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient name' },
        address: { type: 'string', description: 'Shipping address' },
        items: { type: 'array', description: 'Array of items to ship' }
      },
      required: ['recipient', 'address', 'items']
    }
  }
);

// Start the server
server.start().catch(console.error);