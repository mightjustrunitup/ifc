"""
HTTP wrapper to expose MCP tools as REST endpoints.
Wraps the MCP server to provide /tools/list and /tools/call endpoints.
"""

import json
import logging
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger("HTTPWrapper")


class ToolCallRequest(BaseModel):
    """Request body for tool calls"""
    name: str
    arguments: Dict[str, Any] = {}


class ToolCallResponse(BaseModel):
    """Response for tool calls"""
    success: bool
    result: Any = None
    error: Optional[str] = None


def create_http_app() -> FastAPI:
    """Create a FastAPI app that wraps the MCP server with HTTP endpoints"""
    
    app = FastAPI(
        title="MCP HTTP Wrapper",
        description="HTTP wrapper for IFC MCP Server",
        version="1.0.0"
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    @app.get("/")
    async def root():
        """Root endpoint"""
        return {
            "service": "IFC MCP HTTP Wrapper",
            "version": "1.0.0",
            "status": "running"
        }
    
    @app.get("/tools/list")
    async def list_tools():
        """List all available MCP tools"""
        try:
            # Import here to avoid circular imports and ensure tools are registered
            from .mcp_instance import mcp
            from mcp.server.fastmcp import Context
            
            # Get tools from MCP's internal state
            tools_list = []
            
            # FastMCP stores tools in _tools attribute
            if hasattr(mcp, '_tools'):
                for tool_name, tool_impl in mcp._tools.items():
                    # Extract tool schema
                    tool_schema = {
                        "name": tool_name,
                        "description": tool_impl.description if hasattr(tool_impl, 'description') else "",
                        "inputSchema": tool_impl.schema if hasattr(tool_impl, 'schema') else {}
                    }
                    tools_list.append(tool_schema)
            else:
                logger.warning("Could not access MCP tools via _tools attribute")
            
            logger.info(f"Listing {len(tools_list)} tools")
            return {"tools": tools_list}
        
        except Exception as e:
            logger.error(f"Error listing tools: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"error": str(e)}
            )
    
    @app.post("/tools/call")
    async def call_tool(request: ToolCallRequest):
        """Call a specific MCP tool"""
        try:
            from .mcp_instance import mcp
            from mcp.server.fastmcp import Context
            
            logger.info(f"Calling tool: {request.name} with args: {request.arguments}")
            
            # Get the tool function
            if not hasattr(mcp, '_tools') or request.name not in mcp._tools:
                return JSONResponse(
                    status_code=404,
                    content={"error": f"Tool '{request.name}' not found"}
                )
            
            tool_impl = mcp._tools[request.name]
            
            # Create a minimal context for the tool
            ctx = Context()
            
            # Call the tool with arguments
            if hasattr(tool_impl, 'func'):
                result = tool_impl.func(ctx, **request.arguments)
            else:
                result = tool_impl(ctx, **request.arguments)
            
            logger.info(f"Tool {request.name} returned: {result}")
            
            return ToolCallResponse(
                success=True,
                result=result
            )
        
        except KeyError as e:
            logger.error(f"Tool not found: {e}")
            return JSONResponse(
                status_code=404,
                content={"error": f"Tool '{request.name}' not found"}
            )
        except TypeError as e:
            logger.error(f"Invalid arguments for tool: {e}")
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid arguments: {str(e)}"}
            )
        except Exception as e:
            logger.error(f"Error calling tool: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"error": str(e)}
            )
    
    @app.get("/health")
    async def health():
        """Health check endpoint"""
        try:
            from .mcp_instance import mcp
            tools_count = len(mcp._tools) if hasattr(mcp, '_tools') else 0
            return {
                "status": "healthy",
                "tools_loaded": tools_count
            }
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "error": str(e)}
            )
    
    return app
