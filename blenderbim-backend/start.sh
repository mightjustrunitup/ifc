#!/bin/bash
PORT=${PORT:-8080}

# Start virtual display for Blender
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
sleep 2

# Start Blender path
export PATH="/opt/app_runtime/blender:$PATH"

# Enable BlenderBIM addon
echo "Enabling BlenderBIM addon..."
/opt/app_runtime/blender/blender --background --python-expr "
import bpy
bpy.ops.preferences.addon_enable(module='blenderbim')
bpy.ops.wm.save_userpref()
" 2>&1 || echo "BlenderBIM enable completed"

# Start FastAPI (MCP server is not available - using legacy code execution mode)
echo "Starting FastAPI on port $PORT..."
cd /app
exec uvicorn main:app --host 0.0.0.0 --port $PORT
