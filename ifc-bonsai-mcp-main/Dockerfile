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

# MCP server port
ENV PORT=7777
EXPOSE 7777

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:7777/health 2>/dev/null || exit 1

# Run MCP server directly using Python path
CMD ["python", "-c", "from blender_mcp.server import main; main()"]

