# Dockerfile for IFC Bonsai MCP Server with Blender 4.4 + Bonsai Addon
# Multi-stage build optimized for fly.io deployment

# Stage 1: Blender 4.4 download and Bonsai addon
FROM ubuntu:22.04 AS blender-builder

WORKDIR /tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    libxrender1 \
    libxkbcommon0 \
    xz-utils \
    unzip \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download Blender 4.4 LTS (latest stable)
RUN echo "Downloading Blender 4.4..." && \
    cd /tmp && \
    wget -q https://download.blender.org/release/Blender4.4/blender-4.4.1-linux-x64.tar.xz -O blender.tar.xz && \
    echo "Extracting Blender..." && \
    tar -xf blender.tar.xz && \
    rm blender.tar.xz && \
    echo "✓ Blender 4.4 ready"

# Download and extract Bonsai addon
RUN echo "Downloading Bonsai addon..." && \
    cd /tmp && \
    wget -q https://extensions.blender.org/api/v1/extensions/bonsai/versions/0.8.3/file/ -O bonsai.zip && \
    echo "Extracting Bonsai..." && \
    unzip -q bonsai.zip && \
    rm bonsai.zip && \
    echo "✓ Bonsai addon ready"

# Stage 2: Runtime with Python + MCP + Blender + Bonsai
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies for Blender and X11
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    xvfb \
    libxrender1 \
    libxkbcommon0 \
    libfreetype6 \
    libfontconfig1 \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Copy Blender from builder stage
COPY --from=blender-builder /tmp/blender-4.4.1-linux-x64 /opt/blender

# Copy Bonsai addon to Blender's addons directory
RUN mkdir -p /root/.config/blender/4.4/scripts/addons
COPY --from=blender-builder /tmp/bonsai /root/.config/blender/4.4/scripts/addons/bonsai

# Create symlink for easy access
RUN ln -s /opt/blender/blender /usr/local/bin/blender

# Copy all project files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    mcp \
    mcp-server \
    fastapi \
    uvicorn \
    python-dotenv \
    rich \
    requests \
    beautifulsoup4 \
    tqdm \
    numpy \
    scipy \
    ifcopenshell \
    lark \
    networkx

# Set Python path to include src directory
ENV PYTHONPATH=/app/src:$PYTHONPATH

# HTTP server port
ENV HTTP_PORT=8080
EXPOSE 8080

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

echo "============================================"
echo "IFC Bonsai MCP Server Starting..."
echo "============================================"

# Start virtual display for Blender
echo "[1/4] Starting X virtual display..."
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 2
echo "✓ X display ready"

# Enable Bonsai addon in Blender preferences
echo "[2/4] Starting Blender with Bonsai addon..."
/opt/blender/blender --background --python-expr "
import bpy
bpy.context.preferences.addons.enable('bonsai')
bpy.ops.wm.save_userpref()
print('✓ Bonsai addon enabled')
" 2>&1 || true

# Start Blender with MCP socket server in background
echo "[3/4] Starting Blender MCP socket server..."
/opt/blender/blender --background --python /app/src/blender_mcp/blender_startup.py 2>&1 &
BLENDER_PID=$!

# Wait for Blender socket to be ready
echo "[4/4] Waiting for Blender socket server (port 9876)..."
for i in {1..60}; do
    if nc -z localhost 9876 2>/dev/null; then
        echo "✓ Blender socket server ready on port 9876"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "✗ Timeout waiting for Blender socket server"
        exit 1
    fi
    echo "  Attempt $i/60..."
    sleep 1
done

# Start MCP HTTP server
echo ""
echo "============================================"
echo "Starting MCP HTTP Server on port 8080"
echo "============================================"
echo "Endpoints:"
echo "  GET  /tools/list"
echo "  POST /tools/call"
echo "  GET  /health"
echo ""

exec python /app/hybrid_server.py
EOF

RUN chmod +x /app/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health 2>/dev/null || exit 1

# Run startup script
CMD ["/app/start.sh"]









