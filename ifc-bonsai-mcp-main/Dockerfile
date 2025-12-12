# Dockerfile for IFC Bonsai MCP Server with Blender 4.4 + Bonsai Addon
# Multi-stage build optimized for fly.io deployment

##############################################
# Stage 1: Blender 4.4 download + dependencies
##############################################

FROM ubuntu:22.04 AS blender-builder

WORKDIR /tmp

# Required packages for extracting Blender + addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    xz-utils \
    unzip \
    libxrender1 \
    libxkbcommon0 \
    libxfixes3 \
    libsm6 \
    libice6 \
    libxi6 \
    libxinerama1 \
    libxcursor1 \
    libxrandr2 \
    libxdamage1 \
    libxcomposite1 \
    libx11-6 \
    libgl1 \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download Blender 4.4 LTS
RUN echo "Downloading Blender 4.4..." && \
    cd /tmp && \
    wget -q https://download.blender.org/release/Blender4.4/blender-4.4.1-linux-x64.tar.xz -O blender.tar.xz && \
    echo "Extracting Blender..." && \
    tar -xf blender.tar.xz && \
    rm blender.tar.xz && \
    echo "✓ Blender 4.4 ready"

# Download Bonsai addon from GitHub
RUN echo "Downloading Bonsai addon build..." && \
    cd /tmp && \
    wget -q https://github.com/IfcOpenShell/IfcOpenShell/releases/download/bonsai-0.8.5-alpha2512111303/bonsai_py311-0.8.5-alpha251211-linux-x64.zip -O bonsai.zip && \
    echo "Extracting Bonsai..." && \
    unzip -q bonsai.zip && \
    ls -la /tmp/ | grep bonsai && \
    find /tmp -maxdepth 1 -type d -name "*bonsai*" -exec mv {} /tmp/bonsai-addon \; && \
    rm bonsai.zip && \
    echo "✓ Bonsai addon ready"

##############################################
# Stage 2: Runtime with Python + MCP + Blender
##############################################

FROM ubuntu:22.04

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# System dependencies for Blender + Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    python3.11-venv \
    curl \
    wget \
    xvfb \
    libxrender1 \
    libxkbcommon0 \
    libfreetype6 \
    libfontconfig1 \
    libxfixes3 \
    libxext6 \
    libxi6 \
    libxinerama1 \
    libxcursor1 \
    libxrandr2 \
    libxdamage1 \
    libxcomposite1 \
    libx11-6 \
    libsm6 \
    libice6 \
    libgl1 \
    libbz2-1.0 \
    libssl3 \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.11 /usr/bin/python

# Copy Blender from builder
COPY --from=blender-builder /tmp/blender-4.4.1-linux-x64 /opt/blender

# Copy Bonsai addon from builder and install to Blender addons directory
RUN mkdir -p /root/.config/blender/4.4/scripts/addons
COPY --from=blender-builder /tmp/bonsai-addon /root/.config/blender/4.4/scripts/addons/bonsai

# Symlink blender for easy access
RUN ln -s /opt/blender/blender /usr/local/bin/blender

# Copy project files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir \
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

# Set Python path to your source
ENV PYTHONPATH=/app/src:$PYTHONPATH

# Expose HTTP port
ENV HTTP_PORT=8080
EXPOSE 8080

# Startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

echo "============================================"
echo "IFC Bonsai MCP Server Starting..."
echo "============================================"

# Start virtual display
echo "[1/4] Starting X virtual display..."
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 2
echo "✓ X display ready"

# Enable Bonsai addon in Blender preferences (Blender 4.4 uses different API)
echo "[2/4] Enabling Bonsai addon..."
/opt/blender/blender --background --python-expr "
import bpy
try:
    bpy.ops.preferences.addon_enable(module='bonsai')
    bpy.ops.wm.save_userpref()
    print('✓ Bonsai addon enabled')
except Exception as e:
    print(f'⚠ Bonsai addon enable warning: {e}')
" 2>&1 || true

# Start Blender with MCP socket server
echo "[3/4] Starting Blender MCP socket server..."
/opt/blender/blender --background --python /app/src/blender_mcp/blender_startup.py 2>&1 &
BLENDER_PID=$!

# Wait for Blender socket
echo "[4/4] Waiting for Blender socket server (port 9876)..."
for i in {1..60}; do
    if nc -z localhost 9876 2>/dev/null; then
        echo "✓ Blender socket ready on port 9876"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "✗ Timeout waiting for Blender socket"
        exit 1
    fi
    echo "  Attempt $i/60..."
    sleep 1
done

# Start HTTP server
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

# Launch
CMD ["/app/start.sh"]





























