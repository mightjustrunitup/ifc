"""
Direct IFC tools implementation using IfcOpenShell.
These tools bypass the MCP server and work directly with IFC files.
"""
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.util.element
import uuid
import os
import tempfile
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Global IFC model for session
_current_model = None

def get_model():
    """Get the current IFC model, creating one if needed"""
    global _current_model
    if _current_model is None:
        _current_model = ifcopenshell.file(schema="IFC4")
    return _current_model

def reset_model():
    """Reset/clear the current model"""
    global _current_model
    _current_model = ifcopenshell.file(schema="IFC4")
    return _current_model

def create_project(name: str = "My Project") -> Dict[str, Any]:
    """Create a new IFC project with required structure"""
    model = reset_model()
    
    # Create project
    project = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name=name)
    
    # Create units
    ifcopenshell.api.run("unit.assign_unit", model)
    
    # Create context
    context = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body_context = ifcopenshell.api.run(
        "context.add_context", model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=context
    )
    
    # Create site
    site = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSite", name="Site")
    ifcopenshell.api.run("aggregate.assign_object", model, products=[site], relating_object=project)
    
    # Create building
    building = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuilding", name="Building")
    ifcopenshell.api.run("aggregate.assign_object", model, products=[building], relating_object=site)
    
    # Create storey
    storey = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuildingStorey", name="Ground Floor")
    ifcopenshell.api.run("aggregate.assign_object", model, products=[storey], relating_object=building)
    
    return {
        "success": True,
        "project_id": str(project.id()),
        "project_name": name,
        "site_id": str(site.id()),
        "building_id": str(building.id()),
        "storey_id": str(storey.id())
    }

def add_wall(
    start: List[float],
    end: List[float],
    height: float = 3.0,
    thickness: float = 0.2
) -> Dict[str, Any]:
    """Add a wall to the current model"""
    model = get_model()
    
    # Get or create storey
    storeys = model.by_type("IfcBuildingStorey")
    if not storeys:
        create_project("Auto Project")
        storeys = model.by_type("IfcBuildingStorey")
    storey = storeys[0]
    
    # Get body context
    contexts = [c for c in model.by_type("IfcGeometricRepresentationSubContext") 
                if c.ContextIdentifier == "Body"]
    if not contexts:
        contexts = model.by_type("IfcGeometricRepresentationContext")
    context = contexts[0] if contexts else None
    
    # Create wall
    wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")
    
    # Calculate wall length and direction
    import math
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.sqrt(dx*dx + dy*dy)
    
    # Create profile
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=length,
        YDim=thickness
    )
    
    # Create extrusion
    direction = model.create_entity("IfcDirection", DirectionRatios=[0.0, 0.0, 1.0])
    extrusion = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        ExtrudedDirection=direction,
        Depth=height
    )
    
    # Create shape representation
    if context:
        shape = model.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=context,
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[extrusion]
        )
        
        product_shape = model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[shape]
        )
        wall.Representation = product_shape
    
    # Set wall placement
    angle = math.atan2(dy, dx)
    origin = model.create_entity("IfcCartesianPoint", Coordinates=(start[0], start[1], 0.0))
    z_dir = model.create_entity("IfcDirection", DirectionRatios=[0.0, 0.0, 1.0])
    x_dir = model.create_entity("IfcDirection", DirectionRatios=[math.cos(angle), math.sin(angle), 0.0])
    
    axis_placement = model.create_entity(
        "IfcAxis2Placement3D",
        Location=origin,
        Axis=z_dir,
        RefDirection=x_dir
    )
    local_placement = model.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=axis_placement
    )
    wall.ObjectPlacement = local_placement
    
    # Assign to storey
    ifcopenshell.api.run("spatial.assign_container", model, products=[wall], relating_structure=storey)
    
    return {
        "success": True,
        "wall_id": str(wall.id()),
        "global_id": wall.GlobalId,
        "length": length,
        "height": height,
        "thickness": thickness
    }

def add_slab(
    vertices: List[List[float]],
    thickness: float = 0.3
) -> Dict[str, Any]:
    """Add a floor slab defined by vertices"""
    model = get_model()
    
    # Get storey
    storeys = model.by_type("IfcBuildingStorey")
    if not storeys:
        create_project("Auto Project")
        storeys = model.by_type("IfcBuildingStorey")
    storey = storeys[0]
    
    # Create slab
    slab = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSlab")
    
    # Create polyline profile from vertices
    points = [model.create_entity("IfcCartesianPoint", Coordinates=(v[0], v[1])) for v in vertices]
    points.append(points[0])  # Close the loop
    
    polyline = model.create_entity("IfcPolyline", Points=points)
    profile = model.create_entity(
        "IfcArbitraryClosedProfileDef",
        ProfileType="AREA",
        OuterCurve=polyline
    )
    
    # Create extrusion
    direction = model.create_entity("IfcDirection", DirectionRatios=[0.0, 0.0, 1.0])
    extrusion = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        ExtrudedDirection=direction,
        Depth=thickness
    )
    
    # Get context and create representation
    contexts = model.by_type("IfcGeometricRepresentationContext")
    if contexts:
        shape = model.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=contexts[0],
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[extrusion]
        )
        product_shape = model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[shape]
        )
        slab.Representation = product_shape
    
    # Assign to storey
    ifcopenshell.api.run("spatial.assign_container", model, products=[slab], relating_structure=storey)
    
    return {
        "success": True,
        "slab_id": str(slab.id()),
        "global_id": slab.GlobalId,
        "thickness": thickness
    }

def add_column(
    location: List[float],
    height: float = 3.0,
    width: float = 0.3,
    depth: float = 0.3
) -> Dict[str, Any]:
    """Add a column at the specified location"""
    model = get_model()
    
    # Get storey
    storeys = model.by_type("IfcBuildingStorey")
    if not storeys:
        create_project("Auto Project")
        storeys = model.by_type("IfcBuildingStorey")
    storey = storeys[0]
    
    # Create column
    column = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcColumn")
    
    # Create rectangular profile
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=width,
        YDim=depth
    )
    
    # Create extrusion
    direction = model.create_entity("IfcDirection", DirectionRatios=[0.0, 0.0, 1.0])
    extrusion = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        ExtrudedDirection=direction,
        Depth=height
    )
    
    # Get context and create representation
    contexts = model.by_type("IfcGeometricRepresentationContext")
    if contexts:
        shape = model.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=contexts[0],
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[extrusion]
        )
        product_shape = model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[shape]
        )
        column.Representation = product_shape
    
    # Set placement
    origin = model.create_entity("IfcCartesianPoint", Coordinates=tuple(location))
    axis_placement = model.create_entity("IfcAxis2Placement3D", Location=origin)
    local_placement = model.create_entity("IfcLocalPlacement", RelativePlacement=axis_placement)
    column.ObjectPlacement = local_placement
    
    # Assign to storey
    ifcopenshell.api.run("spatial.assign_container", model, products=[column], relating_structure=storey)
    
    return {
        "success": True,
        "column_id": str(column.id()),
        "global_id": column.GlobalId,
        "height": height
    }

def add_beam(
    start: List[float],
    end: List[float],
    width: float = 0.2,
    height: float = 0.4
) -> Dict[str, Any]:
    """Add a beam between two points"""
    model = get_model()
    import math
    
    # Get storey
    storeys = model.by_type("IfcBuildingStorey")
    if not storeys:
        create_project("Auto Project")
        storeys = model.by_type("IfcBuildingStorey")
    storey = storeys[0]
    
    # Create beam
    beam = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBeam")
    
    # Calculate length
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    dz = end[2] - start[2] if len(end) > 2 and len(start) > 2 else 0
    length = math.sqrt(dx*dx + dy*dy + dz*dz)
    
    # Create I-profile for beam
    profile = model.create_entity(
        "IfcRectangleProfileDef",
        ProfileType="AREA",
        XDim=width,
        YDim=height
    )
    
    # Create extrusion along X axis (beam axis)
    direction = model.create_entity("IfcDirection", DirectionRatios=[1.0, 0.0, 0.0])
    extrusion = model.create_entity(
        "IfcExtrudedAreaSolid",
        SweptArea=profile,
        ExtrudedDirection=direction,
        Depth=length
    )
    
    # Get context and create representation
    contexts = model.by_type("IfcGeometricRepresentationContext")
    if contexts:
        shape = model.create_entity(
            "IfcShapeRepresentation",
            ContextOfItems=contexts[0],
            RepresentationIdentifier="Body",
            RepresentationType="SweptSolid",
            Items=[extrusion]
        )
        product_shape = model.create_entity(
            "IfcProductDefinitionShape",
            Representations=[shape]
        )
        beam.Representation = product_shape
    
    # Set placement with rotation to align with direction
    angle = math.atan2(dy, dx)
    origin = model.create_entity("IfcCartesianPoint", Coordinates=(start[0], start[1], start[2] if len(start) > 2 else 0))
    z_dir = model.create_entity("IfcDirection", DirectionRatios=[0.0, 0.0, 1.0])
    x_dir = model.create_entity("IfcDirection", DirectionRatios=[math.cos(angle), math.sin(angle), 0.0])
    
    axis_placement = model.create_entity(
        "IfcAxis2Placement3D",
        Location=origin,
        Axis=z_dir,
        RefDirection=x_dir
    )
    local_placement = model.create_entity("IfcLocalPlacement", RelativePlacement=axis_placement)
    beam.ObjectPlacement = local_placement
    
    # Assign to storey
    ifcopenshell.api.run("spatial.assign_container", model, products=[beam], relating_structure=storey)
    
    return {
        "success": True,
        "beam_id": str(beam.id()),
        "global_id": beam.GlobalId,
        "length": length
    }

def export_ifc(output_path: Optional[str] = None) -> Dict[str, Any]:
    """Export the current model to an IFC file"""
    model = get_model()
    
    if output_path is None:
        output_path = os.path.join(tempfile.gettempdir(), f"model_{uuid.uuid4().hex[:8]}.ifc")
    
    model.write(output_path)
    
    return {
        "success": True,
        "path": output_path,
        "element_count": len(list(model))
    }

def get_model_info() -> Dict[str, Any]:
    """Get information about the current model"""
    model = get_model()
    
    return {
        "schema": model.schema,
        "element_count": len(list(model)),
        "walls": len(model.by_type("IfcWall")),
        "slabs": len(model.by_type("IfcSlab")),
        "columns": len(model.by_type("IfcColumn")),
        "beams": len(model.by_type("IfcBeam")),
        "projects": len(model.by_type("IfcProject")),
        "buildings": len(model.by_type("IfcBuilding")),
        "storeys": len(model.by_type("IfcBuildingStorey"))
    }

# Tool definitions for LLM consumption
TOOLS_MANIFEST = {
    "tools": [
        {
            "name": "create_project",
            "description": "Create a new IFC project with site, building, and storey structure",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Project name", "default": "My Project"}
                }
            }
        },
        {
            "name": "add_wall",
            "description": "Add a wall between two points",
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {"type": "array", "items": {"type": "number"}, "description": "[x, y] start point"},
                    "end": {"type": "array", "items": {"type": "number"}, "description": "[x, y] end point"},
                    "height": {"type": "number", "description": "Wall height in meters", "default": 3.0},
                    "thickness": {"type": "number", "description": "Wall thickness in meters", "default": 0.2}
                },
                "required": ["start", "end"]
            }
        },
        {
            "name": "add_slab",
            "description": "Add a floor slab defined by boundary vertices",
            "parameters": {
                "type": "object",
                "properties": {
                    "vertices": {"type": "array", "items": {"type": "array"}, "description": "List of [x, y] vertices"},
                    "thickness": {"type": "number", "description": "Slab thickness in meters", "default": 0.3}
                },
                "required": ["vertices"]
            }
        },
        {
            "name": "add_column",
            "description": "Add a structural column",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "array", "items": {"type": "number"}, "description": "[x, y, z] location"},
                    "height": {"type": "number", "description": "Column height", "default": 3.0},
                    "width": {"type": "number", "description": "Column width", "default": 0.3},
                    "depth": {"type": "number", "description": "Column depth", "default": 0.3}
                },
                "required": ["location"]
            }
        },
        {
            "name": "add_beam",
            "description": "Add a structural beam between two points",
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {"type": "array", "items": {"type": "number"}, "description": "[x, y, z] start point"},
                    "end": {"type": "array", "items": {"type": "number"}, "description": "[x, y, z] end point"},
                    "width": {"type": "number", "description": "Beam width", "default": 0.2},
                    "height": {"type": "number", "description": "Beam height", "default": 0.4}
                },
                "required": ["start", "end"]
            }
        },
        {
            "name": "export_ifc",
            "description": "Export the current model to an IFC file",
            "parameters": {
                "type": "object",
                "properties": {
                    "output_path": {"type": "string", "description": "Output file path (optional)"}
                }
            }
        },
        {
            "name": "get_model_info",
            "description": "Get information about the current model",
            "parameters": {"type": "object", "properties": {}}
        }
    ]
}

def execute_tool(tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool by name with given parameters"""
    tool_map = {
        "create_project": create_project,
        "add_wall": add_wall,
        "add_slab": add_slab,
        "add_column": add_column,
        "add_beam": add_beam,
        "export_ifc": export_ifc,
        "get_model_info": get_model_info
    }
    
    if tool_name not in tool_map:
        return {"success": False, "error": f"Unknown tool: {tool_name}"}
    
    try:
        return tool_map[tool_name](**params)
    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return {"success": False, "error": str(e)}
