#!/usr/bin/env python3
"""
AI Task Assignment MCP Server
Model Context Protocol server for AI-powered task assignment

Provides tools:
- generate_fair_assignments: Generate AI-powered task assignments
- get_assignment_history: View historical assignments
- get_fairness_metrics: View fairness scores
"""

import asyncio
import json
import sys
from datetime import datetime
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, '/var/www/stockroom-dashboard')

from mcp.server import Server
from mcp.types import Tool, TextContent
import mcp.server.stdio

# Import our fair rotation agent
from ai_services.task_assignment.fair_rotation_agent import FairRotationAgent

# Database connection
DB_CONNECTION = "postgresql://suit@localhost/stockroom_dashboard"

# Initialize MCP server
app = Server("stockroom-ai-assignment")

@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available AI task assignment tools"""
    return [
        Tool(
            name="generate_fair_assignments",
            description="Generate AI-powered fair task assignments for a specific date. Uses 90-day historical analysis to ensure equal rotation.",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Date for assignments (YYYY-MM-DD format)",
                    },
                    "employees": {
                        "type": "object",
                        "description": "Employees organized by role (SA, BOH, MANAGEMENT)",
                        "properties": {
                            "SA": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "name": {"type": "string"}
                                    }
                                }
                            },
                            "BOH": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "name": {"type": "string"}
                                    }
                                }
                            },
                            "MANAGEMENT": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "name": {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "settings": {
                        "type": "object",
                        "description": "Gameplan settings with available zones, fitting rooms, etc.",
                        "properties": {
                            "zones": {"type": "array", "items": {"type": "string"}},
                            "fittingRooms": {"type": "array", "items": {"type": "string"}},
                            "shifts": {"type": "array", "items": {"type": "string"}},
                            "lunchTimes": {"type": "array", "items": {"type": "string"}},
                            "closingSections": {"type": "array", "items": {"type": "string"}}
                        }
                    }
                },
                "required": ["date", "employees", "settings"]
            }
        ),
        Tool(
            name="get_assignment_history",
            description="Get historical task assignment data for an employee to see their rotation pattern",
            inputSchema={
                "type": "object",
                "properties": {
                    "employee_id": {
                        "type": "string",
                        "description": "Employee ID to look up",
                    },
                    "days": {
                        "type": "number",
                        "description": "Number of days of history to retrieve (default 30)",
                        "default": 30
                    }
                },
                "required": ["employee_id"]
            }
        ),
        Tool(
            name="get_fairness_metrics",
            description="Calculate current fairness metrics for all employees (zone distribution, shift balance, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {
                        "type": "number",
                        "description": "Number of days to analyze (default 90)",
                        "default": 90
                    }
                }
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls"""
    
    if name == "generate_fair_assignments":
        try:
            # Initialize agent
            agent = FairRotationAgent(DB_CONNECTION, history_days=90)
            
            # Generate assignments
            date = arguments["date"]
            employees = arguments["employees"]
            settings = arguments["settings"]
            
            assignments, metadata = agent.generate_daily_assignments(
                date=date,
                employees=employees,
                settings=settings
            )
            
            # Save decision to database
            decision_id = agent.save_assignment_decision(date, assignments, metadata)
            
            # Close agent
            agent.close()
            
            # Return results
            result = {
                "success": True,
                "decision_id": decision_id,
                "date": date,
                "assignments": assignments,
                "metadata": metadata,
                "message": f"Generated {len(assignments)} fair assignments with fairness score {metadata['fairness_score']}"
            }
            
            return [TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]
            
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": False,
                    "error": str(e)
                })
            )]
    
    elif name == "get_assignment_history":
        try:
            import psycopg2
            from datetime import timedelta
            
            employee_id = arguments["employee_id"]
            days = arguments.get("days", 30)
            
            conn = psycopg2.connect(DB_CONNECTION)
            cursor = conn.cursor()
            
            cutoff_date = datetime.now() - timedelta(days=days)
            
            query = """
                SELECT 
                    assignment_date,
                    role_type,
                    assigned_zones,
                    fitting_room,
                    shift,
                    lunch_time,
                    closing_sections,
                    assigned_by,
                    ai_confidence
                FROM task_assignment_history
                WHERE employee_id = %s
                  AND assignment_date >= %s
                ORDER BY assignment_date DESC
            """
            
            cursor.execute(query, (employee_id, cutoff_date))
            rows = cursor.fetchall()
            
            history = []
            for row in rows:
                history.append({
                    "date": row[0].isoformat() if row[0] else None,
                    "role": row[1],
                    "zones": row[2],
                    "fitting_room": row[3],
                    "shift": row[4],
                    "lunch_time": row[5],
                    "closing_sections": row[6],
                    "assigned_by": row[7],
                    "ai_confidence": float(row[8]) if row[8] else None
                })
            
            cursor.close()
            conn.close()
            
            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": True,
                    "employee_id": employee_id,
                    "days_analyzed": days,
                    "total_assignments": len(history),
                    "history": history
                }, indent=2)
            )]
            
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": False,
                    "error": str(e)
                })
            )]
    
    elif name == "get_fairness_metrics":
        try:
            import psycopg2
            from datetime import timedelta
            from collections import Counter
            
            days = arguments.get("days", 90)
            
            conn = psycopg2.connect(DB_CONNECTION)
            cursor = conn.cursor()
            
            cutoff_date = datetime.now() - timedelta(days=days)
            
            # Get all assignments in time period
            query = """
                SELECT 
                    employee_id,
                    assigned_zones,
                    fitting_room,
                    shift
                FROM task_assignment_history
                WHERE assignment_date >= %s
            """
            
            cursor.execute(query, (cutoff_date,))
            rows = cursor.fetchall()
            
            # Calculate metrics
            employee_metrics = {}
            
            for row in rows:
                emp_id = row[0]
                if emp_id not in employee_metrics:
                    employee_metrics[emp_id] = {
                        "total_assignments": 0,
                        "zones": Counter(),
                        "fitting_rooms": Counter(),
                        "shifts": Counter()
                    }
                
                employee_metrics[emp_id]["total_assignments"] += 1
                
                if row[1]:  # zones
                    for zone in row[1]:
                        employee_metrics[emp_id]["zones"][zone] += 1
                
                if row[2]:  # fitting_room
                    employee_metrics[emp_id]["fitting_rooms"][row[2]] += 1
                
                if row[3]:  # shift
                    employee_metrics[emp_id]["shifts"][row[3]] += 1
            
            cursor.close()
            conn.close()
            
            # Convert to serializable format
            result_metrics = {}
            for emp_id, metrics in employee_metrics.items():
                result_metrics[emp_id] = {
                    "total_assignments": metrics["total_assignments"],
                    "zones": dict(metrics["zones"]),
                    "fitting_rooms": dict(metrics["fitting_rooms"]),
                    "shifts": dict(metrics["shifts"])
                }
            
            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": True,
                    "days_analyzed": days,
                    "employees_analyzed": len(employee_metrics),
                    "metrics": result_metrics
                }, indent=2)
            )]
            
        except Exception as e:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "success": False,
                    "error": str(e)
                })
            )]
    
    else:
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": False,
                "error": f"Unknown tool: {name}"
            })
        )]

async def main():
    """Run MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )

if __name__ == "__main__":
    asyncio.run(main())
