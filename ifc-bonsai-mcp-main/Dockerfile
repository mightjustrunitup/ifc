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

# Download Bonsai addon from GitHub (latest as of Dec 11, 2025 - bonsai-0.8.5-alpha2512111939)
RUN echo "Downloading Bonsai addon build..." && \
    cd /tmp && \
    wget -q https://github.com/IfcOpenShell/IfcOpenShell/releases/download/bonsai-0.8.5-alpha2512111939/bonsai_py311-0.8.5-alpha2512111939-linux-x64.zip -O bonsai.zip && \
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

# Install prerequisites, add Deadsnakes PPA manually with correct key fetch, and install Python 3.11 + dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    curl \
    gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xf23c5a6cf475977595c89f51ba6932366a755776" | gpg --dearmor -o /etc/apt/keyrings/deadsnakes-ppa.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/deadsnakes-ppa.gpg] https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu jammy main" > /etc/apt/sources.list.d/deadsnakes-ppa.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
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

# Set up pip for Python 3.11
RUN python3.11 -m ensurepip --upgrade && \
    python3.11 -m pip install --upgrade pip setuptools wheel

# Copy Blender from builder
COPY --from=blender-builder /tmp/blender-4.4.1-linux-x64 /opt/blender

# Copy Bonsai addon from builder and install to Blender addons directory
RUN mkdir -p /root/.config/blender/4.4/scripts/addons
COPY --from=blender-builder /tmp/bonsai-addon /root/.config/blender/4.4/scripts/addons/bonsai

# Symlink blender for easy access
RUN ln -s /opt/blender/blender /usr/local/bin/blender

# Copy project files
COPY . /app

# Install Python dependencies using Python 3.11's pip
RUN python3.11 -m pip install --no-cache-dir \
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

# Also install to Blender's embedded Python (for Bonsai addon)
RUN /opt/blender/4.4/python/bin/python3.11 -m pip install --no-cache-dir \
    ifcopenshell \
    numpy \
    scipy 2>&1 || echo "⚠ Some packages may not be available for Blender Python"

# Set Python path to your source
ENV PYTHONPATH=/app/src:$PYTHONPATH
ENV PYTHONPATH=/opt/blender/4.4/python/lib/python3.11/site-packages:$PYTHONPATH

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

# Enable addons and check dependencies
echo "[2/4] Checking addons and dependencies..."
/opt/blender/blender --background --python-expr "
import sys
sys.path.insert(0, '/root/.config/blender/4.4/scripts/addons')
try:
    import ifcopenshell.api
    print('✓ ifcopenshell available')
except ImportError as e:
    print(f'⚠ ifcopenshell not available: {e}')

try:
    import bonsai
    print('✓ Bonsai addon available')
except ImportError as e:
    print(f'⚠ Bonsai addon not available: {e}')
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
cd /app && exec /usr/bin/python3.11 /app/hybrid_server.py
EOF

RUN chmod +x /app/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health 2>/dev/null || exit 1

# Launch
CMD ["/app/start.sh"]
