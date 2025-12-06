# Deployment Guide: Split Architecture (Blender Backend + MCP Server)

## Overview

The project is now split into **two separate Railway services**:

1. **blenderbim-backend** (this folder)
   - FastAPI server with Blender 4.4 + BlenderBIM addon
   - Port: 8080
   - Calls remote MCP server via HTTP

2. **ifc-bonsai-mcp-main** (subfolder)
   - Standalone MCP server (Model Context Protocol)
   - Port: 7777
   - Provides IFC/BIM tools via standard MCP protocol

## Architecture

```
┌─────────────────────────────────────────┐
│  Client/Frontend (React, TypeScript)    │
└────────────────┬────────────────────────┘
                 │
                 ↓
   ┌─────────────────────────────────┐
   │  Railway Service 1              │
   │  blenderbim-backend             │
   │  (http://...)                   │
   │  Port: 8080                     │
   │  - FastAPI                      │
   │  - Blender 4.4                  │
   │  - BlenderBIM addon             │
   └──────┬────────────────────┬─────┘
          │                    │
          │ HTTP calls         │
          │ (MCP_SERVER_URL)   │
          │                    │
          ↓                    ↓
   ┌─────────────────────────────────┐
   │  Railway Service 2              │
   │  ifc-bonsai-mcp-main            │
   │  (http://...)                   │
   │  Port: 7777                     │
   │  - MCP Server                   │
   │  - BlenderBIM tools             │
   └─────────────────────────────────┘
```

## Deployment Steps

### Step 1: Deploy blenderbim-backend Service

1. Go to **Railway Dashboard**
2. Create a **New Service** from this GitHub repo (or upload folder)
3. Select **Python** as the runtime language
4. Configure:
   - **Root Directory**: `blenderbim-backend`
   - **Port**: 8080
   - **Environment Variables**:
     ```
     MCP_SERVER_URL=http://<mcp-service-domain>:7777
     PYTHONUNBUFFERED=1
     PORT=8080
     ```
5. Set up the Docker build:
   - **Dockerfile Path**: `Dockerfile`
6. Deploy

**Note**: Replace `<mcp-service-domain>` with the actual Railway domain of the MCP service (e.g., `ifc-bonsai-mcp-production.up.railway.app`)

### Step 2: Deploy ifc-bonsai-mcp-main Service

1. Go to **Railway Dashboard**
2. Create a **New Service** from the same GitHub repo
3. Select **Python** as the runtime language
4. Configure:
   - **Root Directory**: `blenderbim-backend/ifc-bonsai-mcp-main`
   - **Port**: 7777
   - **Environment Variables**:
     ```
     PORT=7777
     PYTHONUNBUFFERED=1
     ```
5. Set up the Docker build:
   - **Dockerfile Path**: `Dockerfile`
6. Deploy

### Step 3: Connect the Services

Once both services are deployed on Railway:

1. Get the MCP service's public domain from Railway (e.g., `ifc-bonsai-mcp-production.up.railway.app`)
2. Update the blenderbim-backend service's environment variable:
   - `MCP_SERVER_URL=http://ifc-bonsai-mcp-production.up.railway.app:7777`
3. Restart the blenderbim-backend service

## API Endpoints

### blenderbim-backend (Port 8080)

```
GET  /health              - Health check
GET  /tools               - List available MCP tools (calls remote MCP server)
POST /tool/<tool_name>    - Execute a specific MCP tool
POST /execute_blender     - Execute Blender Python code
```

Example call to get tools:
```bash
curl https://<blenderbim-backend-domain>:8080/tools
```

### ifc-bonsai-mcp-main (Port 7777)

Standard MCP protocol endpoints:
```
GET  /tools/list          - List available tools
POST /tools/call          - Call a specific tool
GET  /health              - Health check (optional)
```

Example:
```bash
curl -X POST https://<mcp-server-domain>:7777/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "create_project", "arguments": {"name": "My Project"}}'
```

## Environment Variables

### blenderbim-backend
- `PORT` (default: 8080) - FastAPI server port
- `MCP_SERVER_URL` (default: http://localhost:7777) - Remote MCP server URL
- `PYTHONUNBUFFERED` (set to 1) - Unbuffered Python output for logging
- `BLENDER_EXECUTABLE` (auto-set to /opt/blender/blender)

### ifc-bonsai-mcp-main
- `PORT` (default: 7777) - MCP server port
- `PYTHONUNBUFFERED` (set to 1) - Unbuffered Python output

## Troubleshooting

### MCP Server Connection Error

If blenderbim-backend returns "Connection refused" when calling `/tools`:

1. Check that the ifc-bonsai-mcp-main service is running on Railway
2. Verify the `MCP_SERVER_URL` environment variable is correctly set
3. Test the MCP service directly:
   ```bash
   curl https://<mcp-service-domain>:7777/tools/list
   ```

### Blender Not Found

If Blender-related endpoints fail:

1. Check Railway logs for the blenderbim-backend service
2. Verify the Dockerfile is using the correct Blender installation path
3. Ensure Xvfb virtual display started successfully

### Image Size Issues

- **blenderbim-backend**: ~3.5-4 GB (Blender + FastAPI + dependencies)
- **ifc-bonsai-mcp-main**: ~800 MB - 1.2 GB (MCP server only)

Both fit within Railway's 4 GB limit per service.

## Local Development

### Running blenderbim-backend Locally

```bash
cd blenderbim-backend
export MCP_SERVER_URL=http://localhost:7777
pip install -r requirements.txt
python main.py
```

Then access: `http://localhost:8080`

### Running ifc-bonsai-mcp-main Locally

```bash
cd blenderbim-backend/ifc-bonsai-mcp-main
pip install -e .
python -m blender_mcp.server
```

Then access: `http://localhost:7777`

## Architecture Benefits

✅ **Modularity**: Blender and MCP run independently  
✅ **Scalability**: Each service can be scaled independently  
✅ **Reliability**: If one fails, the other can continue  
✅ **Easier Debugging**: Separate logs for each service  
✅ **Image Size**: Both fit under Railway's 4 GB limit  
✅ **Flexibility**: Services can be deployed to different regions/providers

## File Structure

```
blenderbim-backend/
├── Dockerfile              (Blender + FastAPI)
├── start.sh               (FastAPI startup only)
├── requirements.txt       (FastAPI dependencies)
├── main.py               (FastAPI application)
├── mcp_client.py         (HTTP client for remote MCP)
├── execute_code.py       (Blender code execution)
├── blender_generator.py  (IFC generation utilities)
└── ifc-bonsai-mcp-main/
    ├── Dockerfile         (MCP server only)
    ├── mcp_client.py      (Same as parent, for reference)
    ├── pyproject.toml     (Python project config)
    ├── uv.lock            (Dependencies lock)
    └── src/
        └── blender_mcp/
            ├── __init__.py
            ├── server.py   (MCP server entry point)
            └── ...
```

## Next Steps

1. Deploy both services to Railway
2. Update `MCP_SERVER_URL` after deployment
3. Test `/tools` endpoint on blenderbim-backend
4. Monitor logs in Railway dashboard
5. Scale services as needed

For more info on MCP protocol, see: https://modelcontextprotocol.io/
