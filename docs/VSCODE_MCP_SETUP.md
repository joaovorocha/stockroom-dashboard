# VSCode MCP Integration Guide

## ✅ MCP is Open Source & Excellent!

**MCP (Model Context Protocol)** is:
- ✅ **100% Open Source** - Developed by Anthropic, Apache 2.0 licensed
- ✅ **Industry Standard** - Adopted by major AI companies (Anthropic, OpenAI, Google)
- ✅ **Secure by Design** - Structured tool calling prevents prompt injection
- ✅ **Future-Proof** - Standardized protocol for AI-tool integration

## 🚀 VSCode Setup for Google & Claude

### 1. Install Required Extensions

```vscode-extensions
anthropic.claude-code,saoudrizwan.claude-dev,automatalabs.copilot-mcp
```

### 2. Claude Code Extension Setup

**For Claude in VSCode:**

1. **Install**: `anthropic.claude-code` extension
2. **Configure MCP**: Copy `claude-vscode-config.json` content to:
   - **Windows**: `%APPDATA%\Code\User\globalStorage\anthropic.claude-code\settings.json`
   - **macOS**: `~/Library/Application Support/Code/User/globalStorage/anthropic.claude-code/settings.json`
   - **Linux**: `~/.config/Code/User/globalStorage/anthropic.claude-code/settings.json`

3. **Restart VSCode** and use Claude chat with `/tools` command

### 3. Cline Extension Setup (Alternative Claude)

**For advanced Claude agent:**

1. **Install**: `saoudrizwan.claude-dev` extension
2. **Configure MCP**: Add to VSCode settings:
   ```json
   {
     "cline.mcp": {
       "stockroom-inventory": {
         "command": "node",
         "args": ["/var/www/stockroom-dashboard/mcp-servers/inventory-server.js"],
         "env": {
           "STOCKROOM_DATA_DIR": "/var/lib/stockroom-dashboard/data"
         }
       }
     }
   }
   ```

### 4. GitHub Copilot MCP Setup (Google Models)

**For Google AI + Copilot:**

1. **Install**: `automatalabs.copilot-mcp` extension
2. **Configure**: Use the extension's UI to add servers, or manually edit:
   - **Settings Location**: VSCode Settings → Extensions → Copilot MCP
   - **Import Config**: Use `copilot-mcp-config.json`

3. **Access**: Use Copilot Chat → "MCP Servers" to see available tools

## 🛠️ Available MCP Tools

### Inventory Management
```
get_inventory_status() - Get stock levels and statistics
search_inventory(query, limit) - Find items by name/SKU
get_item_details(itemId) - Detailed item information
update_inventory(itemId, updates) - Modify item data
```

### Shipment Tracking
```
get_shipments(status, limit) - List shipments with filters
get_shipment_details(trackingNumber) - Shipment details
create_shipment(recipient, address, items) - New shipment
update_shipment_status(trackingNumber, status) - Update tracking
```

### Radio Monitoring
```
get_radio_status() - Current radio status
get_radio_transcripts(limit) - Recent communications
monitor_frequency(frequency) - Monitor specific channel
get_radio_alerts() - Active alerts
```

## 🔧 Testing Your Setup

### Test Commands in VSCode:

**Claude Code:**
```
/tools
list available tools
get_inventory_status
```

**Copilot Chat:**
```
@mcp list servers
@mcp call stockroom-inventory get_inventory_status
```

**Cline:**
```
Use the Cline chat interface - tools are automatically available
```

## 🌟 Why MCP is Perfect for Your Use Case

### ✅ **Security First**
- No direct database access by AI
- Structured tool calls prevent SQL injection
- Controlled data exposure

### ✅ **Multi-Model Support**
- Works with Claude, GPT, Gemini, and more
- Same tools across different AI providers
- Standardized interface

### ✅ **Enterprise Ready**
- Audit trails of AI actions
- Permission-based tool access
- Scalable architecture

### ✅ **Developer Friendly**
- JSON-RPC 2.0 protocol
- Easy to extend with new tools
- Rich error handling

## 📊 MCP Adoption

**Major Companies Using MCP:**
- **Anthropic** (Claude) - Creator
- **OpenAI** (GPT) - Integrated
- **Google** (Gemini) - Supporting
- **Microsoft** (Copilot) - VSCode integration
- **GitHub** - Copilot Chat MCP

## 🚀 Next Steps

1. **Install extensions** listed above
2. **Copy configuration** files to appropriate locations
3. **Test with sample queries** like "What's my current inventory status?"
4. **Extend with custom tools** as needed

Your stockroom MCP doors are now ready for AI integration! 🎉