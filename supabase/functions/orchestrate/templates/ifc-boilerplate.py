# IFC Boilerplate Template - Pre-initialized project structure
# This code is ALREADY EXECUTED. Do not recreate these elements.
import ifcopenshell
import ifcopenshell.api
import numpy as np

# File and project (ALREADY CREATED)
ifc = ifcopenshell.api.run("project.create_file", version="IFC4")
project = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcProject", name="AI Generated Project")

# Units (ALREADY CONFIGURED)
unit = ifcopenshell.api.run("unit.add_si_unit", ifc, unit_type="LENGTHUNIT", prefix="MILLI")
ifcopenshell.api.run("unit.assign_unit", ifc, units=[unit])

# Geometric contexts (ALREADY CREATED)
model_context = ifcopenshell.api.run("context.add_context", ifc, context_type="Model")
body_context = ifcopenshell.api.run("context.add_context", ifc, context_type="Model", 
                                    context_identifier="Body", target_view="MODEL_VIEW", parent=model_context)

# Spatial hierarchy (ALREADY CREATED)
site = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcSite", name="Site")
building = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcBuilding", name="Building")
storey = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcBuildingStorey", name="Ground Floor")

# Hierarchy relationships (ALREADY ESTABLISHED)
ifcopenshell.api.run("aggregate.assign_object", ifc, relating_object=project, products=[site])
ifcopenshell.api.run("aggregate.assign_object", ifc, relating_object=site, products=[building])
ifcopenshell.api.run("aggregate.assign_object", ifc, relating_object=building, products=[storey])

# ============================================================================
# START YOUR CODE BELOW THIS LINE
# ============================================================================
# Available variables:
#   - ifc: The IFC file object
#   - project: IfcProject instance
#   - model_context, body_context: Geometric representation contexts
#   - site: IfcSite instance
#   - building: IfcBuilding instance
#   - storey: IfcBuildingStorey instance (use this as relating_structure for spatial.assign_container)
#
# DO NOT:
#   - Create another project, site, building, or storey
#   - Call project.assign_declaration
#   - Call context.add_context for model/body contexts
#
# DO:
#   - Create building elements (walls, slabs, doors, windows, etc.)
#   - Add geometry to all elements
#   - Assign all elements to 'storey' using spatial.assign_container
# ============================================================================
