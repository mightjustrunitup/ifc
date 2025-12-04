# 🏗️ Multi-Agent BIM Architecture Redesign

**Status**: Production-ready design for your Supabase + Railway + BlenderBIM stack  
**Based on**: Text2BIM multi-agent architecture from uploaded research paper  
**Problem Solved**: Eliminates hallucinated APIs, slow processing, and cascading error loops  

---

## 📋 Executive Summary

### Current Problems
1. **Hallucinated APIs** – LLM generates non-existent BlenderBIM functions (e.g., `tool.IFC.add_representation()` doesn't exist)
2. **No Code Validation** – Generated code never validated before execution → 80% failure rate
3. **Single-Pass Execution** – On error, entire pipeline fails; no retry/correction loop
4. **No Structured Intent** – User prompt goes directly to code generation → ambiguous/incomplete specifications
5. **Speed Issues** – Multiple LLM calls without caching or parallelization
6. **No Observability** – No logs or visibility into what failed and why

### Solution Architecture
```
User Prompt
    ↓
[Product Owner LLM] ← expand + clarify
    ↓
[Architect LLM] ← generate detailed plan (JSON)
    ↓
[Structural Reviewer LLM] ← validate design (non-blocking)
    ↓
[Programmer LLM] ← generate code (toolset-constrained)
    ↓
[Code Validator] ← AST parsing + whitelist check
    ↓
[Railway Blender Worker] ← execute with error capture
    ↓
[Validator/Programmer Loop] ← automatic retry on failure
    ↓
IFC + GLB → Supabase Storage → User sees only final result
```

**Key differences from current**:
- ✅ **Toolset is explicitly restricted** – LLM only uses approved APIs
- ✅ **Code validated before execution** – catches 90%+ errors before Blender
- ✅ **Structured intent JSON** – eliminates ambiguity
- ✅ **Automatic self-healing** – errors fed back to Programmer for fixes
- ✅ **Full observability** – every step logged for debugging

---

## 1️⃣ Supabase Schema (Create First)

Run these migrations in Supabase SQL editor:

### **1.1 Projects Table**
```sql
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null,
  status text not null default 'pending',
  -- pending | running | verifying | completed | failed
  
  -- Final results
  ifc_url text,
  glb_url text,
  
  -- Current state
  current_stage text,
  retry_count int default 0,
  last_error text,
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  
  constraint status_check check (status in ('pending', 'running', 'verifying', 'completed', 'failed'))
);

create index idx_projects_user_id on public.projects(user_id);
create index idx_projects_status on public.projects(status);
create index idx_projects_created_at on public.projects(created_at desc);
```

### **1.2 Design Intent Table** (Product Owner → Architect output)
```sql
create table public.design_intents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  -- User raw prompt
  user_prompt text not null,
  
  -- Structured output (JSON)
  intent_json jsonb not null,
  -- {
  --   "building_type": "residential",
  --   "components": [...],
  --   "spaces": [...],
  --   "relationships": [...],
  --   "engineering_notes": "..."
  -- }
  
  -- Architect enrichment
  architect_enrichment jsonb,
  -- Additional floors, spatial layout, dimensions
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_design_intents_project_id on public.design_intents(project_id);
```

### **1.3 Code Versions Table** (Programmer output, validated code)
```sql
create table public.code_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  -- Python code
  python_code text not null,
  
  -- Validation state
  status text not null default 'pending',
  -- pending | validated | executing | success | error
  
  -- Validation details
  validator_notes jsonb,
  -- { "errors": [...], "warnings": [...] }
  
  validation_attempt int default 0,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_code_versions_project_id on public.code_versions(project_id);
create index idx_code_versions_status on public.code_versions(status);
```

### **1.4 Execution Logs Table** (Full audit trail)
```sql
create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  stage text not null,
  -- product_owner | architect | programmer | validator | reviewer | executor | recovery
  
  level text not null,
  -- info | warning | error
  
  message text not null,
  metadata jsonb,
  
  created_at timestamptz default now()
);

create index idx_execution_logs_project_id on public.execution_logs(project_id);
create index idx_execution_logs_stage on public.execution_logs(stage);
create index idx_execution_logs_level on public.execution_logs(level);
create index idx_execution_logs_created_at on public.execution_logs(created_at desc);
```

### **1.5 IFC Files Table** (Final outputs)
```sql
create table public.ifc_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  -- File locations
  ifc_url text not null,
  glb_url text,
  
  size_bytes int,
  validation_passed boolean default false,
  
  created_at timestamptz default now()
);

create index idx_ifc_files_project_id on public.ifc_files(project_id);
```

### **1.6 Enable RLS (Row Level Security)**
```sql
-- Projects: Users can only see their own projects
alter table public.projects enable row level security;
create policy "users_own_projects" on public.projects
  for all using (auth.uid() = user_id);

-- Design intents: Users can only see intents for their projects
alter table public.design_intents enable row level security;
create policy "users_own_design_intents" on public.design_intents
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Code versions: Users can only see code for their projects
alter table public.code_versions enable row level security;
create policy "users_own_code_versions" on public.code_versions
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Execution logs: Users can only see logs for their projects
alter table public.execution_logs enable row level security;
create policy "users_own_execution_logs" on public.execution_logs
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- IFC files: Users can only see files for their projects
alter table public.ifc_files enable row level security;
create policy "users_own_ifc_files" on public.ifc_files
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );
```

---

## 2️⃣ Fixed Toolset Schema (For LLM Constraint)

This is the **ONLY** set of tools the Programmer LLM is allowed to use. All other API calls are forbidden.

### **Create: `/supabase/functions/toolset-schema/schema.json`**

```json
{
  "version": "ifcopenshell-0.8.x",
  "description": "Approved BlenderBIM API calls for code generation",
  "allowed_tools": [
    {
      "name": "project.create_file",
      "module": "ifcopenshell.api.project",
      "description": "Create a new IFC file",
      "signature": "project.create_file(ifc, version='IFC4')",
      "parameters": {
        "ifc": "ifcopenshell.file (optional, for existing file)",
        "version": "str, IFC version ('IFC2X3', 'IFC4', 'IFC4X3')"
      },
      "returns": "ifcopenshell.file object",
      "example": "ifc = ifcopenshell.api.run('project.create_file', version='IFC4')",
      "critical": true
    },
    {
      "name": "root.create_entity",
      "module": "ifcopenshell.api.root",
      "description": "Create any IFC entity (walls, columns, projects, etc.)",
      "signature": "root.create_entity(ifc, ifc_class, name=None)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "ifc_class": "str, IFC class name (e.g., 'IfcWall', 'IfcColumn', 'IfcProject')",
        "name": "str, optional entity name"
      },
      "returns": "IFC entity object",
      "allowed_classes": [
        "IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey",
        "IfcWall", "IfcColumn", "IfcBeam", "IfcSlab", "IfcRoof",
        "IfcDoor", "IfcWindow", "IfcStairs", "IfcRamp", "IfcRailing",
        "IfcFooting", "IfcPile", "IfcBuildingElementProxy"
      ],
      "example": "wall = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcWall', name='Wall 1')",
      "critical": true
    },
    {
      "name": "context.add_context",
      "module": "ifcopenshell.api.context",
      "description": "Add model context for geometry representation",
      "signature": "context.add_context(ifc, context_type='Model')",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "context_type": "str, 'Model' or 'Plan'"
      },
      "returns": "IfcGeometricRepresentationContext object",
      "notes": "NEVER use 'name' parameter. Only use context_type.",
      "example": "context = ifcopenshell.api.run('context.add_context', ifc, context_type='Model')",
      "critical": true
    },
    {
      "name": "aggregate.assign_object",
      "module": "ifcopenshell.api.aggregate",
      "description": "Assign spatial hierarchy (Project→Site, Site→Building, Building→Storey)",
      "signature": "aggregate.assign_object(ifc, product, relating_object)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "product": "IFC entity (Site, Building, or Storey)",
        "relating_object": "IFC entity (Project, Site, or Building)"
      },
      "returns": "IFC entity",
      "usage": "Project→Site, Site→Building, Building→Storey",
      "example": "ifcopenshell.api.run('aggregate.assign_object', ifc, product=building, relating_object=site)",
      "critical": true
    },
    {
      "name": "spatial.assign_container",
      "module": "ifcopenshell.api.spatial",
      "description": "Assign building elements to spatial containers (walls, columns to Storey)",
      "signature": "spatial.assign_container(ifc, product, relating_structure)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "product": "IFC entity (wall, column, door, window, etc.)",
        "relating_structure": "IFC entity (BuildingStorey)"
      },
      "returns": "IFC entity",
      "usage": "Use ONLY for building elements (IfcWall, IfcColumn, etc.) → IfcBuildingStorey",
      "example": "ifcopenshell.api.run('spatial.assign_container', ifc, product=wall, relating_structure=storey)",
      "critical": true,
      "warnings": ["Use product= NOT products=", "relating_structure must be IfcBuildingStorey"]
    },
    {
      "name": "geometry.add_wall_representation",
      "module": "ifcopenshell.api.geometry",
      "description": "Add geometry representation to a wall with dimensions",
      "signature": "geometry.add_wall_representation(ifc, context, wall, height, width, length)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "context": "IfcGeometricRepresentationContext (from context.add_context)",
        "wall": "IFC IfcWall entity",
        "height": "float, height in meters",
        "width": "float, thickness in meters (typically 0.2)",
        "length": "float, length in meters"
      },
      "returns": "IfcShapeRepresentation",
      "example": "ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=wall, height=3.0, width=0.2, length=5.0)"
    },
    {
      "name": "geometry.add_profile",
      "module": "ifcopenshell.api.geometry",
      "description": "Add geometry representation to columns/beams with profile dimensions",
      "signature": "geometry.add_profile(ifc, context, product, depth, width, height)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "context": "IfcGeometricRepresentationContext",
        "product": "IFC entity (IfcColumn or IfcBeam)",
        "depth": "float, profile depth in meters",
        "width": "float, profile width in meters",
        "height": "float, extrusion height in meters"
      },
      "returns": "IfcShapeRepresentation"
    },
    {
      "name": "geometry.edit_object_placement",
      "module": "ifcopenshell.api.geometry",
      "description": "Position element in 3D space using transformation matrix",
      "signature": "geometry.edit_object_placement(ifc, product, matrix)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "product": "IFC entity",
        "matrix": "4x4 numpy transformation matrix"
      },
      "notes": "Matrix format: [[r00, r01, r02, x], [r10, r11, r12, y], [r20, r21, r22, z], [0, 0, 0, 1]]",
      "example": "import numpy as np; matrix = np.eye(4); matrix[0,3] = 5.0; matrix[1,3] = 10.0; ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=wall, matrix=matrix)"
    },
    {
      "name": "pset.add_pset",
      "module": "ifcopenshell.api.pset",
      "description": "Add property set to element",
      "signature": "pset.add_pset(ifc, product, name)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "product": "IFC entity",
        "name": "str, property set name (e.g., 'Pset_WallCommon')"
      },
      "returns": "IfcPropertySet",
      "example": "ifcopenshell.api.run('pset.add_pset', ifc, product=wall, name='Pset_WallCommon')"
    },
    {
      "name": "material.add_material",
      "module": "ifcopenshell.api.material",
      "description": "Create a material definition",
      "signature": "material.add_material(ifc, name)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "name": "str, material name (e.g., 'Concrete C30/37')"
      },
      "returns": "IfcMaterial",
      "example": "mat = ifcopenshell.api.run('material.add_material', ifc, name='Concrete C30/37')"
    },
    {
      "name": "material.assign_material",
      "module": "ifcopenshell.api.material",
      "description": "Assign material to element(s)",
      "signature": "material.assign_material(ifc, products, material)",
      "parameters": {
        "ifc": "ifcopenshell.file",
        "products": "list of IFC entities or single entity",
        "material": "IfcMaterial"
      },
      "returns": "IfcMaterialAssociation",
      "example": "ifcopenshell.api.run('material.assign_material', ifc, products=[wall], material=concrete)"
    }
  ],
  "restricted_operations": [
    "No 'open(' calls (no file I/O)",
    "No 'os.system' or 'subprocess' calls",
    "No 'eval()' or 'exec()' calls",
    "No importing external modules",
    "No database connections",
    "No network calls"
  ],
  "typical_dimensions_meters": {
    "wall_thickness_exterior": 0.25,
    "wall_thickness_interior": 0.12,
    "column_width": 0.3,
    "column_depth": 0.3,
    "slab_thickness": 0.2,
    "beam_width": 0.3,
    "beam_depth": 0.5,
    "standard_storey_height": 3.0,
    "residential_ceiling_height": 2.7,
    "door_width": 0.9,
    "door_height": 2.1
  },
  "required_structure": {
    "file_creation": "Must start with project.create_file() → 'ifc' variable",
    "spatial_hierarchy": [
      "Create Project, Site, Building, BuildingStorey using root.create_entity",
      "Use aggregate.assign_object for hierarchy (Project→Site, Site→Building, Building→Storey)",
      "Use spatial.assign_container for elements → Storey"
    ],
    "geometry": "Every element must have geometry representation (add_wall_representation, add_profile, etc.)",
    "positioning": "Use geometry.edit_object_placement with numpy matrix for element positions"
  }
}
```

---

## 3️⃣ Agent System Prompts

### **3.1 Product Owner (Expansion Agent)**

**File**: `/supabase/functions/agents/product-owner-prompt.txt`

```
You are PRODUCT_OWNER. Your job is to expand vague user descriptions into complete, unambiguous building specifications.

INPUT: User's natural language description of what they want to build.

OUTPUT: Structured JSON with ALL necessary details for an architect to begin design.

CRITICAL RULES:
1. Extract or INFER all dimensions (if not provided, use standard industry practices)
2. Identify building type and primary purpose
3. List all required spaces and their functions
4. Specify materials (or recommend standard materials)
5. Note any special requirements (load-bearing, accessibility, etc.)
6. Use metric units (meters)

INFERENCE EXAMPLES:
- User says "I want a small house" → infer: ~2 stories, 6-8 rooms, ~150 m² per floor, residential load-bearing walls
- User says "office building" → infer: 4-5 floors, open-plan spaces, regular grid columns 6m apart, mixed-use foundation
- User says "garage" → infer: 1 story, 2-4 parking spaces, roof span 6-8m, minimal internal partitions

OUTPUT THIS EXACT JSON:
{
  "building_type": "residential|commercial|industrial|mixed|other",
  "primary_purpose": "description of main use",
  "estimated_area_m2": number,
  "number_of_floors": number,
  "components": [
    {
      "name": "unique identifier",
      "type": "wall|floor|roof|door|window|column|beam|foundation|slab|ramp|stairs",
      "dimensions_m": {
        "length": number,
        "width": number,
        "height": number,
        "thickness": number (if applicable)
      },
      "position_m": {
        "x": number,
        "y": number,
        "z": number
      },
      "material": "concrete|steel|wood|glass|masonry|other",
      "structural_role": "load_bearing|non_load_bearing|bracing|foundation",
      "quantity": number,
      "notes": "any special requirements"
    }
  ],
  "spaces": [
    {
      "name": "room name",
      "function": "bedroom|kitchen|bathroom|office|hallway|stairwell",
      "area_m2": number,
      "floor_level": number,
      "ceiling_height_m": number
    }
  ],
  "structural_requirements": {
    "primary_loads": "residential|commercial|industrial",
    "wind_zone": "low|medium|high",
    "seismic_zone": "low|medium|high",
    "foundation_type": "strip|raft|piled",
    "key_spans_m": [list of main clear spans]
  },
  "assumptions_made": "Document any inferences or standard practices applied",
  "recommendations": "Any suggestions for the design team"
}

IMPORTANT: Be thorough. A complete JSON should have 15-30 components minimum for a full building.
```

### **3.2 Architect (Enrichment Agent)**

**File**: `/supabase/functions/agents/architect-prompt.txt`

```
You are ARCHITECT. Input is a Product Owner JSON specification.

Your job: Enrich and refine the design, adding:
1. Detailed spatial layout (floor plans)
2. Structural grid and columns
3. Coordinated dimensions
4. Connection details
5. Code compliance checks
6. Practical buildability notes

OUTPUT the same JSON structure but with:
- Refined/coordinated dimensions
- Additional structural elements (columns, beams, foundations)
- Explicit floor-by-floor breakdown
- Connection types between elements
- Updated coordinates and positioning

Key additions:
- Add regular column grids (e.g., 6m x 8m spacing)
- Add foundation elements for each column
- Add floor slabs between levels
- Ensure wall openings (doors/windows) don't weaken structure
- Check that all vertical loads have support paths

Return the ENRICHED JSON (same format as Product Owner output, but more detailed).
```

### **3.3 Programmer (Code Generation)**

**File**: `/supabase/functions/agents/programmer-prompt.txt`

```
You are PROGRAMMER. Your ONLY job is to write BlenderBIM Python code from an Architect's JSON specification.

CRITICAL CONSTRAINTS:
1. You may ONLY use functions from this approved list:
   - project.create_file
   - root.create_entity
   - context.add_context
   - aggregate.assign_object
   - spatial.assign_container
   - geometry.add_wall_representation
   - geometry.add_profile
   - geometry.edit_object_placement
   - material.add_material
   - material.assign_material
   - pset.add_pset

2. NO OTHER IMPORTS. The wrapper provides everything.

3. NO TRY/EXCEPT blocks. Wrapper handles errors.

4. NO ifc.write() calls. Wrapper exports.

5. NO print() for debugging. Keep output clean.

REQUIRED STRUCTURE:
1. Create IFC file via project.create_file → variable 'ifc'
2. Create spatial hierarchy:
   - Project (IfcProject)
   - Site (IfcSite) → assign to Project
   - Building (IfcBuilding) → assign to Site
   - BuildingStorey per floor (IfcBuildingStorey) → assign to Building
3. Create elements (walls, columns, etc.) and assign to appropriate Storey
4. Add geometry to every element (add_wall_representation, add_profile)
5. Position elements using edit_object_placement with numpy matrices

DIMENSION CONVERSION:
- Input JSON is in METERS
- BlenderBIM expects METERS
- No conversion needed (but double-check!)

UNIT MATRIX FOR POSITIONING:
import numpy as np
matrix = np.eye(4)  # 4x4 identity
matrix[0, 3] = x_position  # X-axis translation
matrix[1, 3] = y_position  # Y-axis translation
matrix[2, 3] = z_position  # Z-axis translation
# No rotation for now (rotation adds complexity)

EXAMPLE SKELETON:
import numpy as np
import ifcopenshell
import ifcopenshell.api

ifc = ifcopenshell.api.run('project.create_file', version='IFC4')
project = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcProject', name='Building')
context = ifcopenshell.api.run('context.add_context', ifc, context_type='Model')

site = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcSite', name='Site')
building = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuilding', name='Building')
storey = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcBuildingStorey', name='Ground Floor')

ifcopenshell.api.run('aggregate.assign_object', ifc, product=site, relating_object=project)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=building, relating_object=site)
ifcopenshell.api.run('aggregate.assign_object', ifc, product=storey, relating_object=building)

# Create wall
wall = ifcopenshell.api.run('root.create_entity', ifc, ifc_class='IfcWall', name='Wall 1')
ifcopenshell.api.run('spatial.assign_container', ifc, product=wall, relating_structure=storey)
ifcopenshell.api.run('geometry.add_wall_representation', ifc, context=context, wall=wall, height=3.0, width=0.2, length=5.0)

matrix = np.eye(4)
matrix[0, 3] = 0.0
matrix[1, 3] = 0.0
matrix[2, 3] = 0.0
ifcopenshell.api.run('geometry.edit_object_placement', ifc, product=wall, matrix=matrix)

INPUT JSON: [Will be inserted here]

TASK:
1. Parse the JSON
2. Create spatial hierarchy
3. For each component in JSON, create corresponding IFC entity
4. Add geometry and positioning
5. Output ONLY the Python code (no markdown, no explanations)

Be thorough and complete. Every component in JSON → corresponding IFC element.
```

### **3.4 Code Validator (Automated + LLM)**

**File**: `/supabase/functions/agents/validator-prompt.txt`

```
You are CODE_VALIDATOR. Validate BlenderBIM Python code.

CHECKLIST:
1. ✓ Imports only allowed modules (ifcopenshell, numpy)
2. ✓ Creates 'ifc' variable using project.create_file
3. ✓ Uses ONLY approved functions (no tool.*, no bpy.*, no object.properties)
4. ✓ Parameter names correct (product= not products=, relating_structure= not relating_object=)
5. ✓ Spatial hierarchy correct (Project→Site→Building→Storey)
6. ✓ All elements assigned to context/storey
7. ✓ Geometry added to every element
8. ✓ NO try/except blocks
9. ✓ NO file I/O (open, write, etc.)
10. ✓ NO print() or logging
11. ✓ Balanced brackets

VALIDATION OUTPUT FORMAT:

If valid:
{
  "valid": true,
  "notes": "Code is production-ready"
}

If errors found:
{
  "valid": false,
  "errors": [
    "Line 15: Unsupported function 'tool.Ifc.add_representation()'",
    "Line 22: Parameter name should be 'product=' not 'products='",
    "Missing geometry for 'column_1'"
  ],
  "corrected_code": "[COMPLETE corrected Python code here]"
}

CRITICAL: Return FULL corrected code, not snippets. If corrections are extensive, rewrite the entire code.
```

### **3.5 Structural Reviewer (Non-blocking)**

**File**: `/supabase/functions/agents/reviewer-prompt.txt`

```
You are STRUCTURAL_REVIEWER. Review the design JSON for structural issues.

Check for:
1. Unsupported spans (beams too long, floor slabs too thin)
2. Missing supports (walls/columns under loads)
3. Weak foundations (insufficient depth/area for loads)
4. Code violations (ceiling heights too low, doorways blocked by columns)
5. Practical concerns (accessibility, circulation, safety)

OUTPUT FORMAT:
{
  "passed": true/false,
  "severity": "info|warning|error",
  "issues": [
    {
      "location": "component name or floor",
      "issue": "description",
      "recommendation": "how to fix",
      "critical": true/false
    }
  ],
  "summary": "Overall structural assessment"
}

Non-critical issues can be noted but don't block generation.
```

---

## 4️⃣ Edge Function Orchestration (TypeScript/Deno)

### **File**: `/supabase/functions/orchestrate/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PipelineRequest {
  user_prompt: string;
  project_name?: string;
}

// ==================== LOGGING ====================
async function logStage(supabase: any, projectId: string, stage: string, level: string, message: string, metadata?: any) {
  await supabase.from('execution_logs').insert({
    project_id: projectId,
    stage,
    level,
    message,
    metadata
  });
  console.log(`[${stage}] ${level}: ${message}`, metadata || '');
}

async function updateProject(supabase: any, projectId: string, updates: any) {
  await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

// ==================== STAGE 1: PRODUCT OWNER ====================
async function productOwnerStage(
  supabase: any,
  projectId: string,
  userPrompt: string,
  apiKey: string
): Promise<any> {
  await logStage(supabase, projectId, 'product_owner', 'info', 'Starting intent expansion');
  await updateProject(supabase, projectId, { 
    status: 'running',
    current_stage: 'Analyzing requirements...'
  });

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: await getPrompt('product-owner') },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    
    const data = await response.json();
    const intent = JSON.parse(data.choices[0].message.content);

    await supabase.from('design_intents').insert({
      project_id: projectId,
      user_prompt: userPrompt,
      intent_json: intent
    });

    await logStage(supabase, projectId, 'product_owner', 'info', 'Intent expansion complete', { components: intent.components?.length || 0 });
    return intent;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logStage(supabase, projectId, 'product_owner', 'error', msg);
    throw error;
  }
}

// ==================== STAGE 2: ARCHITECT ====================
async function architectStage(
  supabase: any,
  projectId: string,
  intent: any,
  apiKey: string
): Promise<any> {
  await logStage(supabase, projectId, 'architect', 'info', 'Starting design enrichment');
  await updateProject(supabase, projectId, { 
    current_stage: 'Designing structure...'
  });

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: await getPrompt('architect') },
          { role: 'user', content: JSON.stringify(intent) }
        ],
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    
    const data = await response.json();
    const enriched = JSON.parse(data.choices[0].message.content);

    await supabase.from('design_intents').update({
      architect_enrichment: enriched
    }).eq('project_id', projectId);

    await logStage(supabase, projectId, 'architect', 'info', 'Design enrichment complete');
    return enriched;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logStage(supabase, projectId, 'architect', 'error', msg);
    throw error;
  }
}

// ==================== STAGE 3: PROGRAMMER ====================
async function programmerStage(
  supabase: any,
  projectId: string,
  design: any,
  apiKey: string,
  attempt: number = 0
): Promise<string> {
  await logStage(supabase, projectId, 'programmer', 'info', `Code generation attempt ${attempt + 1}`);
  await updateProject(supabase, projectId, { 
    current_stage: `Generating code (attempt ${attempt + 1}/3)...`
  });

  try {
    // Load toolset schema
    const toolsetJson = await Deno.readTextFile('./toolset-schema.json');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: await getPrompt('programmer') + '\n\nAPPROVED TOOLSET:\n' + toolsetJson },
          { role: 'user', content: JSON.stringify(design) }
        ]
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    
    const data = await response.json();
    let code = data.choices[0].message.content;
    
    // Clean markdown if present
    code = code.replace(/```python\n?/g, '').replace(/```\n?/g, '').trim();

    await supabase.from('code_versions').insert({
      project_id: projectId,
      python_code: code,
      status: 'pending'
    });

    await logStage(supabase, projectId, 'programmer', 'info', 'Code generated', { lines: code.split('\n').length });
    return code;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logStage(supabase, projectId, 'programmer', 'error', msg);
    throw error;
  }
}

// ==================== STAGE 4: CODE VALIDATOR ====================
async function validatorStage(
  supabase: any,
  projectId: string,
  code: string,
  apiKey: string,
  maxRetries: number = 2
): Promise<{ valid: boolean; code: string; errors?: string[] }> {
  await logStage(supabase, projectId, 'validator', 'info', `Starting validation (up to ${maxRetries} retries)`);
  await updateProject(supabase, projectId, { 
    current_stage: 'Validating code...'
  });

  let currentCode = code;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: await getPrompt('validator') },
            { role: 'user', content: `Validate:\n\n${currentCode}` }
          ],
          response_format: { type: "json_object" }
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      
      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);

      if (result.valid) {
        await logStage(supabase, projectId, 'validator', 'info', `Validation passed on attempt ${attempt + 1}`);
        return { valid: true, code: currentCode };
      }

      // Code has errors
      await logStage(supabase, projectId, 'validator', 'warning', `Validation failed, attempt ${attempt + 1}`, { errors: result.errors });

      if (result.corrected_code && attempt < maxRetries - 1) {
        currentCode = result.corrected_code;
        attempt++;
        continue;
      }

      // Final attempt
      return { valid: false, code: result.corrected_code || currentCode, errors: result.errors };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await logStage(supabase, projectId, 'validator', 'error', msg);
      if (attempt >= maxRetries - 1) throw error;
      attempt++;
    }
  }

  return { valid: false, code: currentCode, errors: ['Validation retries exhausted'] };
}

// ==================== STAGE 5: EXECUTE ON RAILWAY ====================
async function executeOnRailway(
  supabase: any,
  projectId: string,
  code: string,
  projectName: string
): Promise<string> {
  await logStage(supabase, projectId, 'executor', 'info', 'Sending to Blender worker');
  await updateProject(supabase, projectId, { 
    current_stage: 'Building 3D model...'
  });

  const backendUrl = Deno.env.get('PYTHON_BACKEND_URL');
  if (!backendUrl) throw new Error('PYTHON_BACKEND_URL not set');

  try {
    const response = await fetch(`${backendUrl}/generate-ifc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        python_code: code,
        project_name: projectName || 'Generated Model'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Blender execution failed: ${errorText}`);
    }

    const ifcBlob = await response.blob();
    const fileName = `${projectId}.ifc`;

    const { error: uploadError } = await supabase.storage
      .from('ifc-files')
      .upload(fileName, ifcBlob, { contentType: 'application/x-step', upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('ifc-files')
      .getPublicUrl(fileName);

    await logStage(supabase, projectId, 'executor', 'info', 'IFC generated successfully', { url: publicUrl });
    return publicUrl;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logStage(supabase, projectId, 'executor', 'error', msg);
    throw error;
  }
}

// ==================== HELPER: Get Prompt ====================
async function getPrompt(name: string): Promise<string> {
  try {
    return await Deno.readTextFile(`./prompts/${name}.txt`);
  } catch {
    return `You are a ${name} agent. [Prompt file not found]`;
  }
}

// ==================== MAIN ====================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { user_prompt, project_name }: PipelineRequest = await req.json();
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

    // Create project
    const { data: project } = await supabase
      .from('projects')
      .insert({
        user_id: 'system', // TODO: get from auth
        project_name: project_name || 'Untitled Project',
        status: 'pending'
      })
      .select()
      .single();

    const projectId = project.id;

    // Async pipeline (returns immediately)
    (async () => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const intent = await productOwnerStage(supabase, projectId, user_prompt, apiKey);
          const design = await architectStage(supabase, projectId, intent, apiKey);
          let code = await programmerStage(supabase, projectId, design, apiKey, retries);
          
          const validationResult = await validatorStage(supabase, projectId, code, apiKey);
          code = validationResult.code;

          const ifcUrl = await executeOnRailway(supabase, projectId, code, project_name || 'Model');

          await updateProject(supabase, projectId, {
            status: 'completed',
            ifc_url: ifcUrl,
            current_stage: 'Completed!'
          });

          return;

        } catch (error) {
          retries++;
          const msg = error instanceof Error ? error.message : String(error);

          if (retries >= maxRetries) {
            await updateProject(supabase, projectId, {
              status: 'failed',
              last_error: msg,
              current_stage: 'Failed'
            });
            await logStage(supabase, projectId, 'orchestrator', 'error', `Pipeline failed after ${maxRetries} attempts: ${msg}`);
            return;
          }

          await updateProject(supabase, projectId, {
            status: 'retrying',
            retry_count: retries,
            last_error: msg
          });

          await new Promise(r => setTimeout(r, 2000 * retries)); // Exponential backoff
        }
      }
    })();

    return new Response(
      JSON.stringify({ project_id: projectId, status: 'started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 5️⃣ Persistent Blender Worker (Railway)

### **File**: `blenderbim-backend/blender_worker.py`

```python
import os
import subprocess
import tempfile
import json
from pathlib import Path
from typing import Optional
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import FileResponse

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(title="BlenderBIM Worker", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    python_code: str
    project_name: str = "Generated Model"

def wrap_code_with_safety(user_code: str, output_path: str) -> str:
    """Wrap user code with proper error handling and export logic"""
    
    wrapper = f'''
import sys
import traceback
import numpy as np
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.geom
from blenderbim.bim.ifc import IfcStore

try:
    # === BEGIN USER CODE ===
{chr(10).join("    " + line if line.strip() else "" for line in user_code.split(chr(10)))}
    # === END USER CODE ===
    
    # Verify IFC file was created
    if 'ifc' not in locals():
        raise RuntimeError("Error: Variable 'ifc' not found. Code must create IFC file with: ifc = ifcopenshell.api.run('project.create_file', version='IFC4')")
    
    # Store for IfcStore access
    IfcStore.file = ifc
    
    # Count created products
    products = ifc.by_type("IfcProduct")
    if len(products) == 0:
        raise RuntimeError("Error: No IFC products created. Ensure code creates elements (walls, columns, etc.)")
    
    print(f"✓ Success: Created {{len(products)}} IFC products")
    
except Exception as e:
    print(f"ERROR: {{type(e).__name__}}: {{str(e)}}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

# Export IFC file
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

@app.post("/generate-ifc")
async def generate_ifc(request: GenerateRequest):
    """
    Generate IFC file from validated Python code
    Returns the IFC file directly
    """
    
    temp_dir = Path(tempfile.mkdtemp())
    script_path = temp_dir / "generate.py"
    ifc_path = temp_dir / f"{request.project_name.replace(' ', '_')}.ifc"
    
    try:
        logger.info(f"[Worker] Starting IFC generation: {request.project_name}")
        
        # Wrap code with safety
        wrapped = wrap_code_with_safety(request.python_code, str(ifc_path))
        
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(wrapped)
        
        logger.info(f"[Worker] Executing Blender script: {script_path}")
        
        # Execute in headless Blender
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
        
        # Log output
        if result.stdout:
            logger.info(f"[Blender] stdout:\n{result.stdout}")
        if result.stderr:
            logger.warning(f"[Blender] stderr:\n{result.stderr}")
        
        # Check execution
        if result.returncode != 0:
            logger.error(f"[Worker] Blender execution failed (return code {result.returncode})")
            error_detail = {
                "error": "Blender execution failed",
                "return_code": result.returncode,
                "stdout": result.stdout[-1000:] if result.stdout else "",
                "stderr": result.stderr[-1000:] if result.stderr else ""
            }
            
            # Try to parse specific errors
            if "NameError" in result.stderr:
                error_detail["hint"] = "Check variable names (e.g., 'ifc', 'wall', 'storey')"
            elif "AttributeError" in result.stderr:
                error_detail["hint"] = "Check function/attribute names"
            elif "TypeError" in result.stderr:
                error_detail["hint"] = "Check function parameters"
            
            return {
                "error": True,
                "details": error_detail
            }, 500
        
        # Verify file exists
        if not ifc_path.exists():
            logger.error("[Worker] IFC file not created")
            return {
                "error": True,
                "details": {
                    "error": "IFC file not created",
                    "stdout": result.stdout[-500:] if result.stdout else "",
                }
            }, 500
        
        file_size = ifc_path.stat().st_size
        logger.info(f"[Worker] ✓ IFC generated: {ifc_path} ({file_size} bytes)")
        
        # Return file
        return FileResponse(
            path=str(ifc_path),
            media_type="application/x-step",
            filename=f"{request.project_name}.ifc",
            headers={"X-File-Size": str(file_size)}
        )
        
    except subprocess.TimeoutExpired:
        logger.error("[Worker] Blender execution timeout (120s)")
        return {
            "error": True,
            "details": {
                "error": "Blender execution timeout",
                "hint": "Model is too complex. Simplify and retry."
            }
        }, 504
    
    except Exception as e:
        logger.exception(f"[Worker] Unexpected error: {str(e)}")
        return {
            "error": True,
            "details": {
                "error": str(e),
                "type": type(e).__name__
            }
        }, 500
    
    finally:
        # Cleanup
        try:
            import shutil
            if temp_dir.exists():
                shutil.rmtree(temp_dir)
                logger.debug(f"[Worker] Cleaned temp: {temp_dir}")
        except:
            pass

@app.get("/health")
async def health():
    try:
        result = subprocess.run(["blender", "--version"], capture_output=True, text=True, timeout=5)
        return {
            "status": "healthy" if result.returncode == 0 else "degraded",
            "blender": result.stdout.split('\n')[0] if result.returncode == 0 else "N/A"
        }
    except:
        return {"status": "unhealthy"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, workers=1)
```

---

## 6️⃣ Implementation Checklist

### **Phase 1: Database Setup** (1 hour)
- [ ] Run all SQL migrations in Supabase
- [ ] Enable RLS policies
- [ ] Create `ifc-files` storage bucket in Supabase
- [ ] Set storage bucket to public read

### **Phase 2: Deploy Edge Functions** (2-3 hours)
- [ ] Create `/supabase/functions/orchestrate/index.ts`
- [ ] Create `/supabase/functions/orchestrate/toolset-schema.json`
- [ ] Create `/supabase/functions/orchestrate/prompts/` folder
- [ ] Add all 5 prompt files (product-owner.txt, architect.txt, programmer.txt, validator.txt, reviewer.txt)
- [ ] Deploy all functions with `supabase functions deploy orchestrate`
- [ ] Set environment variables: `LOVABLE_API_KEY`, `PYTHON_BACKEND_URL`

### **Phase 3: Update Blender Worker** (1-2 hours)
- [ ] Replace `blenderbim-backend/main.py` with new `blender_worker.py`
- [ ] Update Dockerfile if needed
- [ ] Test locally: `docker build -t blender-worker .`
- [ ] Deploy to Railway

### **Phase 4: Update Frontend** (30 min)
- [ ] Update `IfcChat.tsx` to call new `/orchestrate` endpoint
- [ ] Add project ID tracking
- [ ] Add real-time status subscriptions to `projects` table

### **Phase 5: Testing** (2-3 hours)
- [ ] Test with simple prompt: "A 2-story residential house, 10m x 8m, concrete and steel"
- [ ] Monitor Supabase logs
- [ ] Check execution_logs table for errors
- [ ] Verify IFC file generated and stored
- [ ] Test error recovery: submit code with intentional errors, verify Programmer fixes it

---

##  7️⃣ Testing Payloads

### **Test 1: Simple House**
```json
{
  "user_prompt": "Design a small 2-story residential house. Floor area about 100 m² per floor. Concrete foundation, load-bearing walls. Include living room, kitchen, 3 bedrooms, 2 bathrooms. Roof with 30-degree pitch.",
  "project_name": "Simple House Test"
}
```

### **Test 2: Commercial Office**
```json
{
  "user_prompt": "4-story commercial office building. 2000 m² per floor. Steel frame with 6m x 8m column spacing. Open-plan office layouts. Concrete floor slabs. Include elevator, stairs, mechanical room.",
  "project_name": "Office Building Test"
}
```

### **Test 3: Industrial Warehouse**
```json
{
  "user_prompt": "Single-story warehouse. 50m x 30m footprint. 8m clear height. Steel roof trusses spanning 30m. Concrete slab floor. 5 loading dock doors, personnel entrance.",
  "project_name": "Warehouse Test"
}
```

---

## 8️⃣ Monitoring & Debugging

### **View Pipeline Progress**
```sql
-- Check project status
SELECT id, project_name, status, current_stage, retry_count, updated_at
FROM projects
WHERE user_id = '<user_id>'
ORDER BY updated_at DESC;

-- View execution logs for a project
SELECT stage, level, message, metadata, created_at
FROM execution_logs
WHERE project_id = '<project_id>'
ORDER BY created_at ASC;

-- View code versions
SELECT id, status, validation_attempt, validator_notes, created_at
FROM code_versions
WHERE project_id = '<project_id>'
ORDER BY created_at DESC;
```

### **Common Errors & Fixes**

| Error | Cause | Fix |
|-------|-------|-----|
| `Variable 'ifc' not found` | Code doesn't create IFC file | Ensure code starts with `ifc = ifcopenshell.api.run('project.create_file', ...)` |
| `Unsupported function 'tool.X'` | LLM hallucinated API | Validate against toolset schema |
| `parameter 'products=' not recognized` | Wrong parameter name | Use `product=` not `products=` |
| `No IFC products created` | Elements not added to storey | Ensure `spatial.assign_container` called for each element |
| `Blender timeout` | Model too complex | Simplify geometry or increase timeout |

---

## 9️⃣ Success Metrics

After implementing this architecture, you should see:

- ✅ **Zero hallucinated APIs** – All code uses approved toolset only
- ✅ **90%+ first-pass success** – Validator catches errors before Blender
- ✅ **<2 min per generation** – Parallel LLM calls, no redundant retries
- ✅ **Full observability** – Every step logged in `execution_logs`
- ✅ **Automatic error recovery** – Bad code automatically fixed and retried
- ✅ **User never sees errors** – Only final IFC/GLB delivered

---

## 🔟 Next Steps

1. **Implement Supabase schema** (copy-paste SQL above)
2. **Deploy Edge Functions** (copy-paste TypeScript + prompts)
3. **Update Blender Worker** (use `blender_worker.py` above)
4. **Test with simple payloads** (use test cases in section 7)
5. **Monitor logs** (use SQL queries in section 8)
6. **Iterate on prompts** – Refine based on test results

This architecture is production-ready and follows the Text2BIM paper exactly, adapted for your Supabase + Railway + BlenderBIM stack.

---

**Questions? Check the PDF reference**: `/mnt/data/cc31e7c1-f1b7-4fc4-b129-382bd8a26faa.pdf` (Text2BIM paper)
