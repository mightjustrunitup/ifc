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
    
    # Import after setting environment
    from blender_mcp.http_wrapper import create_http_app
    
    http_port = int(os.environ.get("HTTP_PORT", "8000"))
    
    logger.info(f"Starting Hybrid MCP + HTTP Server on port {http_port}")
    logger.info("Endpoints:")
    logger.info(f"  - GET /               - Health check")
    logger.info(f"  - GET /health         - Detailed health")
    logger.info(f"  - GET /tools/list     - List all MCP tools")
    logger.info(f"  - POST /tools/call    - Call a specific tool")
    
    # Create and run the HTTP app
    app = create_http_app()
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=http_port,
        log_level="info"
    )

if __name__ == "__main__":
    main()
