# Deploying IFC Bonsai MCP to Fly.io

This guide provides step-by-step instructions for deploying the IFC Bonsai MCP server to Fly.io.

## Prerequisites

- **Fly.io Account**: Create one at [fly.io](https://fly.io)
- **Fly CLI**: Install from https://fly.io/docs/hands-on/install-flyctl/
- **Git**: For version control

## Installation Steps

### 1. Install Flyctl CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (using Windows Package Manager)
winget install fly

# Or download from: https://fly.io/docs/hands-on/install-flyctl/
```

### 2. Authenticate with Fly.io

```bash
fly auth login
# This will open your browser to authenticate and create an API token
```

### 3. Deploy the Application

```bash
# Navigate to the project directory
cd /path/to/ifc-bonsai-mcp

# Create a new Fly.io app (first time only)
fly launch

# When prompted:
# - Enter your desired app name (e.g., ifc-bonsai-mcp)
# - Choose a region (default: iad for US East Coast)
# - Accept the Dockerfile
# - Skip the database setup
# - No need for Redis or other extras

# Deploy the application
fly deploy
```

### 4. Configure Secrets (if needed)

Set any required environment variables:

```bash
# Optional: Set embedding service URL
fly secrets set BLENDER_MCP_REMOTE_EMBEDDINGS_URL=https://your-embeddings-service.com

# Optional: Enable RAG features
fly secrets set BLENDER_MCP_ENABLE_RAG=true
```

### 5. Monitor Your Deployment

```bash
# View deployment status
fly status

# View recent logs
fly logs

# SSH into the machine for debugging
fly ssh console

# View metrics
fly metrics
```

## Verifying Deployment

Once deployed, your MCP server will be available at:
- **Base URL**: `https://<your-app-name>.fly.dev`
- **Health Check**: `https://<your-app-name>.fly.dev/health`

Test the deployment:

```bash
# Check if the server is running
curl https://<your-app-name>.fly.dev/health

# View logs
fly logs
```

## Connecting to Claude Desktop

After deployment, update your Claude Desktop configuration:

1. Open Claude Desktop > Settings > Developer > Edit Config
2. Update the MCP server configuration to point to your Fly.io deployment:

```json
{
  "mcpServers": {
    "blender": {
      "command": "npx",
      "args": ["@modelcontextprotocol/inspector", "curl", "-X", "POST", "https://<your-app-name>.fly.dev/mcp"]
    }
  }
}
```

**Note**: For production use with Blender, you'll still need to run a local MCP server instance. The cloud deployment is useful for:
- Running the embedding service separately
- Horizontal scaling of RAG operations
- Isolating compute-heavy operations

## Scaling Configuration

### Vertical Scaling (CPU/Memory)

```bash
# View current machine configuration
fly machine list

# Scale up memory
fly scale memory 2048

# Scale CPU
fly scale cpu 4
```

### Horizontal Scaling

```bash
# Create additional machines (auto-scaling is configured in fly.toml)
fly machine clone <machine-id>
```

### Auto-Scaling Settings

The `fly.toml` is configured with:
- **Min machines**: 1
- **Max machines**: Can be adjusted in fly.toml
- **Auto-stop**: Machines stop when idle
- **Auto-start**: Machines start when traffic arrives

## Managing the Deployment

### View Application Info

```bash
fly info
```

### Update the Application

```bash
# Make code changes, then redeploy
git add .
git commit -m "Your changes"
fly deploy
```

### Rollback to Previous Deployment

```bash
fly releases
fly releases rollback <version-number>
```

### Stop/Start the Application

```bash
# Pause the app (keeps configuration)
fly pause

# Resume the app
fly resume

# Destroy the app (deletes everything)
fly destroy
```

## Storage & Persistence

The deployment includes a 5GB persistent volume at `/app/.cache/chromadb` for:
- ChromaDB vector index
- Embeddings cache
- Knowledge base documents

To manage the volume:

```bash
# List volumes
fly volumes list

# View volume details
fly volumes list -c app

# Resize volume
fly volumes extend <volume-id> --size 10  # In GB
```

## Troubleshooting

### Application won't start

```bash
# View detailed logs
fly logs --level debug

# SSH into the container
fly ssh console

# Check running processes
ps aux
```

### Out of memory issues

```bash
# Check machine specs
fly machine list

# Increase memory
fly scale memory 2048
```

### Slow performance

```bash
# Check CPU usage
fly metrics

# View network metrics
fly ssh console
# Inside container: top, iostat, etc.
```

### Database/Volume issues

```bash
# Check volume status
fly volumes list

# Restart the machine
fly machine restart <machine-id>
```

## Cost Optimization

- **Auto-scaling**: Machines auto-stop when unused (configured in fly.toml)
- **Shared CPUs**: Using shared CPU (more cost-effective than dedicated)
- **Region**: US-based regions (iad, pdx) are typically cheapest
- **Monitor usage**: Use `fly metrics` to understand your usage patterns

## Security Best Practices

1. **Secrets Management**: Use `fly secrets` for sensitive data, not environment variables
2. **Network**: Fly.io apps are private by default; public access requires HTTPS
3. **Updates**: Keep dependencies updated regularly
4. **Monitoring**: Set up alerts for errors and performance issues

## Additional Resources

- [Fly.io Documentation](https://fly.io/docs/)
- [Fly.io Dashboard](https://fly.io/dashboard)
- [MCP Server Documentation](https://modelcontextprotocol.io/)
- [Blender Bonsai Add-on](https://github.com/gkjohnson/bonsai)

## Support

For issues related to:
- **Fly.io deployment**: Check [Fly.io community forum](https://community.fly.io)
- **MCP server**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **This repository**: Open an issue on GitHub
