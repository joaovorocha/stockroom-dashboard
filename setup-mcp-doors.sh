#!/bin/bash

# MCP Doors Setup Script for Stockroom Dashboard
# This script configures MCP (Model Context Protocol) servers for AI agent integration

echo "Setting up MCP Doors for Stockroom Dashboard..."

# Create MCP servers directory if it doesn't exist
mkdir -p mcp-servers

# Make server files executable
chmod +x mcp-servers/*.js
chmod +x mcp-servers/*.py

# Install dependencies
echo "Installing MCP SDK dependencies..."
npm install @modelcontextprotocol/sdk
python -m pip install mcp

# Create client configuration example
cat > mcp-client-config.json << 'EOF'
{
  "mcpServers": {
    "stockroom-inventory": {
      "command": "node",
      "args": ["mcp-servers/inventory-server.js"],
      "env": {
        "STOCKROOM_DATA_DIR": "/var/lib/stockroom-dashboard/data",
        "STOCKROOM_FILES_DIR": "/var/lib/stockroom-dashboard/files"
      }
    },
    "stockroom-shipments": {
      "command": "node",
      "args": ["mcp-servers/shipments-server.js"],
      "env": {
        "STOCKROOM_DATA_DIR": "/var/lib/stockroom-dashboard/data"
      }
    },
    "stockroom-radio": {
      "command": "python",
      "args": ["mcp-servers/radio-server.py"],
      "env": {
        "PYTHONPATH": "/var/www/stockroom-dashboard"
      }
    }
  }
}
EOF

echo "MCP Doors setup complete!"
echo ""
echo "To use MCP doors with AI agents:"
echo "1. Configure your AI client to use the mcp-client-config.json"
echo "2. Each MCP server provides tools for different aspects of your stockroom:"
echo "   - stockroom-inventory: Inventory management and queries"
echo "   - stockroom-shipments: Shipping and package tracking"
echo "   - stockroom-radio: Radio communication monitoring"
echo ""
echo "Example tools available:"
echo "- get_inventory_status: Get inventory statistics"
echo "- search_inventory: Search for items"
echo "- get_shipments: List shipments"
echo "- get_radio_status: Check radio monitoring status"