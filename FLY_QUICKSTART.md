# Fly.io Deployment Setup - Quick Reference

## Files Created

✅ **Dockerfile** - Container image definition
✅ **fly.toml** - Fly.io application configuration  
✅ **DEPLOY.md** - Complete deployment guide
✅ **FLY_ARCHITECTURE.md** - Detailed architecture & configuration
✅ **.dockerignore** - Exclude files from Docker image
✅ **scripts/deploy-flyio.sh** - Bash deployment script
✅ **scripts/deploy-flyio.ps1** - PowerShell deployment script

## Quick Start (3 Steps)

### Step 1: Install Flyctl CLI
```bash
# Visit: https://fly.io/docs/hands-on/install-flyctl/
# Or use your package manager
```

### Step 2: Authenticate
```bash
fly auth login
```

### Step 3: Deploy
```bash
# Option A: Using deployment script
Windows: .\scripts\deploy-flyio.ps1
Linux/macOS: bash scripts/deploy-flyio.sh

# Option B: Manual deployment
fly launch --name ifc-bonsai-mcp --region iad
fly deploy
```

## Default Configuration

| Setting | Value |
|---------|-------|
| **App Name** | ifc-bonsai-mcp |
| **Region** | iad (US East) |
| **CPU** | 2 shared CPUs |
| **Memory** | 1 GB |
| **Storage** | 5 GB (ChromaDB) |
| **Port** | 8080 |
| **HTTPS** | ✅ Auto-enabled |
| **Auto-scaling** | ✅ Enabled |

## After Deployment

### View your app
```bash
fly open                          # Opens in browser
fly status                        # Check status
fly logs                          # View logs
```

### Access your server
```
https://ifc-bonsai-mcp.fly.dev    # Change app name if different
```

### Set environment variables
```bash
fly secrets set BLENDER_MCP_ENABLE_RAG=true
```

## Deployment Architecture

```
Blender (Local)
    ↓
Bonsai Add-on (Local)
    ↓
Claude Desktop + MCP Client
    ↓
Fly.io Cloud ← MCP Server + RAG + ChromaDB
```

## Key Features Configured

✅ Health checks (auto-healing)
✅ HTTPS/TLS encryption
✅ Persistent storage (ChromaDB)
✅ Auto-scaling machines
✅ Automatic logs and metrics
✅ Docker containerization

## Scale Later If Needed

```bash
# Increase memory
fly scale memory 4096

# Add more CPU power
fly scale cpu 4

# Add horizontal scaling
fly machine clone <machine-id>
```

## Documentation

- **[DEPLOY.md](DEPLOY.md)** - Step-by-step deployment guide
- **[FLY_ARCHITECTURE.md](FLY_ARCHITECTURE.md)** - Architecture details & advanced config

## Important Notes

⚠️ **Blender still runs locally** - The cloud instance provides:
   - MCP server for protocol handling
   - RAG/knowledge base services
   - Embeddings support

⚠️ **Persistent storage** - ChromaDB data survives restarts
   - Located at: `/app/.cache/chromadb`
   - Size: 5GB (can be extended)

⚠️ **Environment variables** - Set secrets for sensitive data:
   ```bash
   fly secrets set VARIABLE_NAME=value
   ```

## Troubleshooting Quick Fixes

| Issue | Solution |
|-------|----------|
| App won't start | `fly logs` then `fly ssh console` |
| Out of memory | `fly scale memory 2048` |
| 502 Bad Gateway | Check `fly logs` for errors |
| Slow performance | `fly metrics` to check CPU usage |

## Cost (Estimated)

- **Shared CPU (2 vCPU, 1GB RAM)**: $15-20/month
- **Storage (5GB)**: ~$1.50/month
- **Total**: ~$18/month with auto-scaling

## Next Steps

1. ✅ Files are ready for deployment
2. Install Flyctl CLI if not already installed
3. Run `fly auth login`
4. Run the deployment script or use `fly deploy`
5. Monitor with `fly logs` and `fly status`

---

For detailed instructions, see [DEPLOY.md](DEPLOY.md)
For architecture details, see [FLY_ARCHITECTURE.md](FLY_ARCHITECTURE.md)
