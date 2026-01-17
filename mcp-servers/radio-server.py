#!/usr/bin/env python3

# Simple MCP Server for Stockroom Radio
# This demonstrates the basic structure - expand with full MCP SDK when available

import json
import sys
import asyncio
from pathlib import Path

class SimpleMCPServer:
    def __init__(self, name):
        self.name = name
        self.tools = {}

    def register_tool(self, name, handler, schema):
        self.tools[name] = {"handler": handler, "schema": schema}

    async def handle_message(self, message):
        try:
            data = json.loads(message)

            if data.get("method") == "tools/list":
                tools = []
                for name, tool_info in self.tools.items():
                    tool = {"name": name, **tool_info["schema"]}
                    tools.append(tool)

                return {
                    "jsonrpc": "2.0",
                    "id": data.get("id"),
                    "result": {"tools": tools}
                }

            elif data.get("method") == "tools/call":
                params = data.get("params", {})
                name = params.get("name")
                args = params.get("arguments", {})

                if name in self.tools:
                    result = await self.tools[name]["handler"](args)
                    # Return the raw result so clients receive structured JSON
                    return {
                        "jsonrpc": "2.0",
                        "id": data.get("id"),
                        "result": result
                    }
                else:
                    return {
                        "jsonrpc": "2.0",
                        "id": data.get("id"),
                        "error": {"code": -32601, "message": "Method not found"}
                    }

            return {
                "jsonrpc": "2.0",
                "id": data.get("id"),
                "error": {"code": -32601, "message": "Method not found"}
            }

        except json.JSONDecodeError as e:
            return {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": "Parse error", "data": str(e)}
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": data.get("id") if "data" in locals() else None,
                "error": {"code": -32603, "message": "Internal error", "data": str(e)}
            }

    async def start(self):
        print(f"{self.name} MCP Server starting...", file=sys.stderr)

        loop = asyncio.get_event_loop()

        for line in sys.stdin:
            line = line.strip()
            if line:
                response = await self.handle_message(line)
                print(json.dumps(response), flush=True)

        print(f"{self.name} MCP Server shutting down...", file=sys.stderr)

# Create radio server
server = SimpleMCPServer("stockroom-radio")

# Register tools
async def get_radio_status(args):
    """Get current radio monitoring status and active frequencies"""
    return {
        "active": True,
        "frequencies": ["144.390", "145.210", "146.520"],
        "last_transmission": "2026-01-12T10:30:00Z",
        "signal_strength": "good"
    }

async def get_radio_transcripts(args):
    """Get recent radio transcripts"""
    limit = args.get("limit", 10)
    transcripts = [
        {
            "timestamp": "2026-01-12T10:25:00Z",
            "frequency": "144.390",
            "transcript": "Package ready for pickup at station 3"
        },
        {
            "timestamp": "2026-01-12T10:20:00Z",
            "frequency": "145.210",
            "transcript": "Alteration service completed for suit #12345"
        }
    ][:limit]
    return transcripts

async def monitor_frequency(args):
    """Start monitoring a specific radio frequency"""
    frequency = args.get("frequency")
    if not frequency:
        return {"error": "Frequency is required"}
    return {"message": f"Started monitoring frequency {frequency}"}

async def get_radio_alerts(args):
    """Get active radio alerts and notifications"""
    alerts = [
        {
            "priority": "high",
            "message": "Urgent: Package damaged in transit",
            "timestamp": "2026-01-12T10:15:00Z"
        }
    ]
    return alerts


def load_json(path: Path) -> dict:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


async def find_best_frequency(args):
    """Return the latest frequency finder analysis."""
    base = Path("/var/lib/stockroom-dashboard/data/radio")
    if not base.exists():
        base = Path("data/radio")
    finder_path = base / "finder.json"
    if not finder_path.exists():
        return {"ok": False, "error": "finder.json not found"}
    return {"ok": True, "finder": load_json(finder_path)}

server.register_tool(
    "get_radio_status",
    get_radio_status,
    {
        "description": "Get current radio monitoring status and active frequencies",
        "inputSchema": {"type": "object", "properties": {}}
    }
)

server.register_tool(
    "get_radio_transcripts",
    get_radio_transcripts,
    {
        "description": "Get recent radio transcripts",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of transcripts to return",
                    "default": 10
                }
            }
        }
    }
)

server.register_tool(
    "monitor_frequency",
    monitor_frequency,
    {
        "description": "Start monitoring a specific radio frequency",
        "inputSchema": {
            "type": "object",
            "properties": {
                "frequency": {"type": "string", "description": "Radio frequency to monitor"}
            },
            "required": ["frequency"]
        }
    }
)

server.register_tool(
    "get_radio_alerts",
    get_radio_alerts,
    {
        "description": "Get active radio alerts and notifications",
        "inputSchema": {"type": "object", "properties": {}}
    }
)

server.register_tool(
    "find_best_frequency",
    find_best_frequency,
    {
        "description": "Get latest frequency finder analysis",
        "inputSchema": {"type": "object", "properties": {}}
    }
)

# Start the server
if __name__ == "__main__":
    asyncio.run(server.start())