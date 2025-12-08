"""
HTTP wrapper to expose MCP tools as REST endpoints.
Wraps the MCP server to provide /tools/list and /tools/call endpoints.
"""

import json
import logging
from typing import Any, Dict, Optional
from fastapi import FastAPI
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
    
    # Import tools FIRST to ensure they are registered with MCP
    logger.info("Importing MCP tools...")
    try:
        from .mcp_functions import api_tools, analysis_tools, prompts
        logger.info("✓ Core MCP tools imported")
    except Exception as e:
        logger.error(f"✗ Failed to import core MCP tools: {e}", exc_info=True)
    
    try:
        from .mcp_functions import rag_tools
        logger.info("✓ RAG tools imported")
    except Exception as e:
        logger.info(f"RAG tools not available: {e}")
    
    # Now import the MCP instance (tools should be registered by now)
    from .mcp_instance import mcp
    
    # Debug: Check what's actually in the mcp object
    logger.info(f"MCP instance type: {type(mcp)}")
    logger.info(f"MCP instance attributes: {[attr for attr in dir(mcp) if not attr.startswith('__')]}")
    
    # Check for tools in various possible locations
    tools_found = False
    for attr_name in ['_tools', 'tools', '_handlers', 'handlers', '_resources', 'resources']:
        if hasattr(mcp, attr_name):
            attr_val = getattr(mcp, attr_name)
            logger.info(f"  {attr_name}: {type(attr_val)} with {len(attr_val) if hasattr(attr_val, '__len__') else '?'} items")
            if hasattr(attr_val, '__len__') and len(attr_val) > 0:
                tools_found = True
    
    if not tools_found:
        logger.warning("⚠️  No tools found in any expected attribute")
    else:
        logger.info("✓ Tools loaded successfully")
    
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
    
    # Store MCP in app state for access in routes
    app.state.mcp = mcp
    
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
            mcp_instance = app.state.mcp
            tools_list = []
            
            # Try to get tools from various possible locations in FastMCP
            tools_dict = None
            
            if hasattr(mcp_instance, '_tools') and mcp_instance._tools:
                tools_dict = mcp_instance._tools
                logger.info(f"Found tools in _tools: {len(tools_dict)}")
            elif hasattr(mcp_instance, 'tools') and mcp_instance.tools:
                tools_dict = mcp_instance.tools
                logger.info(f"Found tools in tools: {len(tools_dict)}")
            
            if tools_dict:
                for tool_name, tool_impl in tools_dict.items():
                    # Extract tool metadata
                    description = ""
                    input_schema = {}
                    
                    # Try to get description and schema from tool implementation
                    if hasattr(tool_impl, 'description'):
                        description = tool_impl.description
                    
                    if hasattr(tool_impl, 'schema'):
                        input_schema = tool_impl.schema
                    elif hasattr(tool_impl, 'inputSchema'):
                        input_schema = tool_impl.inputSchema
                    
                    tool_schema = {
                        "name": tool_name,
                        "description": description,
                        "inputSchema": input_schema
                    }
                    tools_list.append(tool_schema)
                
                logger.info(f"Returning {len(tools_list)} tools")
            else:
                logger.warning(f"No tools found in mcp instance")
                # Debug: show what attributes exist
                attrs = [attr for attr in dir(mcp_instance) if not attr.startswith('__')]
                logger.debug(f"Available attributes: {attrs[:20]}")
            
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
            mcp_instance = app.state.mcp
            logger.info(f"Tool call request: {request.name} with args: {request.arguments}")
            
            # Find tools dict from various possible locations
            tools_dict = None
            if hasattr(mcp_instance, '_tools') and mcp_instance._tools:
                tools_dict = mcp_instance._tools
            elif hasattr(mcp_instance, 'tools') and mcp_instance.tools:
                tools_dict = mcp_instance.tools
            
            # Check if tool exists
            if not tools_dict:
                logger.error("No tools registered in MCP")
                return JSONResponse(
                    status_code=503,
                    content={"error": "No tools available in MCP"}
                )
            
            if request.name not in tools_dict:
                available = list(tools_dict.keys())
                logger.error(f"Tool '{request.name}' not found. Available tools: {available}")
                return JSONResponse(
                    status_code=404,
                    content={"error": f"Tool '{request.name}' not found", "available_tools": available}
                )
            
            tool_impl = tools_dict[request.name]
            logger.info(f"Found tool: {tool_impl}")
            
            # Try to call the tool
            try:
                from mcp.server.fastmcp import Context
                ctx = Context()
                
                # Call the tool function
                if hasattr(tool_impl, 'func'):
                    logger.info(f"Calling via func attribute")
                    result = tool_impl.func(ctx, **request.arguments)
                elif callable(tool_impl):
                    logger.info(f"Calling tool_impl directly")
                    result = tool_impl(ctx, **request.arguments)
                else:
                    logger.error(f"Tool is not callable: {type(tool_impl)}")
                    return JSONResponse(
                        status_code=500,
                        content={"error": f"Tool implementation is not callable"}
                    )
                
                logger.info(f"Tool result: {result}")
                
                return ToolCallResponse(
                    success=True,
                    result=result
                )
            
            except TypeError as te:
                logger.warning(f"Tool call with context failed: {te}. Trying without context...")
                
                # Try calling without context if it fails
                try:
                    if hasattr(tool_impl, 'func'):
                        result = tool_impl.func(**request.arguments)
                    else:
                        result = tool_impl(**request.arguments)
                    
                    logger.info(f"Tool result (no context): {result}")
                    
                    return ToolCallResponse(
                        success=True,
                        result=result
                    )
                except Exception as e2:
                    logger.error(f"Tool call failed even without context: {e2}", exc_info=True)
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Tool execution failed: {str(e2)}"}
                    )
        
        except Exception as e:
            logger.error(f"Error calling tool: {e}", exc_info=True)
            import traceback
            return JSONResponse(
                status_code=500,
                content={
                    "error": str(e),
                    "traceback": traceback.format_exc()[:500]
                }
            )
    
    @app.get("/health")
    async def health():
        """Health check endpoint"""
        try:
            mcp_instance = app.state.mcp
            
            # Count tools from various possible locations
            tools_count = 0
            if hasattr(mcp_instance, '_tools'):
                tools_count = len(mcp_instance._tools) if mcp_instance._tools else 0
            elif hasattr(mcp_instance, 'tools'):
                tools_count = len(mcp_instance.tools) if mcp_instance.tools else 0
            
            return {
                "status": "healthy",
                "tools_loaded": tools_count,
                "service": "IFC MCP HTTP Wrapper"
            }
        except Exception as e:
            logger.error(f"Health check error: {e}")
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "error": str(e)}
            )
    
    return app

