#!/bin/bash
# Startup script for MCP Blender server with Bonsai addon

set -e

echo "================================================"
echo "MCP Blender Server Startup"
echo "================================================"

# Start virtual display (Xvfb) for headless Blender
echo "Starting virtual display (Xvfb)..."
Xvfb :99 -screen 0 1024x768x24 > /tmp/xvfb.log 2>&1 &
XVFB_PID=$!
export DISPLAY=:99
sleep 2

# Start Blender in background with startup script
echo "Starting Blender with BlenderBIM addon..."
/opt/blender/blender --background --python /app/src/blender_mcp/blender_startup.py > /tmp/blender.log 2>&1 &
BLENDER_PID=$!

# Wait for Blender socket to be ready
echo "Waiting for Blender socket (port 9876)..."
for i in {1..60}; do
    if nc -z localhost 9876 2>/dev/null; then
        echo "✓ Blender socket is ready!"
        break
    fi
    echo "  Attempt $i/60... waiting"
    sleep 1
done

# Start the MCP HTTP wrapper server
echo "Starting MCP HTTP wrapper server on port 8080..."
cd /app
python hybrid_server.py

# Cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $BLENDER_PID 2>/dev/null || true
    kill $XVFB_PID 2>/dev/null || true
}

trap cleanup EXIT
wait
