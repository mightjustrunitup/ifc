import os
import tempfile
import subprocess
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json

# Use direct IFC tools (no MCP server dependency)
from ifc_tools import (
    TOOLS_MANIFEST, 
    execute_tool, 
    export_ifc as ifc_export,
    reset_model,
    get_model_info
)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(title="BlenderBIM Worker", version="4.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Legacy request model (for backward compatibility)
class GenerateRequest(BaseModel):
    python_code: str
    project_name: str = "Generated Model"

# Tool-based request model
class ToolCall(BaseModel):
    tool: str
    params: dict = {}

class ToolGenerateRequest(BaseModel):
    tool_calls: List[ToolCall]
    project_name: str = "Generated Model"

@app.get("/")
async def root():
    """Root endpoint for health check"""
    return {"service": "BlenderBIM IFC Worker", "version": "4.1.0", "status": "running"}

@app.get("/tools")
async def get_tools_simple():
    """Get available IFC tools - no MCP server required"""
    return {
        "tools": TOOLS_MANIFEST["tools"],
        "count": len(TOOLS_MANIFEST["tools"]),
        "status": "ready"
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    blender_status = "unknown"
    try:
        result = subprocess.run(["blender", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            blender_status = result.stdout.split('\n')[0]
    except:
        blender_status = "unavailable"
    
    return {
        "status": "healthy",
        "blender": blender_status,
        "ifc_tools": "ready",
        "tool_count": len(TOOLS_MANIFEST["tools"])
    }

@app.get("/mcp/tools")
async def get_tools():
    """Get available IFC tools manifest - complete schema for LLM"""
    return TOOLS_MANIFEST

@app.get("/mcp/tools-for-llm")
async def get_tools_for_llm():
    """Get tools formatted for LLM function calling - ready to paste into prompt"""
    llm_tools = []
    for tool in TOOLS_MANIFEST["tools"]:
        llm_tools.append({
            "type": "function",
            "function": {
                "name": tool.get("name"),
                "description": tool.get("description"),
                "parameters": tool.get("parameters", {})
            }
        })
    return {"tools": llm_tools, "count": len(llm_tools)}

@app.post("/mcp/execute")
async def execute_tools(request: ToolGenerateRequest, background_tasks: BackgroundTasks):
    """Execute tool calls and generate IFC file"""
    
    temp_dir = Path(tempfile.mkdtemp())
    ifc_path = temp_dir / f"{request.project_name.replace(' ', '_')}.ifc"
    
    try:
        logger.info(f"[IFC Worker] Starting IFC generation: {request.project_name}")
        logger.info(f"[IFC Worker] Tool calls: {len(request.tool_calls)}")
        
        # Reset model for fresh start
        reset_model()
        
        # Execute all tool calls
        results = []
        for i, tool_call in enumerate(request.tool_calls):
            logger.info(f"[IFC Worker] Executing tool {i+1}/{len(request.tool_calls)}: {tool_call.tool}")
            
            result = execute_tool(tool_call.tool, tool_call.params)
            results.append({"tool": tool_call.tool, "result": result})
            
            if not result.get("success", False):
                logger.error(f"[IFC Worker] Tool {tool_call.tool} failed: {result.get('error')}")
                return Response(
                    content=f"Tool execution failed: {tool_call.tool}\nError: {result.get('error', 'Unknown error')}",
                    status_code=500,
                    media_type="text/plain"
                )
            
            logger.info(f"[IFC Worker] Tool result: {result}")
        
        # Export the IFC file
        logger.info(f"[IFC Worker] Exporting IFC to: {ifc_path}")
        export_result = ifc_export(str(ifc_path))
        
        if not export_result.get("success", False):
            return Response(
                content=f"IFC export failed: {export_result.get('error', 'Unknown error')}",
                status_code=500,
                media_type="text/plain"
            )
        
        if not ifc_path.exists():
            return Response(
                content="IFC file not created after execution",
                status_code=500,
                media_type="text/plain"
            )
        
        file_size = ifc_path.stat().st_size
        model_info = get_model_info()
        
        background_tasks.add_task(cleanup_temp_dir, temp_dir)
        
        return FileResponse(
            path=str(ifc_path),
            media_type="application/x-step",
            filename=f"{request.project_name}.ifc",
            headers={
                "X-File-Size": str(file_size),
                "X-Element-Count": str(model_info.get("element_count", 0))
            }
        )
        
    except Exception as e:
        logger.exception(f"[IFC Worker] Unexpected error: {str(e)}")
        cleanup_temp_dir(temp_dir)
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}\n\n{traceback.format_exc()}"
        return Response(
            content=error_msg,
            status_code=500,
            media_type="text/plain"
        )


def wrap_code_with_safety(user_code: str, output_path: str) -> str:
    wrapper = f'''
import sys
import traceback
import numpy as np
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.geom
from blenderbim.bim.ifc import IfcStore

try:
{chr(10).join("    " + line if line.strip() else "" for line in user_code.split(chr(10)))}

    if 'ifc' not in locals():
        raise RuntimeError("Error: Variable 'ifc' not found.")

    IfcStore.file = ifc

    products = ifc.by_type("IfcProduct")
    if len(products) == 0:
        raise RuntimeError("No IFC products created.")

    print(f"✓ Success: Created {{len(products)}} IFC products")

except Exception as e:
    print(f"ERROR: {{type(e).__name__}}: {{str(e)}}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

try:
    if IfcStore.file:
        IfcStore.file.write("{output_path}")
        print(f"✓ IFC exported to: {output_path}")
    else:
        print("ERROR: IfcStore.file is empty", file=sys.stderr)
        sys.exit(1)
except Exception as export_error:
    print(f"ERROR during export: {{type(export_error).__name__}}: {{str(export_error)}}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
'''
    return wrapper


def cleanup_temp_dir(temp_dir: Path):
    try:
        import shutil
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
            logger.debug(f"[Worker] Cleaned temp: {temp_dir}")
    except Exception as e:
        logger.error(f"[Worker] Cleanup failed: {e}")


@app.post("/generate-ifc")
async def generate_ifc(request: GenerateRequest, background_tasks: BackgroundTasks):
    """Legacy endpoint - generates IFC from Python code using Blender"""

    temp_dir = Path(tempfile.mkdtemp())
    script_path = temp_dir / "generate.py"
    ifc_path = temp_dir / f"{request.project_name.replace(' ', '_')}.ifc"

    try:
        logger.info(f"[Worker] Starting IFC generation: {request.project_name}")

        wrapped = wrap_code_with_safety(request.python_code, str(ifc_path))

        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(wrapped)

        logger.info(f"[Worker] Executing Blender script: {script_path}")

        result = subprocess.run(
            [
                "blender",
                "--background",
                "--python", str(script_path),
                "--addons", "blenderbim"
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(temp_dir)
        )

        if result.stdout:
            logger.info(f"[Blender] stdout:\n{result.stdout}")
        if result.stderr:
            logger.warning(f"[Blender] stderr:\n{result.stderr}")

        # Check for Python errors in stderr even if Blender exits with code 0
        python_error_indicators = [
            "ERROR:", "TypeError", "NameError", "AttributeError", 
            "ValueError", "KeyError", "IndexError", "RuntimeError",
            "SyntaxError", "ImportError", "ModuleNotFoundError"
        ]
        
        has_python_error = any(indicator in result.stderr for indicator in python_error_indicators)
        
        if result.returncode != 0 or has_python_error:
            # Return plain text error for AI retry loop
            error_msg = f"Blender execution failed\n\nReturn code: {result.returncode}\n\n"
            error_msg += f"STDERR:\n{result.stderr}\n\n"
            error_msg += f"STDOUT:\n{result.stdout}"
            
            cleanup_temp_dir(temp_dir)
            return Response(
                content=error_msg,
                status_code=500,
                media_type="text/plain"
            )

        if not ifc_path.exists():
            cleanup_temp_dir(temp_dir)
            return Response(
                content="IFC file not created after execution",
                status_code=500,
                media_type="text/plain"
            )

        file_size = ifc_path.stat().st_size

        background_tasks.add_task(cleanup_temp_dir, temp_dir)

        return FileResponse(
            path=str(ifc_path),
            media_type="application/x-step",
            filename=f"{request.project_name}.ifc",
            headers={"X-File-Size": str(file_size)}
        )

    except subprocess.TimeoutExpired:
        logger.error("[Worker] Blender execution timeout (120s)")
        cleanup_temp_dir(temp_dir)
        return Response(
            content="Blender execution timeout (120s). Model too complex.",
            status_code=504,
            media_type="text/plain"
        )

    except Exception as e:
        logger.exception(f"[Worker] Unexpected error: {str(e)}")
        cleanup_temp_dir(temp_dir)
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}\n\n{traceback.format_exc()}"
        return Response(
            content=error_msg,
            status_code=500,
            media_type="text/plain"
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port, workers=1)
