# Complete Fly.io Deployment Setup Guide

## 🎯 What's Been Prepared For You

Your IFC Bonsai MCP repository is now ready for cloud deployment on Fly.io. Here's what has been created:

### Core Deployment Files
- **Dockerfile** - Containerizes your MCP server for cloud
- **fly.toml** - Fly.io application configuration
- **.dockerignore** - Optimizes Docker image size

### Documentation
- **DEPLOY.md** - Comprehensive deployment guide
- **FLY_QUICKSTART.md** - Quick reference guide  
- **FLY_ARCHITECTURE.md** - Architecture details & advanced configuration

### Scripts
- **scripts/deploy-flyio.sh** - Bash deployment (Linux/macOS)
- **scripts/deploy-flyio.ps1** - PowerShell deployment (Windows)

### CI/CD
- **.github/workflows/deploy-flyio.yml** - Automated GitHub Actions deployment

---

## 🚀 Quick Start (Copy & Paste)

### For Windows Users (PowerShell)

```powershell
# 1. Install Flyctl (if needed)
winget install fly

# 2. Authenticate
fly auth login

# 3. Deploy
cd C:\path\to\ifc-bonsai-mcp
.\scripts\deploy-flyio.ps1
```

### For Linux/macOS Users (Bash)

```bash
# 1. Install Flyctl (if needed)
# Visit: https://fly.io/docs/hands-on/install-flyctl/

# 2. Authenticate
fly auth login

# 3. Deploy
cd /path/to/ifc-bonsai-mcp
bash scripts/deploy-flyio.sh
```

### For Manual Deployment (All Platforms)

```bash
fly launch --name ifc-bonsai-mcp --region iad --no-deploy
fly deploy
```

---

## 📋 Prerequisites Checklist

Before deploying, ensure you have:

- [ ] Fly.io account created at https://fly.io
- [ ] Flyctl CLI installed on your machine
- [ ] Terminal/PowerShell access
- [ ] Git installed (for version control)
- [ ] Internet connection for Docker builds

---

## 🔧 Installation Steps

### Step 1: Install Flyctl CLI

**Windows (PowerShell):**
```powershell
winget install fly
```

**macOS:**
```bash
brew install flyctl
```

**Linux (Ubuntu/Debian):**
```bash
curl -L https://fly.io/install.sh | sh
```

**Or download manually:**
Visit https://fly.io/docs/hands-on/install-flyctl/ and follow the instructions.

### Step 2: Verify Installation

```bash
fly version
fly auth whoami
```

If you see version info and your email, you're authenticated!

### Step 3: Configure Your App Name (Optional)

The default app name is `ifc-bonsai-mcp`. To use a different name:

Edit [fly.toml](fly.toml) line 1:
```toml
app = "your-desired-app-name"
```

### Step 4: Deploy to Fly.io

**Option A: Using the deployment script (Recommended)**

Windows:
```powershell
.\scripts\deploy-flyio.ps1 -AppName "ifc-bonsai-mcp" -Region "iad"
```

Linux/macOS:
```bash
bash scripts/deploy-flyio.sh ifc-bonsai-mcp iad
```

**Option B: Manual deployment**

```bash
fly launch
# Follow prompts, then:
fly deploy
```

---

## 🌍 Deployment Regions

Choose the region closest to you (or your users):

| Region | Code | Location |
|--------|------|----------|
| US East | `iad` | Northern Virginia (Recommended) |
| US West | `pdx` | Portland, Oregon |
| Europe | `ams` | Amsterdam |
| Asia-Pacific | `syd` | Sydney |

Change region in [fly.toml](fly.toml) or during `fly launch`:

```bash
fly launch --region pdx
```

---

## ✅ Verify Your Deployment

After deployment, your app is live! Access it at:
```
https://ifc-bonsai-mcp.fly.dev
```
(Replace `ifc-bonsai-mcp` with your actual app name)

### Check Status

```bash
fly status                    # Overall health
fly logs                      # View recent logs
fly metrics                   # CPU, Memory, Network usage
fly machine list              # Connected machines
```

### Test Health Check

```bash
curl https://ifc-bonsai-mcp.fly.dev/health
```

Should return: `200 OK` (or similar success response)

---

## 🔐 Environment Variables & Secrets

### Set Secret Variables

```bash
# For sensitive data, use secrets:
fly secrets set SECRET_NAME=secret_value

# Example: Enable RAG features
fly secrets set BLENDER_MCP_ENABLE_RAG=true

# Example: Set embedding service URL
fly secrets set BLENDER_MCP_REMOTE_EMBEDDINGS_URL=https://your-service.com
```

### View Configured Secrets

```bash
fly secrets list
```

### Remove a Secret

```bash
fly secrets unset SECRET_NAME
```

---

## 📊 Monitoring & Maintenance

### View Logs

```bash
fly logs                      # Stream logs
fly logs -n 50                # Last 50 lines
fly logs --follow             # Follow in real-time
```

### Performance Metrics

```bash
fly metrics                   # See CPU, memory, network
```

### SSH Into Container

```bash
fly ssh console              # Debug the running container
# Inside: you can run commands like 'top', 'ls', etc.
```

### Restart the App

```bash
fly restart                   # Restart all machines
fly machine restart <id>      # Restart specific machine
```

---

## 📈 Scaling Configuration

### Vertical Scaling (More Power)

```bash
# Increase memory to 2GB
fly scale memory 2048

# Increase CPU to 4 cores
fly scale cpu 4

# Use dedicated CPU (better performance, higher cost)
fly machine update <id> --cpu-kind performance
```

### Horizontal Scaling (More Machines)

```bash
# Clone an existing machine
fly machine clone <machine-id>

# Or let Fly.io auto-scale (configured in fly.toml)
```

### Current Configuration

From [fly.toml](fly.toml):
- **CPUs**: 2 shared cores
- **Memory**: 1 GB
- **Auto-scaling**: Enabled
- **Storage**: 5 GB persistent volume

---

## 🔄 Deployment Updates

### Deploy Changes

After making code changes:

```bash
# Commit changes
git add .
git commit -m "Your changes"

# Deploy new version
fly deploy

# Monitor the deployment
fly logs --follow
```

### Rollback to Previous Version

```bash
# View deployment history
fly releases

# Rollback to a previous version
fly releases rollback <version-number>

# Example:
fly releases rollback 3
```

---

## 🔗 Connecting to Blender

The Blender add-on still connects to a **local MCP server**. The cloud deployment is optional and provides:

1. **RAG Service** - Knowledge base queries
2. **Embedding Service** - Text embeddings
3. **Shared Infrastructure** - For team collaboration

### To Use Cloud RAG Service

Set environment variable in your local MCP server:

```bash
export BLENDER_MCP_REMOTE_EMBEDDINGS_URL=https://ifc-bonsai-mcp.fly.dev
```

Or in Windows (PowerShell):
```powershell
$env:BLENDER_MCP_REMOTE_EMBEDDINGS_URL="https://ifc-bonsai-mcp.fly.dev"
```

---

## ⚙️ Persistent Storage

Your app includes **5GB of persistent storage** for:
- ChromaDB vector index
- Embeddings cache
- Knowledge base documents

### Manage Storage

```bash
# List volumes
fly volumes list

# Extend volume size
fly volumes extend <volume-id> --size 10  # Resize to 10GB
```

Data persists across:
- Machine restarts
- Updates and redeployments
- Scaling operations

---

## 🛡️ Security Best Practices

✅ **HTTPS**: Enabled automatically by Fly.io
✅ **Secrets**: Use `fly secrets` for sensitive data
✅ **Isolation**: Private network by default
✅ **Monitoring**: Enable alerts for errors

### Never Store Secrets in Code!

❌ Bad:
```python
API_KEY = "abc123xyz"  # Don't do this!
```

✅ Good:
```bash
fly secrets set API_KEY=abc123xyz
# Then access via environment variable
import os
api_key = os.getenv("API_KEY")
```

---

## 💰 Cost Management

### Estimated Monthly Cost (Default Config)

- **Shared 2-CPU, 1GB RAM**: $15-20/month
- **5GB Storage**: ~$1.50/month
- **Total**: ~$18/month

### Optimize Costs

1. **Use auto-scaling** (configured, turns off idle machines)
2. **Monitor usage** with `fly metrics`
3. **Choose shared CPU** instead of dedicated
4. **Right-size your machines** - don't over-provision
5. **Clean up unused apps** with `fly destroy`

---

## 🐛 Troubleshooting

### App Won't Start

```bash
# Check logs
fly logs

# SSH into container for debugging
fly ssh console

# View container processes
ps aux
```

### Out of Memory Errors

```bash
# Increase memory
fly scale memory 2048

# Monitor usage
fly metrics
```

### 502 Bad Gateway

```bash
# Check if app is running
fly status

# View logs
fly logs --level error

# Restart if needed
fly restart
```

### Slow Performance

```bash
# Check metrics
fly metrics

# Check CPU usage
fly ssh console
# Then run: top

# Scale up if needed
fly scale cpu 4
```

---

## 📚 Documentation Reference

### Key Documents
- **[DEPLOY.md](DEPLOY.md)** - Full deployment guide
- **[FLY_QUICKSTART.md](FLY_QUICKSTART.md)** - Quick reference
- **[FLY_ARCHITECTURE.md](FLY_ARCHITECTURE.md)** - Architecture details

### Project Documentation
- **[README.md](README.md)** - Main project overview
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues

### External Resources
- **[Fly.io Official Docs](https://fly.io/docs/)**
- **[MCP Protocol Docs](https://modelcontextprotocol.io/)**
- **[Fly.io CLI Reference](https://fly.io/docs/flyctl/)**

---

## 🔄 Automated Deployments (GitHub Actions)

### Setup CI/CD

The repository includes GitHub Actions workflow (`.github/workflows/deploy-flyio.yml`) for automatic deployments.

**To enable:**

1. Get your Fly.io API token:
   ```bash
   fly auth token
   ```

2. Add it to GitHub secrets:
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Add new secret: `FLY_API_TOKEN` with your token value

3. Commits to `main` branch will auto-deploy!

---

## 🎯 Next Steps

1. ✅ Review [FLY_QUICKSTART.md](FLY_QUICKSTART.md) for quick reference
2. ✅ Run deployment script or `fly deploy`
3. ✅ Verify with `fly status` and `fly logs`
4. ✅ Test health check: `curl https://your-app.fly.dev/health`
5. ✅ Configure secrets if needed: `fly secrets set KEY=value`
6. ✅ Monitor performance: `fly metrics`

---

## 📞 Support

- **Deployment Issues**: Check [DEPLOY.md](DEPLOY.md) troubleshooting section
- **Fly.io Help**: https://community.fly.io
- **Project Issues**: Open an issue on GitHub
- **MCP Questions**: See TROUBLESHOOTING.md

---

## 🎉 Deployment Complete!

Your IFC Bonsai MCP is ready for the cloud. The configuration is optimized for:

✅ Performance - Fast response times  
✅ Reliability - Auto-healing and health checks  
✅ Cost-efficiency - Auto-scaling and shared resources  
✅ Security - HTTPS and secrets management  
✅ Monitoring - Built-in logs and metrics  

**Happy deploying! 🚀**

---

**Created**: December 2024  
**Updated**: December 19, 2025  
**For**: IFC Bonsai MCP Fly.io Deployment
