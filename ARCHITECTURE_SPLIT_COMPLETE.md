# Architecture Split Complete ✅

## What Changed

### Backend (blenderbim-backend/)
- ✅ **Dockerfile**: Restored to include full Blender 4.4 + BlenderBIM addon
  - Downloads pre-built Blender binary (avoids compilation overhead)
  - Installs BlenderBIM addon
  - Sets up Xvfb virtual display
  - Starts only FastAPI (no MCP server)
  - Image size: ~3.5-4 GB (fits Railway 4 GB limit)

- ✅ **start.sh**: Simplified to remove MCP startup logic
  - Now only starts Xvfb, enables BlenderBIM, starts FastAPI
  - No more MCP server diagnostics or fallback logic
  - Cleaner logs for Railway

- ✅ **mcp_client.py**: Already correct
  - Reads `MCP_SERVER_URL` from environment variable
  - Default: `http://localhost:7777` (for local development)
  - Will be injected via Railway env vars at deployment

### MCP Server (blenderbim-backend/ifc-bonsai-mcp-main/)
- ✅ **Dockerfile**: Created for standalone MCP service
  - Base: Python 3.11-slim
  - Installs the ifc-bonsai-mcp package from source
  - Exposes port 7777
  - Runs `python -m blender_mcp.server`
  - Image size: ~800 MB - 1.2 GB (well under 4 GB limit)

- ✅ **mcp_client.py**: Copied from backend (for reference)
  - Same HTTP client code
  - Can be imported/referenced if needed

## Key Files Modified

| File | Status | Change |
|------|--------|--------|
| `blenderbim-backend/Dockerfile` | ✅ Updated | Restored Blender + BlenderBIM |
| `blenderbim-backend/start.sh` | ✅ Updated | Removed MCP startup logic |
| `blenderbim-backend/ifc-bonsai-mcp-main/Dockerfile` | ✅ Created | Standalone MCP service |
| `blenderbim-backend/mcp_client.py` | ✅ Correct | Already uses env var |
| `DEPLOYMENT_GUIDE_SPLIT_ARCHITECTURE.md` | ✅ Created | Complete deployment instructions |

## Deployment Strategy

### Railway Service 1: blenderbim-backend
```
GitHub Repo: <your-repo>
Root Directory: blenderbim-backend
Dockerfile: Dockerfile
Port: 8080
Environment Variables:
  - MCP_SERVER_URL=http://<mcp-service-domain>:7777
  - PYTHONUNBUFFERED=1
```

### Railway Service 2: ifc-bonsai-mcp-main
```
GitHub Repo: <your-repo>
Root Directory: blenderbim-backend/ifc-bonsai-mcp-main
Dockerfile: Dockerfile
Port: 7777
Environment Variables:
  - PORT=7777
  - PYTHONUNBUFFERED=1
```

## Image Sizes

| Service | Size | Fits Railway? |
|---------|------|---|
| blenderbim-backend | ~3.5-4 GB | ✅ Yes |
| ifc-bonsai-mcp-main | ~800 MB - 1.2 GB | ✅ Yes |
| **Total (separate services)** | ~4.3-5.2 GB | ✅ Yes |
| Old monolithic (before split) | 8.5-10 GB | ❌ No |

## Testing Locally

### Terminal 1: Start MCP Server
```bash
cd blenderbim-backend/ifc-bonsai-mcp-main
pip install -e .
python -m blender_mcp.server
# Server runs on http://localhost:7777
```

### Terminal 2: Start FastAPI Backend
```bash
cd blenderbim-backend
export MCP_SERVER_URL=http://localhost:7777
pip install -r requirements.txt
python main.py
# App runs on http://localhost:8080
```

### Terminal 3: Test API
```bash
# List available tools
curl http://localhost:8080/tools

# Health check
curl http://localhost:8080/health
```

## Next Steps

1. **Commit changes** to GitHub
   ```bash
   git add -A
   git commit -m "Architecture split: separate Blender backend and MCP server"
   git push
   ```

2. **Deploy to Railway**
   - Follow steps in `DEPLOYMENT_GUIDE_SPLIT_ARCHITECTURE.md`
   - Deploy both services
   - Update `MCP_SERVER_URL` after MCP service deployment

3. **Test endpoints**
   - Visit `/tools` endpoint
   - Monitor logs in Railway dashboard

4. **Scale if needed**
   - Each service can now scale independently
   - Blender service handles heavy computation
   - MCP service handles tool availability

## Architecture Benefits

✅ **Under Size Limit**: Both services fit within Railway's 4 GB limit  
✅ **Modularity**: Each service has a single responsibility  
✅ **Reliability**: Failure isolation (one doesn't crash the other)  
✅ **Scalability**: Services can scale independently  
✅ **Flexibility**: Easy to move services to different providers  
✅ **Debugging**: Separate logs for each service  
✅ **Maintenance**: Easier to update one service without affecting the other  

## Questions?

See `DEPLOYMENT_GUIDE_SPLIT_ARCHITECTURE.md` for:
- Detailed deployment instructions
- API endpoint documentation
- Troubleshooting guide
- Local development setup
- Architecture diagram
