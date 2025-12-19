# Use official Python runtime as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for scientific packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml uv.lock* ./
COPY src/ ./src/
COPY blender_addon/ ./blender_addon/
COPY scripts/ ./scripts/
COPY docs/ ./docs/

# Install uv package manager
RUN pip install --no-cache-dir uv

# Install Python dependencies
RUN uv pip install --system -e .

# Expose port for MCP server communication
EXPOSE 8080

# Health check for the container
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8080/health', timeout=5)" || exit 1

# Run the MCP server
CMD ["python", "-m", "blender_mcp.server"]
