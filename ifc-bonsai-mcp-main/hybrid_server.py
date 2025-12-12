#!/usr/bin/env python3
"""
Hybrid MCP + HTTP Server
Runs the MCP server with HTTP wrapper for REST API access to MCP tools.
"""

import os
import sys
import logging
import uvicorn
from fastapi import FastAPI

# Set environment to use HTTP wrapper
os.environ["USE_HTTP_WRAPPER"] = "true"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("HybridServer")

# Initialize app at module level (required by Uvicorn)
app = FastAPI(title="IFC Bonsai MCP Server")

def create_app():
    """Create and configure the FastAPI application"""
    
    logger.info("=" * 60)
    logger.info("Hybrid MCP + HTTP Server Startup")
    logger.info("=" * 60)
    
    # CRITICAL: Import tools FIRST to register them with MCP
    logger.info("Step 1: Importing MCP tools to register them...")
    
    tools_imported = 0
    
    try:
        logger.info("  Importing api_tools...")
        from blender_mcp.mcp_functions import api_tools
        logger.info("  ✓ API tools imported")
        tools_imported += 1
    except Exception as e:
        logger.error(f"  ✗ Failed to import API tools: {e}", exc_info=True)
    
    try:
        logger.info("  Importing analysis_tools...")
        from blender_mcp.mcp_functions import analysis_tools
        logger.info("  ✓ Analysis tools imported")
        tools_imported += 1
    except Exception as e:
        logger.error(f"  ✗ Failed to import analysis tools: {e}", exc_info=True)
    
    try:
        logger.info("  Importing prompts...")
        from blender_mcp.mcp_functions import prompts
        logger.info("  ✓ Prompts imported")
        tools_imported += 1
    except Exception as e:
        logger.error(f"  ✗ Failed to import prompts: {e}", exc_info=True)
    
    logger.info(f"\nStep 1 Complete: {tools_imported} tool modules imported")
    
    # Now verify MCP has the tools registered
    logger.info("\nStep 1.5: Verifying MCP tool registration...")
    try:
        from blender_mcp.mcp_instance import mcp
        if hasattr(mcp, '_tool_manager'):
            tool_manager = mcp._tool_manager
            if hasattr(tool_manager, 'tools'):
                tools_count = len(tool_manager.tools)
                logger.info(f"  ✓ MCP has {tools_count} tools registered")
            elif hasattr(tool_manager, '_tools'):
                tools_count = len(tool_manager._tools)
                logger.info(f"  ✓ MCP has {tools_count} tools registered")
            else:
                logger.warning("  ⚠️  Cannot find tools in tool_manager")
    except Exception as e:
        logger.error(f"  ✗ Error checking tool registration: {e}", exc_info=True)
    
    # Now create the HTTP app - tools are already registered
    logger.info("\nStep 2: Creating HTTP app with registered tools...")
    try:
        from blender_mcp.http_wrapper import create_http_app
        http_app = create_http_app()
        logger.info("  ✓ HTTP app created successfully")
        
        # Copy routes from http_app to module-level app
        for route in http_app.routes:
            if hasattr(route, 'path'):
                methods = getattr(route, 'methods', set())
                logger.info(f"  - {route.path} {methods}")
        
        # Return the properly configured app
        return http_app
    except Exception as e:
        logger.error(f"  ✗ Failed to create HTTP app: {e}", exc_info=True)
        sys.exit(1)

# Initialize app with routes when module is imported
try:
    configured_app = create_app()
    # Replace the module-level app with the fully configured one
    app.routes = configured_app.routes
    app.openapi_schema = configured_app.openapi_schema
except Exception as e:
    logger.error(f"Failed to initialize app: {e}", exc_info=True)

def main():
    """Main entry point - called when run as script"""
    http_port = int(os.environ.get("HTTP_PORT", "8000"))
    
    logger.info(f"\nStep 3: Starting server on port {http_port}")
    logger.info("Endpoints:")
    logger.info(f"  - GET /               - Health check")
    logger.info(f"  - GET /health         - Detailed health")
    logger.info(f"  - GET /tools/list     - List all MCP tools")
    logger.info(f"  - GET /tools/call     - Call a specific tool")
    logger.info(f"  - POST /tools/execute - Execute a tool")
    logger.info("=" * 60)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=http_port,
        log_level="info"
    )

if __name__ == "__main__":
    main()


