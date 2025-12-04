# BlenderBIM IFC Generator Backend

Professional-grade IFC file generation using BlenderBIM and Blender's parametric modeling engine.

## Features

- 🏗️ **Professional BIM Quality**: Uses BlenderBIM for industry-standard IFC output
- 🎨 **Parametric Geometry**: Full access to Blender's modeling capabilities
- 🔧 **Rich IFC Metadata**: Proper spatial hierarchy, relationships, and properties
- 🏢 **Complex Structures**: Support for walls, slabs, doors, windows, columns, beams, roofs, stairs
- 📐 **Geometric Accuracy**: Proper topology and material layer support

## Architecture

```
AI Chat → Supabase Edge Function → BlenderBIM Docker Service → IFC File
```

## Deployment

### Railway

1. Create new project on Railway
2. Add environment variables (optional):
   ```
   PORT=8000
   ```
3. Deploy from this directory:
   ```bash
   railway up
   ```
4. Get the deployment URL (e.g., `your-app.railway.app`)
5. Add `PYTHON_BACKEND_URL` secret in Supabase:
   ```
   your-app.railway.app
   ```

### Render

1. Create new Web Service
2. Select "Docker" as environment
3. Set Docker build path to `blenderbim-backend/Dockerfile`
4. Deploy and get URL
5. Add URL to Supabase secrets as `PYTHON_BACKEND_URL`

## Local Development

### Requirements
- Docker installed
- 4GB+ RAM recommended
- Linux/macOS (Windows with WSL2)

### Build and Run

```bash
# Build Docker image
docker build -t blenderbim-backend .

# Run locally
docker run -p 8000:8000 blenderbim-backend

# Test health endpoint
curl http://localhost:8000/health
```

## API Usage

### POST /generate-ifc

Generate IFC file from tool calls.

**Request:**
```json
{
  "project_name": "My Building",
  "tool_calls": [
    {
      "function": "create_wall",
      "params": {
        "length": 5000,
        "height": 3000,
        "thickness": 200,
        "x": 0,
        "y": 0,
        "z": 0
      }
    }
  ]
}
```

**Response:** Binary IFC file

### GET /health

Check service health and Blender version.

## Supported Elements

- `create_wall` - Structural walls with proper IFC classification
- `create_slab` - Floor and ceiling slabs
- `create_door` - Doors with openings
- `create_window` - Windows with frames
- `create_column` - Structural columns
- `create_beam` - Structural beams
- `create_roof` - Roof structures
- `create_stairs` - Staircases with parametric steps

## Technical Details

- **Blender Version**: 4.0.2
- **BlenderBIM Addon**: Latest stable
- **IFC Schema**: IFC4
- **Processing Time**: 30s - 2min per model
- **Memory Usage**: 1-4GB
- **Docker Image Size**: ~2.5GB

## Adding New Elements

To add new building elements:

1. Add handler function in `blender_generator.py`:
```python
def create_my_element(params: dict):
    # Create geometry using bpy.ops
    # Assign IFC class using bpy.ops.bim.assign_class
    return obj
```

2. Register in `ELEMENT_HANDLERS`:
```python
ELEMENT_HANDLERS = {
    'create_my_element': create_my_element,
}
```

## Troubleshooting

### Blender not found
- Ensure Blender is installed in Docker image
- Check PATH includes `/usr/local/bin/blender`

### BlenderBIM addon not loaded
- Verify addon installation in Docker build
- Check Blender user preferences include addon path

### IFC file not generated
- Check Blender console output
- Verify sufficient disk space
- Ensure proper IFC export permissions

## Performance

- Small models (1-10 elements): 30-60s
- Medium models (10-50 elements): 1-2min
- Large models (50+ elements): 2-5min

## Limitations

- Headless only (no GUI)
- Linux container required
- Increased deployment size vs basic FastAPI

## Next Steps

To further enhance:
- Add MEP elements (HVAC, plumbing, electrical)
- Implement material layers and finishes
- Add parametric building templates
- Support curved geometry and complex shapes
- Integration with Speckle or other BIM platforms
