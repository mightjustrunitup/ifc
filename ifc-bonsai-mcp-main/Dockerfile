# Dockerfile for IFC Bonsai MCP Server with Blender 4.4 + Bonsai Addon
# Optimized for Railway deployment - FASTER BUILD

##############################################
# Stage 1: Blender 4.4 download + dependencies
##############################################

FROM ubuntu:22.04 AS blender-builder

WORKDIR /tmp

# Install minimal packages needed for download/extraction
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates xz-utils unzip \
    && rm -rf /var/lib/apt/lists/*

# Download Blender 4.4 LTS
RUN wget -q https://download.blender.org/release/Blender4.4/blender-4.4.1-linux-x64.tar.xz -O blender.tar.xz && \
    tar -xf blender.tar.xz && \
    rm blender.tar.xz

# Download and extract Bonsai addon
RUN wget -q https://github.com/IfcOpenShell/IfcOpenShell/releases/download/bonsai-0.8.5-alpha2512111939/bonsai_py311-0.8.5-alpha251211-linux-x64.zip -O bonsai.zip && \
    unzip -q bonsai.zip && \
    mv bonsai bonsai-addon && \
    rm bonsai.zip

##############################################
# Stage 2: Runtime with Python + MCP + Blender
##############################################

FROM ubuntu:22.04

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PYTHONPATH=/app/src:/opt/blender/4.4/python/lib/python3.11/site-packages

WORKDIR /app

# Add deadsnakes PPA for Python 3.11
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common curl gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xf23c5a6cf475977595c89f51ba6932366a755776" | \
    gpg --dearmor -o /etc/apt/keyrings/deadsnakes-ppa.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/deadsnakes-ppa.gpg] https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu jammy main" > /etc/apt/sources.list.d/deadsnakes-ppa.list && \
    apt-get update && \
    rm -rf /var/lib/apt/lists/*

# Install ALL dependencies in ONE layer for Docker caching
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-dev python3.11-venv python3-pip \
    wget curl xvfb netcat-openbsd \
    libxrender1 libxkbcommon0 libfreetype6 libfontconfig1 \
    libxfixes3 libxext6 libxi6 libxinerama1 libxcursor1 \
    libxrandr2 libxdamage1 libxcomposite1 libx11-6 \
    libsm6 libice6 libgl1 libbz2-1.0 libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.11 /usr/bin/python

# Install pip for Python 3.11 using get-pip.py
RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11

# Copy Blender and Bonsai from builder
COPY --from=blender-builder /tmp/blender-4.4.1-linux-x64 /opt/blender
COPY --from=blender-builder /tmp/bonsai-addon /root/.config/blender/4.4/scripts/addons/bonsai

# Symlink blender
RUN ln -s /opt/blender/blender /usr/local/bin/blender

# Copy project files BEFORE pip install (for better caching)
COPY . /app

# Install Python dependencies - COMBINED for speed
RUN python3.11 -m pip install --no-cache-dir \
    mcp mcp-server fastapi uvicorn python-dotenv rich \
    requests beautifulsoup4 tqdm numpy scipy ifcopenshell lark networkx

# Install to Blender's Python (continue on error)
RUN /opt/blender/4.4/python/bin/python3.11 -m pip install --no-cache-dir \
    ifcopenshell numpy scipy || true

# Use Railway's PORT
ENV HTTP_PORT=${PORT:-8080}
EXPOSE ${PORT:-8080}

# Startup script - SIMPLIFIED
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e
export HTTP_PORT=${PORT:-8080}
export DISPLAY=:99

echo "Starting Bonsai MCP Server on port ${HTTP_PORT}..."

# Start Xvfb
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
sleep 2

# Start Blender MCP socket
/opt/blender/blender --background --python /app/src/blender_mcp/blender_startup.py > /tmp/blender.log 2>&1 &

# Wait for socket
for i in {1..30}; do
    nc -z localhost 9876 2>/dev/null && break
    [ $i -eq 30 ] && echo "Blender timeout" && exit 1
    sleep 1
done

echo "Starting HTTP server..."
exec python3.11 /app/hybrid_server.py
EOF

RUN chmod +x /app/start.sh

# Simplified health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

CMD ["/app/start.sh"]
