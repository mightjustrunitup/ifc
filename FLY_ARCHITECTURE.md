# IFC Bonsai MCP on Fly.io - Architecture & Configuration Guide

## Overview

This document explains how the IFC Bonsai MCP application is configured for cloud deployment on Fly.io, and how it differs from the local development setup.

## Deployment Architecture

```
┌─────────────────────┐
│   Blender (Local)   │
│   + Bonsai Add-on   │
└──────────┬──────────┘
           │
           │ HTTP/WebSocket
           │
    ┌──────▼──────────┐
    │  Claude Desktop │
    │   + MCP Client  │
    └──────┬──────────┘
           │
           │ HTTP/HTTPS
           │
   ┌───────▼────────────────┐
   │  Fly.io Container      │
   │  - MCP Server          │
   │  - RAG Engine          │
   │  - Embeddings Support  │
   │  - ChromaDB Storage    │
   └────────────────────────┘
```

## Files Created for Deployment

### 1. **Dockerfile**
   - **Purpose**: Containerizes the MCP server for cloud deployment
   - **Key Features**:
     - Python 3.11 slim base image (minimal size)
     - Installs system dependencies for scientific computing
     - Uses `uv` package manager for faster, more reliable installs
     - Health checks configured for auto-healing
     - Exposes port 8080 for MCP communication

### 2. **fly.toml**
   - **Purpose**: Main Fly.io configuration file
   - **Key Sections**:
     - `[build]`: Docker build configuration
     - `[env]`: Environment variables (PORT, Python flags)
     - `[http_service]`: HTTP service setup with health checks
     - `[[services]]`: TCP service for MCP protocol
     - `[[mounts]]`: Persistent storage for ChromaDB (5GB)
     - `[[vm]]`: Machine specs (2 CPUs, 1GB RAM, auto-scaling)

### 3. **DEPLOY.md**
   - Complete deployment guide with:
     - Prerequisites and CLI installation
     - Step-by-step deployment commands
     - Configuration of secrets
     - Monitoring and troubleshooting
     - Scaling recommendations
     - Cost optimization tips

### 4. **.dockerignore**
   - Excludes unnecessary files from Docker image:
     - Git files (.git, .gitignore)
     - Python cache and virtual environments
     - IDE files (.vscode, .idea)
     - Large experimental files and IFC models
     - Saves ~50% on image size

### 5. **Deployment Scripts**
   - **deploy-flyio.sh**: Bash script for Linux/macOS
   - **deploy-flyio.ps1**: PowerShell script for Windows

## Configuration Details

### Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `PORT` | 8080 | MCP server port |
| `PYTHONUNBUFFERED` | 1 | Real-time log output |
| `PYTHONDONTWRITEBYTECODE` | 1 | No .pyc files in container |
| `BLENDER_MCP_REMOTE_EMBEDDINGS_URL` | Optional | External embeddings service |
| `BLENDER_MCP_ENABLE_RAG` | Optional | Enable RAG features |

### Machine Specs (default)

```toml
cpu_kind = "shared"  # Cost-effective shared CPU
cpus = 2             # 2 vCPUs
memory_mb = 1024     # 1 GB RAM
```

**Scaling options** (if needed):
```bash
# Increase to 4GB RAM
fly scale memory 4096

# Increase to 4 CPUs
fly scale cpu 4

# Use dedicated CPU for performance-critical work
fly machine update <id> --cpu-kind performance
```

### Persistent Storage

- **Mount Path**: `/app/.cache/chromadb`
- **Size**: 5GB (can be extended)
- **Purpose**: Stores ChromaDB vector index and embeddings cache
- **Persistence**: Data survives machine restarts

## Deployment Workflow

### Quick Start (Recommended)

```bash
# 1. Ensure you're in the project directory
cd ifc-bonsai-mcp

# 2. Install Fly CLI (if not already installed)
# Visit: https://fly.io/docs/hands-on/install-flyctl/

# 3. Authenticate
fly auth login

# 4. Deploy using the script
# On Windows (PowerShell):
.\scripts\deploy-flyio.ps1

# On Linux/macOS:
bash scripts/deploy-flyio.sh
```

### Manual Deployment

```bash
# Initialize the app
fly launch --name ifc-bonsai-mcp --region iad --no-deploy

# Deploy
fly deploy

# Monitor
fly logs
fly status
```

## Connecting to Blender

After deployment, the Blender add-on still connects to a **local MCP server**. The cloud deployment is useful for:

### Option 1: Local MCP Server (Current Setup)
- Blender → Bonsai Add-on → Local MCP Server → (Optional) Cloud RAG Service
- Recommended for interactive BIM work
- Lower latency for immediate feedback

### Option 2: Cloud MCP Server (Enterprise)
- If deploying for team collaboration:
  1. Keep local MCP server for Blender
  2. Use cloud deployment for shared RAG service
  3. Connect both via API

### Option 3: Hybrid Setup
```
Blender (Local)
  ├→ Local MCP Server (geometry, IFC operations)
  └→ Cloud Embedding Server (RAG, LLM queries)
```

## Monitoring & Maintenance

### View Logs
```bash
fly logs -n 100                    # Last 100 lines
fly logs --follow                  # Real-time logs
fly logs -i INSTANCE_ID            # Specific machine
```

### Performance Monitoring
```bash
fly metrics                        # CPU, Memory, Network
fly status                         # Overall health
fly machine list                   # Connected machines
```

### Troubleshooting

**Container won't start:**
```bash
fly logs
fly ssh console  # SSH into the container
```

**Out of memory:**
```bash
fly scale memory 2048  # Increase to 2GB
```

**Slow response times:**
```bash
# Check metrics
fly metrics

# Scale horizontally (add more machines)
fly machine clone <machine-id>
```

## Cost Estimates (as of 2024)

**Baseline Configuration (2 CPU, 1GB RAM):**
- ≈ $15-20/month with shared CPU
- ≈ $50-100/month with full-time dedicated CPU

**Storage:**
- 5GB persistent volume: ≈ $1.50/month per GB

**Optimization:**
- Use auto-scaling to avoid idle costs
- Deploy during off-hours if possible
- Monitor metrics regularly

## Security Considerations

### HTTPS/TLS
- Automatically enabled by Fly.io
- All connections are encrypted

### Secrets Management
```bash
# Set sensitive environment variables
fly secrets set API_KEY=xxxxxxxxxxxx
fly secrets set DATABASE_URL=postgresql://...

# List secrets
fly secrets list

# Remove secret
fly secrets unset API_KEY
```

### Network Isolation
- App is private by default
- Only publicly accessible via HTTPS endpoint
- Custom IP configuration available

## Limitations & Considerations

1. **Blender Add-on**: Still requires local Blender installation
   - The cloud instance doesn't run Blender
   - Used for MCP server, RAG, and optional embeddings

2. **IFC File Handling**:
   - IFC files must be handled locally in Blender
   - Cloud service provides knowledge and analysis
   - Not a full remote Blender instance

3. **Stateless Design**:
   - MCP server is stateless (better for scaling)
   - State stored in ChromaDB volume
   - Client-side: Blender maintains scene state

## Advanced Configuration

### Custom Domains
```bash
fly certs add your-domain.com
fly certs show
```

### Rate Limiting
Add to fly.toml:
```toml
[[services.rate_limiting]]
requests = 100
window = "60s"
```

### PostgreSQL Database (if needed)
```bash
fly postgres create --name ifc-db
fly postgres attach ifc-db
```

## Rollback & Versioning

```bash
# View deployment history
fly releases

# Rollback to previous version
fly releases rollback <version-number>

# View specific release details
fly releases info <version-number>
```

## Migration from Local to Cloud

1. **Keep existing local setup** working for Blender
2. **Deploy cloud instance** for RAG/embedding services
3. **Update environment variable** in local MCP server to point to cloud:
   ```bash
   export BLENDER_MCP_REMOTE_EMBEDDINGS_URL=https://your-app.fly.dev
   ```
4. **Test thoroughly** before full migration

## Useful Commands Reference

```bash
# Deployment
fly launch                           # Initialize new app
fly deploy                           # Deploy/redeploy
fly releases rollback               # Undo last deploy

# Monitoring
fly logs                             # View logs
fly status                           # App status
fly metrics                          # Performance metrics
fly ssh console                      # SSH into container

# Scaling
fly scale memory 2048                # Scale memory
fly scale cpu 4                      # Scale CPU
fly machine clone <id>               # Add machine

# Configuration
fly secrets set KEY=VALUE            # Set secret
fly env set KEY=VALUE                # Set environment variable
fly restart                          # Restart app

# Management
fly open                             # Open app in browser
fly info                             # Show app details
fly pause                            # Stop the app
fly resume                           # Start the app
fly destroy                          # Delete the app
```

## Support & Resources

- **Fly.io Docs**: https://fly.io/docs/
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Project Issues**: Check TROUBLESHOOTING.md
- **Fly.io Community**: https://community.fly.io

---

**Last Updated**: December 2024
**Fly.io Version**: Compatible with latest (machines & apps platform)
