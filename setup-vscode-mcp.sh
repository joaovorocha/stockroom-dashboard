#!/bin/bash

# VSCode MCP Setup Script
# Configures MCP servers for Claude and Copilot in VSCode

echo "🚀 Setting up MCP for VSCode (Google & Claude)..."
echo ""

# Check if VSCode is available
if ! command -v code &> /dev/null; then
    echo "⚠️  VSCode CLI not found. Please install VSCode and ensure 'code' command is available."
    echo "   You can still configure manually using the provided config files."
    echo ""
fi

echo "📦 Required VSCode Extensions:"
echo "   • anthropic.claude-code (Claude Code)"
echo "   • saoudrizwan.claude-dev (Cline - Advanced Claude)"
echo "   • automatalabs.copilot-mcp (Copilot MCP)"
echo ""

echo "🔧 Configuration Files Created:"
echo "   • claude-vscode-config.json - For Claude Code extension"
echo "   • copilot-mcp-config.json - For Copilot MCP extension"
echo ""

echo "📋 Manual Setup Instructions:"
echo ""
echo "1. CLAUDE CODE EXTENSION:"
echo "   Copy claude-vscode-config.json to:"
echo "   ~/.config/Code/User/globalStorage/anthropic.claude-code/settings.json"
echo ""
echo "2. COPILOT MCP EXTENSION:"
echo "   Use the extension's UI in VSCode Settings → Extensions → Copilot MCP"
echo "   Or import copilot-mcp-config.json"
echo ""
echo "3. CLINE EXTENSION:"
echo "   Add to VSCode settings.json:"
echo '   "cline.mcp": {'
echo '     "stockroom-inventory": {'
echo '       "command": "node",'
echo '       "args": ["/var/www/stockroom-dashboard/mcp-servers/inventory-server.js"],'
echo '       "env": {"STOCKROOM_DATA_DIR": "/var/lib/stockroom-dashboard/data"}'
echo '     }'
echo '   }'
echo ""

echo "🧪 Test Commands:"
echo "   Claude Code: /tools"
echo "   Copilot: @mcp list servers"
echo "   Cline: Use chat interface"
echo ""

echo "✅ Setup complete! Check VSCODE_MCP_SETUP.md for detailed instructions."