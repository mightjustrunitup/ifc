#!/usr/bin/env python3
"""
Hybrid MCP + HTTP Server
Runs the MCP server with HTTP wrapper for REST API access to MCP tools.
"""

import os
import sys
import logging
import uvicorn

# Set environment to use HTTP wrapper
os.environ["USE_HTTP_WRAPPER"] = "true"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("HybridServer")

def main():
    """Main entry point for hybrid server"""
    
    logger.info("=" * 60)
    logger.info("Hybrid MCP + HTTP Server Startup")
    logger.info("=" * 60)
    
    # CRITICAL: Import tools FIRST to register them with MCP
    logger.info("Step 1: Importing MCP tools to register them...")
    try:
        from blender_mcp.mcp_functions import api_tools
        logger.info("  ✓ API tools imported")
    except Exception as e:
        logger.error(f"  ✗ Failed to import API tools: {e}")
    
    try:
        from blender_mcp.mcp_functions import analysis_tools
        logger.info("  ✓ Analysis tools imported")
    except Exception as e:
        logger.error(f"  ✗ Failed to import analysis tools: {e}")
    
    try:
        from blender_mcp.mcp_functions import prompts
        logger.info("  ✓ Prompts imported")
    except Exception as e:
        logger.error(f"  ✗ Failed to import prompts: {e}")
    
    # Now create the HTTP app - tools are already registered
    logger.info("\nStep 2: Creating HTTP app with registered tools...")
    try:
        from blender_mcp.http_wrapper import create_http_app
        app = create_http_app()
        logger.info("  ✓ HTTP app created successfully")
    except Exception as e:
        logger.error(f"  ✗ Failed to create HTTP app: {e}")
        sys.exit(1)
    
    http_port = int(os.environ.get("HTTP_PORT", "8000"))
    
    logger.info(f"\nStep 3: Starting server on port {http_port}")
    logger.info("Endpoints:")
    logger.info(f"  - GET /               - Health check")
    logger.info(f"  - GET /health         - Detailed health")
    logger.info(f"  - GET /tools/list     - List all MCP tools")
    logger.info(f"  - POST /tools/call    - Call a specific tool")
    logger.info("=" * 60)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=http_port,
        log_level="info"
    )

if __name__ == "__main__":
    main()

