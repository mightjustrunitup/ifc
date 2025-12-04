# 📚 Complete IFCOpenShell + BlenderBIM Toolset Reference

**Version**: IFCOpenShell 0.8.x + BlenderBIM 240115  
**Purpose**: Authoritative API reference for code generation LLMs  
**Status**: Production-ready, version-locked to prevent hallucinations

---

## 📖 Table of Contents

1. [Project Management](#1-project-management)
2. [Entity Creation](#2-entity-creation)
3. [Spatial Hierarchy](#3-spatial-hierarchy)
4. [Geometry Representation](#4-geometry-representation)
5. [Material Definition](#5-material-definition)
6. [Property Sets](#6-property-sets)
7. [Type & Profile Management](#7-type--profile-management)
8. [Units & Coordinates](#8-units--coordinates)
9. [Common Patterns & Examples](#9-common-patterns--examples)
10. [Error Prevention](#10-error-prevention)

---

## 1. Project Management

### **1.1 Create IFC File**

**Function**: `ifcopenshell.api.run('project.create_file', ifc=None, version='IFC4')`

**Parameters**:
- `ifc` (ifcopenshell.file, optional): Existing file to modify, or None for new
- `version` (str): IFC version, one of:
  - `'IFC2X3'` – Legacy, not recommended
  - `'IFC4'` – Standard, recommended for most projects
  - `'IFC4X3'` – Latest, experimental features

**Returns**: `ifcopenshell.file` object

**Example**:
```python
ifc = ifcopenshell.api.run('project.create_file', version='IFC4')
```

**Critical Notes**:
- Must be first call in code
- Creates empty project structure
- Result assigned to variable `ifc` (used throughout code)

---

## 2. Entity Creation

### **2.1 Create Any IFC Entity**

**Function**: `ifcopenshell.api.run('root.create_entity', ifc, ifc_class, name=None)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `ifc_class` (str): IFC class name, must be exact (case-sensitive)
- `name` (str, optional): Human-readable name

**Allowed IFC Classes**:

#### **Spatial Structure**
- `IfcProject` – Top-level container for entire design
- `IfcSite` – Site/campus level
- `IfcBuilding` – Building entity
- `IfcBuildingStorey` – Floor/level
- `IfcSpace` – Interior space (room)

#### **Structural Elements**
- `IfcWall` – Wall (load-bearing or partition)
- `IfcColumn` – Vertical structural member
- `IfcBeam` – Horizontal structural member
- `IfcSlab` – Floor/ceiling/roof slab
- `IfcFooting` – Foundation element
- `IfcPile` – Pile foundation
- `IfcRoof` – Roof structure

#### **Non-Structural Elements**
- `IfcDoor` – Door opening/element
- `IfcWindow` – Window opening/element
- `IfcStairs` – Staircase
- `IfcRamp` – Ramp or slope
- `IfcRailing` – Railing or guardrail
- `IfcCovering` – Ceiling, floor covering, paint
- `IfcBuildingElementProxy` – Generic element (fallback)

**Returns**: IFC entity object

**Examples**:
```python
# Create spatial hierarchy
project = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcProject', name='Building Project')
site = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSite', name='Site A')
building = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuilding', name='Main Building')
storey = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuildingStorey', name='Ground Floor')

# Create building elements
wall = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcWall', name='Wall 1')
column = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcColumn', name='Column A1')
beam = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBeam', name='Beam B1')
slab = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSlab', name='Floor Slab')
```

---

## 3. Spatial Hierarchy

### **3.1 Assign Container (Parent-Child for Spatial Structure)**

**Function**: `ifcopenshell.api.run('aggregate.assign_object', ifc, product, relating_object)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `product` (IFC entity): The child entity (Site, Building, or Storey)
- `relating_object` (IFC entity): The parent entity (Project, Site, or Building)

**Usage**:
- `product=Site, relating_object=Project`
- `product=Building, relating_object=Site`
- `product=Storey, relating_object=Building`

**Returns**: IFC entity (the product)

**Example**:
```python
# Build spatial hierarchy: Project → Site → Building → Storey
ifcopenshell.api.run('aggregate.assign_object', ifc, product=site, relating_object=project)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=building, relating_object=site)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=storey, relating_object=building)
```

**⚠️ Critical Mistakes**:
- ❌ Using `product=building, relating_object=project` (wrong hierarchy direction)
- ❌ Using for building elements (walls, columns) – use `spatial.assign_container` instead
- ❌ Parameter name `relating_object` is NOT `parent` or `container`

---

### **3.2 Assign Container (Building Elements to Storey)**

**Function**: `ifcopenshell.api.run('spatial.assign_container', ifc, product, relating_structure)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `product` (IFC entity): The building element (wall, column, door, etc.)
- `relating_structure` (IFC entity): The containing storey (IfcBuildingStorey)

**Usage**:
- Only for building elements: IfcWall, IfcColumn, IfcBeam, IfcSlab, IfcDoor, IfcWindow, IfcStairs, IfcRamp, IfcRailing
- Container must be IfcBuildingStorey (never Project, Site, or Building)

**Returns**: None (modifies entity in place)

**Example**:
```python
# Assign all elements on ground floor to storey
ifcopenshell.api.run('spatial.assign_container', ifc, product=wall_1, relating_structure=storey)
ifcopenshell.api.run('spatial.assign_container', ifc, product=column_a1, relating_structure=storey)
ifcopenshell.api.run('spatial.assign_container', ifc, product=beam_1, relating_structure=storey)
ifcopenshell.api.run('spatial.assign_container', ifc, product=slab, relating_structure=storey)
```

**⚠️ Critical Mistakes**:
- ❌ Using `product=` instead of `products=` (single vs plural – use singular)
- ❌ Assigning to Building directly (must use intermediate Storey)
- ❌ Parameter is `relating_structure=` not `container=`
- ❌ Using for spatial hierarchy (Project, Site, Building) – use `aggregate.assign_object` instead

---

## 4. Geometry Representation

### **4.1 Add Geometric Representation Context**

**Function**: `ifcopenshell.api.run('context.add_context', ifc, context_type='Model')`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `context_type` (str): Type of representation context:
  - `'Model'` – 3D geometry context (recommended)
  - `'Plan'` – 2D plan view (optional)

**Returns**: `IfcGeometricRepresentationContext` object

**Example**:
```python
context = ifcopenshell.api.run('context.add_context', ifc, context_type='Model')
```

**⚠️ Critical Mistakes**:
- ❌ Using `name=` parameter (not allowed – removed in 0.8.x)
- ❌ Forgetting to save result to variable (needed for geometry calls)

---

### **4.2 Add Wall Geometry**

**Function**: `ifcopenshell.api.run('geometry.add_wall_representation', ifc, context, wall, height, width, length)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `context` (IfcGeometricRepresentationContext): From `context.add_context`
- `wall` (IfcWall entity): The wall to add geometry to
- `height` (float): Wall height in meters (typically 2.7–3.0 for residential)
- `width` (float): Wall thickness in meters (typically 0.2 for exterior, 0.12 for interior)
- `length` (float): Wall length in meters

**Returns**: `IfcShapeRepresentation` object

**Example**:
```python
# Add geometry to 5m long × 0.2m thick × 3m tall wall
ifcopenshell.api.run(
    'geometry.add_wall_representation',
    ifc,
    context=context,
    wall=wall_1,
    height=3.0,      # 3 meters tall
    width=0.2,       # 0.2 meters (200mm) thick
    length=5.0       # 5 meters long
)
```

**Units**: All dimensions in **meters** (not millimeters)

---

### **4.3 Add Column/Beam Profile Geometry**

**Function**: `ifcopenshell.api.run('geometry.add_profile', ifc, context, product, depth, width, height)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `context` (IfcGeometricRepresentationContext): From `context.add_context`
- `product` (IFC entity): Column, Beam, or similar
- `depth` (float): Profile depth (into page) in meters
- `width` (float): Profile width (left-right) in meters
- `height` (float): Extrusion height (for columns: total height; for beams: span length) in meters

**Returns**: `IfcShapeRepresentation` object

**Example**:
```python
# Add square column: 0.3m × 0.3m cross-section, 3.5m tall
ifcopenshell.api.run(
    'geometry.add_profile',
    ifc,
    context=context,
    product=column_a1,
    depth=0.3,      # 0.3m deep
    width=0.3,      # 0.3m wide
    height=3.5      # 3.5m tall
)

# Add beam: 0.3m wide × 0.5m deep, 6m span
ifcopenshell.api.run(
    'geometry.add_profile',
    ifc,
    context=context,
    product=beam_1,
    depth=0.5,      # 0.5m beam depth
    width=0.3,      # 0.3m beam width
    height=6.0      # 6m span length
)
```

**Typical Dimensions**:
- **Column**: 0.3m × 0.3m to 0.4m × 0.4m
- **Beam**: width 0.3m, depth 0.4–0.6m (depth-to-span ratio ~1:12 to 1:15)
- **Slab**: thickness 0.15–0.25m

---

### **4.4 Position Element in 3D Space**

**Function**: `ifcopenshell.api.run('geometry.edit_object_placement', ifc, product, matrix)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `product` (IFC entity): The element to position
- `matrix` (numpy 4×4 array): Transformation matrix

**Matrix Format**:
```
[[R00, R01, R02,   X],    # X-axis + X translation
 [R10, R11, R12,   Y],    # Y-axis + Y translation
 [R20, R21, R22,   Z],    # Z-axis + Z translation
 [  0,   0,   0,   1]]    # Homogeneous coordinate
```

For **no rotation** (simple translation):
```python
import numpy as np

matrix = np.eye(4)           # Identity matrix
matrix[0, 3] = x_position    # X translation
matrix[1, 3] = y_position    # Y translation
matrix[2, 3] = z_position    # Z translation
```

**Example**:
```python
import numpy as np

# Position wall at (0, 0, 0)
matrix = np.eye(4)
matrix[0, 3] = 0.0
matrix[1, 3] = 0.0
matrix[2, 3] = 0.0
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=wall_1, matrix=matrix)

# Position column at (5, 10, 0)
matrix = np.eye(4)
matrix[0, 3] = 5.0
matrix[1, 3] = 10.0
matrix[2, 3] = 0.0
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=column_a1, matrix=matrix)

# Position second floor slab at (0, 0, 3.5) – above first floor
matrix = np.eye(4)
matrix[0, 3] = 0.0
matrix[1, 3] = 0.0
matrix[2, 3] = 3.5  # Height of first storey
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=slab_floor_2, matrix=matrix)
```

**⚠️ Common Issues**:
- ❌ Forgetting numpy import
- ❌ Using lists instead of numpy arrays
- ❌ Z-position (height) set to 0 for upper floors (should accumulate storey heights)

---

## 5. Material Definition

### **5.1 Create Material**

**Function**: `ifcopenshell.api.run('material.add_material', ifc, name)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `name` (str): Material name (e.g., 'Concrete C30/37', 'Steel S355', 'Brick')

**Returns**: `IfcMaterial` entity

**Example**:
```python
concrete = ifcopenshell.api.run('material.add_material', ifc, name='Concrete C30/37')
steel = ifcopenshell.api.run('material.add_material', ifc, name='Steel S355')
brick = ifcopenshell.api.run('material.add_material', ifc, name='Facing Brick')
```

**Standard Material Names**:
- **Concrete**: `'Concrete C20/25'`, `'Concrete C30/37'`, `'Concrete C50/60'`
- **Steel**: `'Steel S235'`, `'Steel S355'`, `'Steel S450'`
- **Masonry**: `'Brick'`, `'Concrete Block'`, `'Stone'`
- **Other**: `'Timber'`, `'Glass'`, `'Plaster'`

---

### **5.2 Assign Material to Element(s)**

**Function**: `ifcopenshell.api.run('material.assign_material', ifc, products, material)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `products` (IFC entity or list): Single element or list of elements
- `material` (IfcMaterial): Material from `material.add_material`

**Returns**: `IfcMaterialAssociation`

**Example**:
```python
# Assign concrete to single wall
ifcopenshell.api.run('material.assign_material', ifc, products=wall_1, material=concrete)

# Assign concrete to multiple elements
ifcopenshell.api.run('material.assign_material', ifc, products=[column_a1, column_a2, column_b1], material=concrete)

# Assign steel to beams
ifcopenshell.api.run('material.assign_material', ifc, products=[beam_1, beam_2], material=steel)
```

---

## 6. Property Sets

### **6.1 Add Property Set to Element**

**Function**: `ifcopenshell.api.run('pset.add_pset', ifc, product, name)`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `product` (IFC entity): Element to add properties to
- `name` (str): Property set name (e.g., `'Pset_WallCommon'`, `'Pset_ColumnCommon'`)

**Returns**: `IfcPropertySet` entity

**Standard Property Set Names**:
- `'Pset_WallCommon'` – For walls
- `'Pset_ColumnCommon'` – For columns
- `'Pset_BeamCommon'` – For beams
- `'Pset_SlabCommon'` – For slabs
- `'Pset_DoorCommon'` – For doors
- `'Pset_WindowCommon'` – For windows

**Example**:
```python
wall_pset = ifcopenshell.api.run('pset.add_pset', ifc, product=wall_1, name='Pset_WallCommon')
column_pset = ifcopenshell.api.run('pset.add_pset', ifc, product=column_a1, name='Pset_ColumnCommon')
```

---

## 7. Type & Profile Management

### **7.1 Create Building Element Type**

**Function**: `ifcopenshell.api.run('type.add_type', ifc, name, ifc_class='IfcWallType')`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `name` (str): Type name (e.g., 'Exterior Wall Type', 'Standard Column')
- `ifc_class` (str): Type class:
  - `'IfcWallType'` – Wall type
  - `'IfcColumnType'` – Column type
  - `'IfcBeamType'` – Beam type
  - `'IfcSlabType'` – Slab type
  - `'IfcDoorType'` – Door type
  - `'IfcWindowType'` – Window type

**Returns**: IFC type entity

**Example**:
```python
wall_type = ifcopenshell.api.run('type.add_type', ifc, name='Exterior Wall', ifc_class='IfcWallType')
column_type = ifcopenshell.api.run('type.add_type', ifc, name='Standard Column', ifc_class='IfcColumnType')
```

---

## 8. Units & Coordinates

### **8.1 Add Project Units**

**Function**: `ifcopenshell.api.run('unit.add_si_unit', ifc, unit_type='LENGTHUNIT', prefix='MILLI')`

**Parameters**:
- `ifc` (ifcopenshell.file): The IFC file
- `unit_type` (str): Type of unit (typically `'LENGTHUNIT'`)
- `prefix` (str): Scale prefix:
  - `'MILLI'` – Millimeters (0.001 m)
  - `'CENTI'` – Centimeters (0.01 m)
  - `'DECI'` – Decimeters (0.1 m)
  - `None` – Meters (default)

**Example**:
```python
# Set project units to millimeters
ifcopenshell.api.run('unit.add_si_unit', ifc, unit_type='LENGTHUNIT', prefix='MILLI')
```

**Note**: BlenderBIM typically works in meters; conversion is handled by the API.

---

## 9. Common Patterns & Examples

### **9.1 Complete Minimal House (2 Floors)**

```python
import numpy as np
import ifcopenshell
import ifcopenshell.api

# 1. Create file and hierarchy
ifc = ifcopenshell.api.run('project.create_file', version='IFC4')
project = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcProject', name='House')
site = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSite', name='Site')
building = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuilding', name='Building')

# 2. Create storeys
ground_floor = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuildingStorey', name='Ground Floor')
first_floor = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuildingStorey', name='First Floor')

# 3. Assign spatial hierarchy
ifcopenshell.api.run('aggregate.assign_object', ifc, product=site, relating_object=project)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=building, relating_object=site)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=ground_floor, relating_object=building)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=first_floor, relating_object=building)

# 4. Create context
context = ifcopenshell.api.run('context.add_context', ifc, context_type='Model')

# 5. Create materials
concrete = ifcopenshell.api.run('material.add_material', ifc, name='Concrete C30/37')

# 6. Create ground floor elements
wall_front = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcWall', name='Front Wall')
ifcopenshell.api.run('spatial.assign_container', ifc, product=wall_front, relating_structure=ground_floor)
ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=wall_front, height=3.0, width=0.2, length=10.0)
matrix = np.eye(4); matrix[0,3]=0; matrix[1,3]=0; matrix[2,3]=0
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=wall_front, matrix=matrix)
ifcopenshell.api.run('material.assign_material', ifc, products=wall_front, material=concrete)

wall_back = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcWall', name='Back Wall')
ifcopenshell.api.run('spatial.assign_container', ifc, product=wall_back, relating_structure=ground_floor)
ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=wall_back, height=3.0, width=0.2, length=10.0)
matrix = np.eye(4); matrix[0,3]=0; matrix[1,3]=8; matrix[2,3]=0
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=wall_back, matrix=matrix)
ifcopenshell.api.run('material.assign_material', ifc, products=wall_back, material=concrete)

slab_ground = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSlab', name='Ground Slab')
ifcopenshell.api.run('spatial.assign_container', ifc, product=slab_ground, relating_structure=ground_floor)
ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=slab_ground, height=0.2, width=10.0, length=8.0)
matrix = np.eye(4); matrix[2,3]=0
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=slab_ground, matrix=matrix)
ifcopenshell.api.run('material.assign_material', ifc, products=slab_ground, material=concrete)

# 7. Create first floor elements (above ground floor)
slab_first = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSlab', name='First Slab')
ifcopenshell.api.run('spatial.assign_container', ifc, product=slab_first, relating_structure=first_floor)
ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=slab_first, height=0.2, width=10.0, length=8.0)
matrix = np.eye(4); matrix[2,3]=3.0  # Above first storey height
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=slab_first, matrix=matrix)
ifcopenshell.api.run('material.assign_material', ifc, products=slab_first, material=concrete)

# Done! (wrapper exports to IFC file)
```

---

### **9.2 Column Grid (3×3 Columns)**

```python
import numpy as np

# Create 3×3 column grid (6m spacing)
column_positions = [
    (0, 0), (6, 0), (12, 0),
    (0, 6), (6, 6), (12, 6),
    (0, 12), (6, 12), (12, 12)
]

for i, (x, y) in enumerate(column_positions):
    col = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcColumn', name=f'Column {i+1}')
    ifcopenshell.api.run('spatial.assign_container', ifc, product=col, relating_structure=storey)
    ifcopenshell.api.run('geometry.add_profile', ifc, context=context, product=col, depth=0.3, width=0.3, height=3.5)
    
    matrix = np.eye(4)
    matrix[0, 3] = x
    matrix[1, 3] = y
    matrix[2, 3] = 0
    ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=col, matrix=matrix)
```

---

## 10. Error Prevention

### **❌ Common Mistakes & ✅ Fixes**

| Error | Cause | Fix |
|-------|-------|-----|
| `AttributeError: 'NoneType' object` | Forgot to assign result to variable | `context = ifcopenshell.api.run('context.add_context', ...)` |
| `KeyError: 'relating_structure'` | Wrong parameter name | Use `relating_structure=` not `container=` |
| `TypeError: unsupported operand` | Using list instead of numpy array for matrix | `matrix = np.eye(4); matrix[0,3] = x` |
| `Variable 'ifc' not defined` | Didn't create IFC file first | Start code with `ifc = ifcopenshell.api.run('project.create_file', ...)` |
| `No IFC products created` | Elements not assigned to storey | Always call `spatial.assign_container` for each element |
| `Geometry not visible` | Missing geometry representation | Call `add_wall_representation` or `add_profile` for each element |
| `Z-position wrong for upper floors` | Using Z=0 for all floors | Accumulate heights: `z = floor_1_height + floor_2_height + ...` |
| `Cannot find parameter 'products='` | Using wrong parameter name | Use `product=` (singular) not `products=` (plural) |

### **✅ Checklist for Every Generated Code**

- [ ] Starts with `ifc = ifcopenshell.api.run('project.create_file', ...)`
- [ ] Creates Project, Site, Building entities
- [ ] Creates at least one BuildingStorey
- [ ] Assigns spatial hierarchy: Project→Site, Site→Building, Building→Storey
- [ ] Every building element calls `spatial.assign_container` with correct storey
- [ ] Context created: `context = ifcopenshell.api.run('context.add_context', ...)`
- [ ] Every element has geometry: `add_wall_representation` or `add_profile`
- [ ] Every element has position: `geometry.edit_object_placement` with numpy matrix
- [ ] No imports besides `numpy`, `ifcopenshell`, `ifcopenshell.api`
- [ ] No try/except blocks
- [ ] No file I/O (open, write, read)
- [ ] No print() statements (or only for debugging, will be stripped)
- [ ] No IfcStore.file assignment (wrapper does this)
- [ ] No ifc.write() calls (wrapper exports)

---

## 📋 Quick Reference (Copy-Paste Template)

```python
import numpy as np
import ifcopenshell
import ifcopenshell.api

# === SETUP ===
ifc = ifcopenshell.api.run('project.create_file', version='IFC4')
project = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcProject', name='Project')
site = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSite', name='Site')
building = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuilding', name='Building')
storey = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuildingStorey', name='Ground Floor')

ifcopenshell.api.run('aggregate.assign_object', ifc, product=site, relating_object=project)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=building, relating_object=site)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=storey, relating_object=building)

context = ifcopenshell.api.run('context.add_context', ifc, context_type='Model')
concrete = ifcopenshell.api.run('material.add_material', ifc, name='Concrete C30/37')

# === ELEMENTS ===
wall = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcWall', name='Wall 1')
ifcopenshell.api.run('spatial.assign_container', ifc, product=wall, relating_structure=storey)
ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=wall, height=3.0, width=0.2, length=5.0)

matrix = np.eye(4)
matrix[0, 3] = 0.0  # X
matrix[1, 3] = 0.0  # Y
matrix[2, 3] = 0.0  # Z
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=wall, matrix=matrix)
ifcopenshell.api.run('material.assign_material', ifc, products=wall, material=concrete)

# (Add more elements here following same pattern)
```

---

**Reference**: IFCOpenShell 0.8.x official API  
**Last Updated**: November 2024  
**Frozen for**: Preventing LLM hallucinations in BlenderBIM code generation
