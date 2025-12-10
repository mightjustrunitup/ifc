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
    
    logger.info("Creating HTTP app...")
    
    # DON'T import tools here - they should already be imported by hybrid_server.py
    # Just import the MCP instance (tools should be registered by now)
    from .mcp_instance import mcp
    
    logger.info(f"MCP instance type: {type(mcp)}")
    
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
            
            logger.info("[/tools/list] Getting tools...")
            
            # Try using the list_tools() method from FastMCP
            try:
                logger.info("[/tools/list] Calling mcp.list_tools()...")
                tools_result = await mcp_instance.list_tools()
                logger.info(f"[/tools/list] Got result: {type(tools_result)}")
                
                # Handle both cases: result object with .tools attribute or direct list
                tools_to_process = []
                if tools_result:
                    if hasattr(tools_result, 'tools'):
                        # Result is an object with tools attribute (e.g., ListToolsResult)
                        tools_to_process = tools_result.tools
                    elif isinstance(tools_result, list):
                        # Result is a direct list of Tool objects
                        tools_to_process = tools_result
                
                logger.info(f"[/tools/list] Processing {len(tools_to_process)} tools...")
                for tool in tools_to_process:
                    tool_schema = {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.inputSchema if hasattr(tool, 'inputSchema') else {}
                    }
                    tools_list.append(tool_schema)
                logger.info(f"[/tools/list] Converted to schema: {len(tools_list)} tools")
                
                if len(tools_list) > 0:
                    logger.info(f"[/tools/list] Successfully returning {len(tools_list)} tools")
                    return {"tools": tools_list}
                    
            except Exception as e:
                logger.warning(f"[/tools/list] Failed to get tools via list_tools(): {e}")
            
            # Fallback: Try to get tools from _tool_manager
            logger.info("[/tools/list] Trying fallback: checking _tool_manager...")
            if hasattr(mcp_instance, '_tool_manager'):
                tool_manager = mcp_instance._tool_manager
                logger.info(f"[/tools/list] Tool manager attributes: {[a for a in dir(tool_manager) if not a.startswith('__')]}")
                
                # Try various ways to get tools from the manager
                if hasattr(tool_manager, 'tools'):
                    tools_dict = tool_manager.tools
                    logger.info(f"[/tools/list] Found {len(tools_dict)} tools in tool_manager.tools")
                    for tool_name, tool_impl in tools_dict.items():
                        tool_schema = {
                            "name": tool_name,
                            "description": getattr(tool_impl, 'description', ''),
                            "inputSchema": getattr(tool_impl, 'schema', {}) or getattr(tool_impl, 'inputSchema', {})
                        }
                        tools_list.append(tool_schema)
                elif hasattr(tool_manager, '_tools'):
                    tools_dict = tool_manager._tools
                    logger.info(f"[/tools/list] Found {len(tools_dict)} tools in tool_manager._tools")
                    for tool_name, tool_impl in tools_dict.items():
                        tool_schema = {
                            "name": tool_name,
                            "description": getattr(tool_impl, 'description', ''),
                            "inputSchema": getattr(tool_impl, 'schema', {}) or getattr(tool_impl, 'inputSchema', {})
                        }
                        tools_list.append(tool_schema)
                else:
                    logger.warning("[/tools/list] No tools found in tool_manager")
            else:
                logger.warning("[/tools/list] No _tool_manager found on MCP instance")
            
            logger.info(f"[/tools/list] Returning {len(tools_list)} tools")
            return {"tools": tools_list}
        
        except Exception as e:
            logger.error(f"[/tools/list] Error listing tools: {e}", exc_info=True)
            import traceback
            return JSONResponse(
                status_code=500,
                content={"error": str(e), "traceback": traceback.format_exc()[:500]}
            )
    
    @app.post("/tools/call")
    async def call_tool(request: ToolCallRequest):
        """Call a specific MCP tool"""
        try:
            mcp_instance = app.state.mcp
            logger.info(f"Tool call request: {request.name} with args: {request.arguments}")
            
            # Try using the call_tool() method from FastMCP
            try:
                logger.info(f"Calling mcp.call_tool('{request.name}', {request.arguments})")
                result = await mcp_instance.call_tool(request.name, request.arguments)
                logger.info(f"Tool result: {result}")
                
                return ToolCallResponse(
                    success=True,
                    result=result
                )
            except Exception as e:
                logger.error(f"Error calling tool via mcp.call_tool(): {e}", exc_info=True)
                
                # Fallback: Try to find and call the tool directly
                tools_dict = None
                
                if hasattr(mcp_instance, '_tool_manager'):
                    tool_manager = mcp_instance._tool_manager
                    if hasattr(tool_manager, 'tools'):
                        tools_dict = tool_manager.tools
                    elif hasattr(tool_manager, '_tools'):
                        tools_dict = tool_manager._tools
                
                if not tools_dict:
                    return JSONResponse(
                        status_code=503,
                        content={"error": "No tools available in MCP"}
                    )
                
                if request.name not in tools_dict:
                    available = list(tools_dict.keys())
                    logger.error(f"Tool '{request.name}' not found. Available: {available}")
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
                    
                    if hasattr(tool_impl, 'func'):
                        result = tool_impl.func(ctx, **request.arguments)
                    elif callable(tool_impl):
                        result = tool_impl(ctx, **request.arguments)
                    else:
                        return JSONResponse(
                            status_code=500,
                            content={"error": "Tool implementation is not callable"}
                        )
                    
                    logger.info(f"Tool result: {result}")
                    
                    return ToolCallResponse(
                        success=True,
                        result=result
                    )
                
                except TypeError as te:
                    # Try without context
                    try:
                        if hasattr(tool_impl, 'func'):
                            result = tool_impl.func(**request.arguments)
                        else:
                            result = tool_impl(**request.arguments)
                        
                        return ToolCallResponse(
                            success=True,
                            result=result
                        )
                    except Exception as e2:
                        logger.error(f"Tool call failed: {e2}", exc_info=True)
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
    
    @app.post("/tools/execute")
    async def execute_tool(request: ToolCallRequest):
        """
        Execute a tool (alias for /tools/call for compatibility with BlenderBIM backend).
        Request format: {"name": "tool_name", "arguments": {...}}
        """
        logger.info(f"Execute tool request: {request.name}")
        
        try:
            mcp_instance = app.state.mcp
            
            # Get tools from list_tools
            try:
                tools_result = await mcp_instance.list_tools()
                tools_to_process = []
                if tools_result:
                    if hasattr(tools_result, 'tools'):
                        tools_to_process = tools_result.tools
                    elif isinstance(tools_result, list):
                        tools_to_process = tools_result
                
                # Convert to dict by name
                tools_dict = {tool.name: tool for tool in tools_to_process}
                
            except Exception as e:
                logger.warning(f"Could not get tools from list_tools: {e}")
                if hasattr(mcp_instance, '_tool_manager'):
                    tools_dict = mcp_instance._tool_manager.tools if hasattr(mcp_instance._tool_manager, 'tools') else {}
                else:
                    tools_dict = {}
            
            if not tools_dict:
                return JSONResponse(
                    status_code=503,
                    content={"error": "No tools available in MCP"}
                )
            
            if request.name not in tools_dict:
                available = list(tools_dict.keys())
                logger.error(f"Tool '{request.name}' not found. Available: {available[:10]}...")
                return JSONResponse(
                    status_code=404,
                    content={"error": f"Tool '{request.name}' not found"}
                )
            
            tool_impl = tools_dict[request.name]
            logger.info(f"Executing tool: {request.name} with args: {request.arguments}")
            
            # Call the tool
            try:
                from mcp.server.fastmcp import Context
                ctx = Context()
                
                if hasattr(tool_impl, 'func'):
                    result = tool_impl.func(ctx, **request.arguments)
                elif callable(tool_impl):
                    result = tool_impl(ctx, **request.arguments)
                else:
                    return JSONResponse(
                        status_code=500,
                        content={"error": "Tool implementation is not callable"}
                    )
                
                logger.info(f"Tool {request.name} completed successfully")
                
                return {
                    "success": True,
                    "tool": request.name,
                    "result": result
                }
            
            except TypeError as te:
                # Try without context
                try:
                    if hasattr(tool_impl, 'func'):
                        result = tool_impl.func(**request.arguments)
                    else:
                        result = tool_impl(**request.arguments)
                    
                    return {
                        "success": True,
                        "tool": request.name,
                        "result": result
                    }
                except Exception as e2:
                    logger.error(f"Tool execution failed: {e2}", exc_info=True)
                    return JSONResponse(
                        status_code=500,
                        content={"error": str(e2)}
                    )
            
        except Exception as e:
            import traceback
            logger.error(f"Execute tool error: {e}", exc_info=True)
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
            
            # Count tools using the same method as list_tools endpoint
            tools_count = 0
            try:
                tools_result = await mcp_instance.list_tools()
                if tools_result:
                    if hasattr(tools_result, 'tools'):
                        tools_count = len(tools_result.tools)
                    elif isinstance(tools_result, list):
                        tools_count = len(tools_result)
            except Exception as e:
                logger.debug(f"Could not get tool count via list_tools(): {e}")
                # Fallback to checking _tool_manager
                if hasattr(mcp_instance, '_tool_manager'):
                    tool_manager = mcp_instance._tool_manager
                    if hasattr(tool_manager, 'tools'):
                        tools_count = len(tool_manager.tools)
                    elif hasattr(tool_manager, '_tools'):
                        tools_count = len(tool_manager._tools)
            
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





