# Dockerfile for ifc-bonsai-mcp server with Blender
# Multi-stage build to minimize final image size

# Stage 1: Blender download and setup
FROM ubuntu:22.04 AS blender-builder

WORKDIR /tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    libxrender1 \
    libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

# Download pre-built Blender binary (much faster than compiling)
# Using Blender 4.0 which is stable and widely available
RUN cd /tmp && \
    wget -q https://download.blender.org/release/Blender4.0/blender-4.0.2-linux-x64.tar.xz -O blender.tar.xz && \
    tar -xf blender.tar.xz && \
    rm blender.tar.xz

# Stage 2: Runtime with Python + MCP + Blender
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies (minimal set)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    xvfb \
    libxrender1 \
    libxkbcommon0 \
    libfreetype6 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Copy Blender from builder stage (find the blender directory)
COPY --from=blender-builder /tmp/blender-* /opt/blender

# Create symlink for easy access
RUN ln -s /opt/blender/blender /usr/local/bin/blender

# Copy all project files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    mcp-server \
    mcp \
    fastapi \
    uvicorn \
    python-dotenv \
    rich \
    requests \
    beautifulsoup4 \
    tqdm \
    numpy \
    scipy \
    langchain-core \
    langchain \
    langchain-community \
    langchain-huggingface

# Install BlenderBIM addon dependencies
RUN pip install --no-cache-dir \
    ifcopenshell \
    lark \
    networkx

# Set Python path to include src directory where blender_mcp module is
ENV PYTHONPATH=/app/src:$PYTHONPATH

# HTTP server port (Railway default: 8080)
ENV HTTP_PORT=8080
EXPOSE 8080

# Create startup script that starts Blender + MCP server
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting Blender with MCP addon socket server..."
# Start Blender in background with socket server
# The addon will listen on localhost:9876
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 &
XVFB_PID=$!
sleep 2

# Start Blender in background
/opt/blender/blender --background --python /app/src/blender_mcp/blender_startup.py 2>&1 &
BLENDER_PID=$!

# Wait for Blender socket to be ready
echo "Waiting for Blender socket server to be ready..."
for i in {1..30}; do
    if nc -z localhost 9876 2>/dev/null; then
        echo "✓ Blender socket server ready"
        break
    fi
    echo "  Waiting... ($i/30)"
    sleep 1
done

# Start MCP HTTP server
echo "Starting MCP HTTP Server on port 8080..."
exec python /app/hybrid_server.py
EOF

# Make the script executable
RUN chmod +x /app/start.sh

# Install netcat for socket checking
RUN apt-get update && apt-get install -y --no-install-recommends netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health 2>/dev/null || exit 1

# Run startup script
CMD ["/app/start.sh"]





