# Dockerfile for ifc-bonsai-mcp server
# Standalone MCP server service (no Blender binary)
# Deploy this on a separate Railway service from blenderbim-backend

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY . /app

# Install Python dependencies
# The package is self-contained in src/blender_mcp
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -e . && \
    pip install --no-cache-dir uvicorn fastapi

# MCP server port
ENV PORT=7777
EXPOSE 7777

# Health check (optional)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:7777/health 2>/dev/null || exit 1

# Run MCP server
CMD ["python", "-m", "blender_mcp.server"]

