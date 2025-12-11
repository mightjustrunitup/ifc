# Dockerfile for IFC Bonsai MCP Server with Blender + Bonsai
# Multi-stage build to minimize final image size
# This serves as both tool definitions AND tool executor

# Stage 1: Blender download
FROM ubuntu:22.04 AS blender-builder

WORKDIR /tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Download Blender 4.4 LTS (more stable)
RUN wget -q https://download.blender.org/release/Blender4.4/blender-4.4.0-linux-x64.tar.xz && \
    tar -xf blender-4.4.0-linux-x64.tar.xz && \
    rm blender-4.4.0-linux-x64.tar.xz

# Stage 2: BlenderBIM addon
FROM ubuntu:22.04 AS bonsai-builder

WORKDIR /tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Download BlenderBIM addon (Bonsai successor)
RUN wget -q https://github.com/IfcOpenShell/IfcOpenShell/releases/download/blenderbim-240602/blenderbim-240602-py311-linux.zip && \
    mkdir -p /tmp/bonsai_addon && \
    unzip -q blenderbim-240602-py311-linux.zip -d /tmp/bonsai_addon && \
    rm blenderbim-240602-py311-linux.zip

# Stage 3: Runtime
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    xvfb \
    libxrender1 \
    libxkbcommon0 \
    libfreetype6 \
    libfontconfig1 \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Copy Blender from builder
COPY --from=blender-builder /tmp/blender-4.4.0-linux-x64 /opt/blender

# Copy Bonsai addon from builder
COPY --from=bonsai-builder /tmp/bonsai_addon /root/.config/blender/4.4/scripts/addons

# Create symlink for Blender
RUN ln -s /opt/blender/blender /usr/local/bin/blender

# Copy all project files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    mcp \
    fastapi \
    uvicorn \
    python-dotenv \
    requests \
    ifcopenshell \
    trimesh \
    numpy

# Set Python path
ENV PYTHONPATH=/app/src:$PYTHONPATH
ENV HTTP_PORT=8080
EXPOSE 8080

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

echo "[MCP] Starting virtual display..."
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
sleep 2

echo "[MCP] Starting Blender with Bonsai addon..."
/opt/blender/blender --background --python /app/src/blender_mcp/blender_startup.py 2>&1 &
BLENDER_PID=$!

echo "[MCP] Waiting for Blender socket on port 9876..."
for i in {1..60}; do
    if nc -z localhost 9876 2>/dev/null; then
        echo "[MCP] ✓ Blender ready!"
        break
    fi
    echo "[MCP] Attempt $i/60..."
    sleep 1
done

echo "[MCP] Starting MCP HTTP Server on port 8080..."
exec python /app/hybrid_server.py
EOF

RUN chmod +x /app/start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/ 2>/dev/null || exit 1

CMD ["/app/start.sh"]







