# Ultra-optimized Dockerfile for Railway
# Focuses on SPEED and minimal layers

FROM ubuntu:22.04

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    HTTP_PORT=${PORT:-8080}

WORKDIR /tmp

# STAGE 1: Install everything in parallel and minimal layers
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl ca-certificates xz-utils unzip \
    python3.11 python3.11-dev xvfb netcat-openbsd \
    libxrender1 libxkbcommon0 libfreetype6 libfontconfig1 \
    libxfixes3 libxext6 libxi6 libxinerama1 libxcursor1 \
    libxrandr2 libxdamage1 libxcomposite1 libx11-6 \
    libsm6 libice6 libgl1 libbz2-1.0 libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.11 /usr/bin/python

# Download Blender and Bonsai in parallel (using background processes)
RUN (wget -q https://download.blender.org/release/Blender4.4/blender-4.4.1-linux-x64.tar.xz -O blender.tar.xz &) && \
    (wget -q https://github.com/IfcOpenShell/IfcOpenShell/releases/download/bonsai-0.8.5-alpha2512111939/bonsai_py311-0.8.5-alpha251211-linux-x64.zip -O bonsai.zip &) && \
    wait

# Extract both in parallel
RUN (tar -xf blender.tar.xz &) && \
    (unzip -q bonsai.zip &) && \
    wait && \
    mv blender-4.4.1-linux-x64 /opt/blender && \
    mkdir -p /root/.config/blender/4.4/scripts/addons && \
    mv bonsai /root/.config/blender/4.4/scripts/addons/ && \
    rm blender.tar.xz bonsai.zip && \
    ln -s /opt/blender/blender /usr/local/bin/blender

# Setup pip quickly
RUN python3.11 -m ensurepip && \
    python3.11 -m pip install --no-cache-dir -U pip

WORKDIR /app
COPY . .

# Install Python deps - only essentials for faster build
RUN python3.11 -m pip install --no-cache-dir \
    fastapi uvicorn[standard] python-dotenv

# Minimal startup script
RUN echo '#!/bin/bash\n\
set -e\n\
export DISPLAY=:99\n\
Xvfb :99 -screen 0 1024x768x24 &\n\
sleep 2\n\
blender --background --python /app/src/blender_mcp/blender_startup.py &\n\
sleep 10\n\
exec python3.11 /app/hybrid_server.py' > /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE ${PORT:-8080}

CMD ["/app/start.sh"]
