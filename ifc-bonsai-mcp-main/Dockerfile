# Dockerfile for ifc-bonsai-mcp server
# Lightweight MCP server (no Blender, minimal dependencies)
# Deploy this on a separate Railway service from blenderbim-backend

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install minimal system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy all project files
COPY . /app

# Install ONLY core MCP dependencies (skip all optional/heavy dependencies)
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

# Set Python path to include src directory where blender_mcp module is
ENV PYTHONPATH=/app/src:$PYTHONPATH

# HTTP server port (Railway default: 8080)
ENV HTTP_PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health 2>/dev/null || exit 1

# Run the hybrid HTTP + MCP server
CMD ["python", "/app/hybrid_server.py"]



