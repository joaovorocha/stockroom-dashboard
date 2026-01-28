#!/bin/bash

# MCP Doors Test Script
# Tests each MCP server to ensure they're functioning correctly

echo "Testing MCP Doors for Stockroom Dashboard..."
echo "=========================================="

# Test inventory server
echo ""
echo "Testing Inventory Server..."
echo "---------------------------"
timeout 5s node mcp-servers/inventory-server.js < /dev/null 2>&1 | head -10

# Test shipments server
echo ""
echo "Testing Shipments Server..."
echo "---------------------------"
timeout 5s node mcp-servers/shipments-server.js < /dev/null 2>&1 | head -10

# Test radio server
echo ""
echo "Testing Radio Server..."
echo "-----------------------"
timeout 5s python mcp-servers/radio-server.py < /dev/null 2>&1 | head -10

echo ""
echo "=========================================="
echo "MCP Doors test complete!"
echo ""
echo "If you see initialization messages above, the servers are working."
echo "If you see errors, check the MCP_DOORS_README.md for troubleshooting."