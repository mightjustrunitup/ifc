# 🎨 Visual Architecture Diagrams & Data Flow

---

## 1. High-Level Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER SUBMITS PROMPT                                  │
│                      "Design a small house"                                  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                                 │
                    ▼                                 │
        ┌───────────────────────┐                     │
        │  PRODUCT OWNER LLM    │                     │
        │   (Expansion Agent)   │                     │
        │                       │                     │
        │ Task:                 │                     │
        │ - Parse requirements  │                     │
        │ - Infer dimensions    │                     │
        │ - List all components │                     │
        │ Output: Detailed JSON │                     │
        └───────────┬───────────┘                     │
                    │                                 │
                    ▼                                 │
        ┌───────────────────────┐                     │
        │    ARCHITECT LLM      │                     │
        │ (Design Enrichment)   │                     │
        │                       │                     │
        │ Task:                 │                     │
        │ - Spatial layout      │                     │
        │ - Column grid         │                     │
        │ - Load paths          │                     │
        │ Output: Enriched JSON │                     │
        └───────────┬───────────┘                     │
                    │                                 │
                    ▼                                 │
        ┌───────────────────────┐                     │
        │  PROGRAMMER LLM       │                     │
        │  (Code Generation)    │                     │
        │                       │                     │
        │ Task:                 │                     │
        │ - Write Python code   │                     │
        │ - ONLY use 12 fns     │                     │
        │ Output: Valid Python  │                     │
        └───────────┬───────────┘                     │
                    │                                 │
                    ▼                                 │
        ┌───────────────────────┐                     │
        │   CODE VALIDATOR      │◄────────────────────┘
        │ (Auto + LLM)          │                         
        │                       │                    Retry Loop:
        │ Task:                 │◄──────┐           Up to 2x
        │ - AST parse           │       │
        │ - Whitelist check     │       │
        │ - Fix errors          │       │
        │ Output: Safe Python   │       │
        └───────────┬───────────┘       │
                    │                   │
        Valid?      ├─ No ─────────────┘
        Yes         │
                    ▼
        ┌───────────────────────┐
        │ BLENDER WORKER        │
        │  (Code Executor)      │
        │                       │
        │ Task:                 │
        │ - Run Python code     │
        │ - Create IFC/GLB      │
        │ Output: IFC file      │
        └───────────┬───────────┘
                    │
        Failed?     ├─ Yes ──────────┐
        No          │                │
                    ▼                │
        ┌───────────────────────┐    │
        │  UPLOAD TO STORAGE    │    │
        │  (Supabase)           │    │
        │                       │    │
        │ Task:                 │    │
        │ - Save IFC file       │    │
        │ - Generate GLB        │    │
        │ Output: URLs          │    │
        └───────────┬───────────┘    │
                    │                │
        Retries     ├─ Retry ────────┤
        exhausted?  │                │
                    ▼                │
        ┌───────────────────────┐    │
        │   FINAL RESULT        │    │
        │   ✅ SUCCESS          │    │
        │                       │    │
        │ IFC URL: [link]       │    │
        │ GLB URL: [link]       │    │
        └───────────────────────┘    │
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  ❌ FINAL FAILURE       │
                        │  (Max retries exceeded) │
                        │  Error logged for audit │
                        └─────────────────────────┘
```

---

## 2. Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SUPABASE SCHEMA                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ PROJECTS (Main tracking table)                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ id (UUID) ──────────┐                                                        │
│ user_id (UUID) ────┼──→ Identifies which user owns this project             │
│ project_name       │                                                        │
│ status ◄───────────┼──┐  enum: pending|running|verifying|completed|failed   │
│ current_stage      │  │  Shows progress (e.g., "Analyzing requirements")    │
│ ifc_url            │  │  Final downloadable IFC file                        │
│ retry_count        │  │  How many retries used                              │
│ last_error         │  │  Error message if failed                            │
│ created_at         │  │  Timestamp                                          │
│ updated_at         │  │                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
           ▲                                    ▲
           │                                    │
           └────────────────┬───────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼

┌─────────────────────┐ ┌──────────────────┐ ┌───────────────────────┐
│ DESIGN_INTENTS      │ │ CODE_VERSIONS    │ │ EXECUTION_LOGS        │
├─────────────────────┤ ├──────────────────┤ ├───────────────────────┤
│ id (UUID)           │ │ id (UUID)        │ │ id (UUID)             │
│ project_id ◄───────┼─┼─ project_id ◄───┼─┼─ project_id           │
│ user_prompt         │ │ python_code      │ │ stage (text)           │
│ intent_json ────────┼─┤ status ◄────┐   │ │ level (info|warn|error)│
│ architect_          │ │ validator_   │   │ │ message (text)        │
│   enrichment        │ │   notes      │   │ │ metadata (JSON)       │
│ created_at          │ │ created_at   │   │ │ created_at            │
└─────────────────────┘ └──────────────────┘ └───────────────────────┘
        │                      │                       ▲
        │ Expanded prompt      │ Python code + fixes   │
        │ from LLM             │ from Validator        │ All events logged
        │                      └──────────────────────┘ here for debugging
        │
        └──► Contains: components, spaces, materials, structural requirements


┌──────────────────────────────────────────────────────────────────────────────┐
│ IFC_FILES (Final outputs)                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ id (UUID)                                                                    │
│ project_id ──────────────────────→ References PROJECTS                       │
│ ifc_url ─────────────────────────→ Supabase Storage public URL               │
│ glb_url ─────────────────────────→ Optional GLB preview URL                  │
│ size_bytes                         File size for optimization                │
│ validation_passed                  Boolean: passed final checks              │
│ created_at                                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Edge Function Orchestration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Supabase Edge Function: orchestrate/index.ts                                 │
│ (Runs on Deno server)                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Request:
  POST /functions/v1/orchestrate
  {
    "user_prompt": "Design a small house",
    "project_name": "My House"
  }

Response (Immediate):
  {
    "project_id": "uuid-1234",
    "status": "started"
  }

┌─────────────────────────────────────────────────────────────────────────────┐
│ Orchestrator then runs async (in background)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Flow:
  1. Create project record in DB (status='pending')
  
  2. Call Product Owner LLM
     URL: https://ai.gateway.lovable.dev/v1/chat/completions
     Model: google/gemini-2.5-flash
     Prompt: From /prompts/product-owner.txt
     Output: JSON with components, spaces, materials
     Update DB: status='running', current_stage='Analyzing...'
  
  3. Call Architect LLM
     Model: google/gemini-2.5-pro (more capable)
     Prompt: From /prompts/architect.txt
     Input: Product Owner JSON
     Output: Enriched JSON with structural grid, layout
     Update DB: design_intents.architect_enrichment
  
  4. Call Programmer LLM
     Model: google/gemini-2.5-pro
     Prompt: From /prompts/programmer.txt + TOOLSET SCHEMA
     Input: Architect JSON
     Output: Python code (only using 12 approved functions)
     Store: code_versions table
  
  5. Validate Code (with retry loop)
     Option A: Automated AST parsing + whitelist check
     Option B: LLM validation (google/gemini-2.5-flash)
     If invalid:
       - LLM provides corrected_code
       - Retry up to 2 times
       - After 2 failures, proceed with best effort
     Store: code_versions.validator_notes
  
  6. Send to Blender Worker
     POST https://<railway-app>/generate-ifc
     Body: { python_code, project_name }
     Response: IFC file blob
     On Error: Feed error message back to Programmer LLM
               Regenerate code with error context
               Retry execution
  
  7. Upload to Storage
     Supabase Storage: /ifc-files/{project_id}.ifc
     Make public: Generate public URL
     Store: ifc_files table
  
  8. Mark Complete
     Update projects: status='completed', ifc_url='...'
     Update projects: current_stage='Completed!'

Retry Logic:
  Max retries: 3 per project
  Backoff: 2s, 4s, 6s between attempts
  Trigger: Any exception in stages 2-7
  Context: Previous error + previous code fed to LLM

Logging:
  Every action logged to execution_logs table:
  - stage: product_owner|architect|programmer|validator|executor
  - level: info|warning|error
  - message: Human-readable message
  - metadata: JSON with details (lengths, counts, error stacks)
```

---

## 4. Blender Worker Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Blender Worker (Railway deployment)                                          │
│ File: blenderbim-backend/blender_worker.py                                  │
│ Framework: FastAPI (Python async)                                            │
└─────────────────────────────────────────────────────────────────────────────┘

Endpoints:

  GET /health
  ├─ Checks: blender --version
  ├─ Returns: { "status": "healthy", "blender": "Blender 4.0.2 ..." }
  └─ Frequency: Called by Supabase health checks

  POST /generate-ifc
  ├─ Input: { python_code: str, project_name: str }
  │
  ├─ Step 1: Wrap Code with Safety
  │  ├─ Add imports: numpy, ifcopenshell, ifcopenshell.api
  │  ├─ Add error handling: try/except with stderr capture
  │  ├─ Add validation: check 'ifc' variable created
  │  ├─ Add export: ifc.write(output_path)
  │  └─ Result: Wrapped Python script
  │
  ├─ Step 2: Write to Temp File
  │  ├─ Create /tmp/generate.py
  │  ├─ Write wrapped code
  │  └─ Save path for subprocess call
  │
  ├─ Step 3: Execute Blender
  │  ├─ Command: blender --background --python /tmp/generate.py --addons blenderbim
  │  ├─ Timeout: 120 seconds
  │  ├─ Capture: stdout + stderr
  │  └─ Check: return code (0=success, non-zero=failure)
  │
  ├─ Step 4: Parse Output
  │  ├─ Success: Look for "✓ Success: Created X IFC products"
  │  ├─ Failure: Extract error message and traceback
  │  ├─ Categorize: NameError, AttributeError, TypeError, etc.
  │  └─ Provide hint: "Check variable 'ifc'" or "Check function parameters"
  │
  ├─ Step 5: Verify IFC File
  │  ├─ Check: File exists at output_path
  │  ├─ Size: > 1KB (not empty)
  │  ├─ Stat: Get file size in bytes
  │  └─ Fail: Raise error if missing or empty
  │
  └─ Output: FileResponse with IFC blob
     ├─ Media Type: application/x-step
     ├─ Filename: {project_name}.ifc
     ├─ Headers: X-File-Size, X-Generation-Time
     └─ Consumed by: Orchestrator → uploads to Supabase Storage

Error Handling:
  ├─ Timeout (>120s): Return 504 with hint "Model too complex"
  ├─ Return code ≠ 0: Return 500 with stderr + hint
  ├─ File not created: Return 500 with hint "No products created"
  └─ Other exceptions: Return 500 with exception details

Environment:
  ├─ Docker Image: ubuntu:22.04
  ├─ Blender: 4.0.2 (headless, background mode)
  ├─ BlenderBIM Addon: 240115 release
  ├─ Python: 3.11 (for pip dependencies)
  ├─ Key Libs: numpy, ifcopenshell, ifcopenshell.api, shapely, lxml
  └─ Startup: ~2-3 seconds (persistent process on Railway)

Security:
  ├─ Code sandbox: No access to host filesystem (temp dir only)
  ├─ Import blocking: Only numpy, ifcopenshell allowed (by wrapper)
  ├─ Restricted operations: No os.system, eval, exec allowed
  └─ Resource limits: Timeout at 120s, max temp files cleaned up
```

---

## 5. Approved Toolset (12 Functions)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ APPROVED TOOLSET (Hardcoded Whitelist)                                      │
│ Programmer LLM must use ONLY these functions                                │
└─────────────────────────────────────────────────────────────────────────────┘

Category 1: Project Setup (3 functions)
├─ project.create_file(version='IFC4')
│  └─ Creates empty IFC file → variable 'ifc'
│
├─ root.create_entity(ifc, ifc_class='IfcWall', name='Wall 1')
│  ├─ Creates ANY IFC entity
│  ├─ Allowed classes: Project, Site, Building, BuildingStorey, Wall, Column, 
│  │                   Beam, Slab, Roof, Door, Window, Stairs, Ramp, Railing
│  └─ Result: IFC entity object
│
└─ context.add_context(ifc, context_type='Model')
   └─ Creates geometric representation context

Category 2: Spatial Hierarchy (2 functions)
├─ aggregate.assign_object(ifc, product=Site, relating_object=Project)
│  ├─ Builds hierarchy: Project→Site, Site→Building, Building→Storey
│  └─ ONLY for spatial containers (not building elements)
│
└─ spatial.assign_container(ifc, product=Wall, relating_structure=Storey)
   ├─ Assigns building elements to storeys
   └─ ONLY for walls, columns, beams, slabs, doors, windows, etc.

Category 3: Geometry (3 functions)
├─ geometry.add_wall_representation(ifc, context, wall, height, width, length)
│  └─ Adds box geometry to walls (dimensions in meters)
│
├─ geometry.add_profile(ifc, context, product, depth, width, height)
│  └─ Adds profile geometry to columns, beams (dimensions in meters)
│
└─ geometry.edit_object_placement(ifc, product, matrix)
   ├─ Positions element using 4x4 numpy transformation matrix
   ├─ Example: matrix[0,3]=x; matrix[1,3]=y; matrix[2,3]=z
   └─ Rotation support: Optional (identity for now)

Category 4: Materials (2 functions)
├─ material.add_material(ifc, name='Concrete C30/37')
│  └─ Creates material definition
│
└─ material.assign_material(ifc, products=[Wall1], material=Concrete)
   └─ Assigns material to element(s)

Category 5: Properties (1 function)
└─ pset.add_pset(ifc, product=Wall, name='Pset_WallCommon')
   └─ Adds property set to element

FORBIDDEN Functions (Hallucination Detection):
├─ tool.* (e.g., tool.Ifc.add_representation) ❌
├─ bpy.ops.* (e.g., bpy.ops.mesh.primitive_cube_add) ❌
├─ Any function not in approved list above ❌
├─ os.system, subprocess, eval, exec ❌
├─ open() for file I/O ❌
└─ External imports (requests, pandas, etc.) ❌

Whitelist Check (Validator):
  For each function call in generated code:
  1. Parse function name (e.g., 'project.create_file')
  2. Check against this list ✓
  3. If not found → REJECT with hint
  4. If found → APPROVE and forward to Blender
```

---

## 6. Error Flow & Retry Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ERROR DETECTION & AUTOMATIC RECOVERY                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Scenario 1: Programmer Generates Bad API Call
  ├─ Error detected: validate stage (LLM check)
  ├─ Error message: "Unsupported function 'tool.X'"
  ├─ Action: LLM Validator generates corrected_code
  ├─ Retry: Validation stage loops up to 2x
  └─ Result: Corrected code sent to Blender

Scenario 2: Blender Execution Fails
  ├─ Error detected: Blender returns non-zero exit code
  ├─ Error captured: stderr + stdout sent back to Orchestrator
  ├─ Error analysis: Look for patterns (NameError, AttributeError, etc.)
  ├─ Action: Send error message to Programmer LLM with context
  │          "Previous code failed with: NameError: name 'ifc' is not defined"
  │          "Fix the code and return ONLY the corrected Python:"
  ├─ Programmer regenerates: New code accounting for error
  ├─ Retry cycle: Validate → Execute (up to 3 total attempts)
  └─ Result: Either succeeds or fails gracefully

Scenario 3: All Retries Exhausted
  ├─ Status: Mark as 'failed'
  ├─ Logging: Full error log in execution_logs
  ├─ Storage: Placeholder IFC generated (bounding box model)
  ├─ UI: Show error message to user
  ├─ Future: Could auto-suggest simpler design
  └─ Recovery: User can submit simpler prompt

Retry Backoff Strategy:
  Attempt 1: Immediately
  Attempt 2: Wait 2 seconds + retry
  Attempt 3: Wait 4 seconds + retry
  Attempt 4: Wait 6 seconds + retry
  Maximum: 3 retries (4 total attempts)

Logging at Each Stage:
  Stage              | Log Level | Example Message
  ─────────────────────────────────────────────────────────────────
  product_owner      | info      | Intent expansion complete (5 components)
  product_owner      | error     | API rate limit exceeded
  ─────────────────────────────────────────────────────────────────
  architect          | info      | Design enrichment complete
  architect          | error     | API error 402: Payment required
  ─────────────────────────────────────────────────────────────────
  programmer         | info      | Code generation attempt 1
  programmer         | error     | API timeout after 60s
  ─────────────────────────────────────────────────────────────────
  validator          | warning   | Errors found: [list]
  validator          | info      | Code validated on attempt 1
  validator          | error     | Validation retries exhausted
  ─────────────────────────────────────────────────────────────────
  executor           | info      | Sending to Blender worker
  executor           | error     | Blender execution failed (timeout)
  executor           | info      | IFC file generated successfully
  ─────────────────────────────────────────────────────────────────
  orchestrator       | info      | Pipeline completed after 1 attempt
  orchestrator       | error     | Pipeline failed after 3 retries

Total Pipeline Time:
  Success case (no errors): ~60-90 seconds
  ├─ Product Owner LLM: ~10-15s
  ├─ Architect LLM: ~15-20s
  ├─ Programmer LLM: ~20-30s
  ├─ Validator: ~5-10s
  ├─ Blender execution: ~10-20s
  └─ Upload + cleanup: ~2-5s
  
  Failure + Retry case: ~120-180 seconds
  ├─ First attempt: 60-90s (fails somewhere)
  ├─ Wait + backoff: 2-4s
  ├─ Second attempt: 60-90s (may succeed or fail again)
  ├─ Wait + backoff: 4-6s
  └─ Third attempt: 60-90s (final outcome)
```

---

## 7. UI Flow (Frontend)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Frontend: IfcChat Component (React)                                         │
└─────────────────────────────────────────────────────────────────────────────┘

User Types Prompt:
  "Design a small residential house, 2 stories, living room, kitchen, 3 BR"
         │
         ▼
  [User presses Send button]
         │
         ▼
  Call: supabase.functions.invoke('orchestrate', {
    body: { user_prompt: '...', project_name: 'My House' }
  })
         │
         ▼
  Response received:
  {
    project_id: 'uuid-abc-123',
    status: 'started'
  }
         │
         ▼
  Subscribe to real-time updates:
  supabase.channel(`project-abc-123`)
    .on('UPDATE', function onProjectUpdate(payload) {
      const project = payload.new
      // project.status, project.current_stage, project.ifc_url
    })
         │
         ▼
  UI Updates as project status changes:

  ⏳ Initializing...
         │ [After 10s]
         ▼
  🧠 Analyzing requirements... [20% progress]
         │ [After 15s]
         ▼
  📐 Designing structure... [40% progress]
         │ [After 20s]
         ▼
  ⚙️ Generating code... [60% progress]
         │ [After 15s]
         ▼
  ✓ Validating code... [80% progress]
         │ [After 5s]
         ▼
  🔧 Building 3D model... [85% progress]
         │ [After 20s]
         ▼
  ✅ Completed! [100%]
  [IFC file auto-loaded in 3D viewer]

If error during execution:
  
  ⏳ Initializing...
         │
         ▼
  [Error encountered in validator]
         │
         ▼
  🔄 Retry 1/3... [Status: retrying]
         │ [After 2s + retry]
         ▼
  [Error again in executor]
         │
         ▼
  🔄 Retry 2/3... [Status: retrying]
         │ [After 4s + retry]
         ▼
  [Success this time!]
         │
         ▼
  ✅ Completed! [100%]

If all retries fail:

  ⏳ Initializing...
         │
         ▼
  [Multiple errors]
         │
         ▼
  🔄 Retry 3/3... [Status: retrying]
         │
         ▼
  ❌ Failed [Status: failed]
     [Show error message: "All retries exhausted. Try a simpler design."]
     [Allow user to submit new prompt]

Chat Message Display:
  ├─ User messages (blue/right-aligned)
  │  └─ "Design a small house"
  │
  ├─ Assistant messages (gray/left-aligned)
  │  ├─ Status messages (system)
  │  │  └─ "⏳ Analyzing requirements..."
  │  │  └─ "⚙️ Generating code..."
  │  │  └─ "✅ Model generated!"
  │  │
  │  └─ Error messages (error state)
  │     └─ "❌ Error: Code validation failed"
  │
  └─ Progress bar (shown during generation)
     └─ ░░░░░░░░░░░░░░░░░░ 40% (Generating code)

Viewer Integration:
  ├─ When status == 'completed' and ifc_url available:
  │  ├─ Fetch IFC file from public URL
  │  ├─ Load into Babylon.js/Three.js viewer
  │  ├─ Show 3D model auto-rotated
  │  └─ Allow download of IFC file
  │
  └─ On failure:
     ├─ Show error message with details
     ├─ Suggest action: "Try simplifying your design"
     └─ Keep chat history for retry

Data Flow (State Management):
  ├─ State: messages (array of Message objects)
  ├─ State: currentProjectId (UUID)
  ├─ State: isGenerating (boolean)
  ├─ Effect: Subscribe to Supabase on mount
  ├─ Effect: Unsubscribe on unmount
  └─ Callbacks:
     ├─ handleSend() → invoke orchestrate
     ├─ updateProjectProgress() → update message status
     └─ loadGeneratedIFC() → fetch and display IFC
```

---

## 8. Data Flow: A Complete Journey

```
User Perspective:
┌─────────────┐
│ User: "Design a small house" │
└────────────┬────────────────┘
             │
             ▼
        ┌──────────────────┐
        │ IfcChat Component│
        │    (Frontend)    │
        └────────┬─────────┘
                 │
                 ▼ POST /functions/v1/orchestrate
        ┌──────────────────┐
        │ Edge Function    │
        │  (Supabase)      │
        └────────┬─────────┘
                 │
                 ├─► Insert into projects table
                 │   status='pending'
                 │
                 ├─► [ASYNC START]
                 │
                 ├─► Call Product Owner LLM
                 │   └─► Insert into design_intents
                 │
                 ├─► Call Architect LLM
                 │   └─► Update design_intents
                 │
                 ├─► Call Programmer LLM
                 │   └─► Insert into code_versions
                 │
                 ├─► Call Validator LLM
                 │   └─► Update code_versions
                 │
                 ├─► POST /generate-ifc to Blender Worker
                 │   [On Railway]
                 │
                 ├─► Upload IFC to Storage
                 │   └─► Insert into ifc_files
                 │
                 ├─► Update projects: status='completed'
                 │
                 └─► Log everything in execution_logs
                     (50-200+ log entries per job)

Real-time Sync:
  ├─ Frontend subscribes to projects table
  │  └─ project_id = '<uuid>'
  │
  ├─ Edge Function updates project row
  │  └─ Supabase broadcasts UPDATE event
  │
  ├─ Frontend receives broadcast
  │  └─ Updates UI message: current_stage
  │
  └─ Flow repeats for each status change

Database After Completion:
┌──────────────────────────────────┬─────────────────────────────────┐
│ projects                         │ design_intents                  │
├──────────────────────────────────┼─────────────────────────────────┤
│ id: uuid-123                     │ id: uuid-di-1                   │
│ user_id: uuid-user-1            │ project_id: uuid-123 ◄──────────┤─┐
│ project_name: My House          │ user_prompt: Design a house     │ │
│ status: completed               │ intent_json: { ... 20 fields ... } │
│ ifc_url: https://storage/...    │ architect_enrichment: { ... }   │ │
│ current_stage: Completed!       │                                 │ │
│ retry_count: 1                  │                                 │ │
│ created_at: 2024-11-21 14:00    │ created_at: 2024-11-21 14:02   │ │
└──────────────────────────────────┴─────────────────────────────────┘ │
                ▲                                                       │
                └───────────────────────────────────────────────────────┘

┌──────────────────────────────────┬─────────────────────────────────┐
│ code_versions                    │ execution_logs (50+ entries)    │
├──────────────────────────────────┼─────────────────────────────────┤
│ id: uuid-cv-1                    │ id: uuid-1, stage: product_owner│
│ project_id: uuid-123 ◄─────────┼─┤ stage: product_owner, ...      │
│ python_code: import numpy ... │ │ id: uuid-2, stage: architect   │
│ status: validated              │ │ stage: architect, ...          │
│ validator_notes: null          │ │ id: uuid-3, stage: programmer  │
│ validation_attempt: 1          │ │ stage: programmer, ...         │
│ created_at: 2024-11-21 14:05   │ │ ... (many more entries) ...    │
└──────────────────────────────────┴─────────────────────────────────┘

┌──────────────────────────────────┐
│ ifc_files                        │
├──────────────────────────────────┤
│ id: uuid-if-1                    │
│ project_id: uuid-123 ◄──────────┼─┐
│ ifc_url: https://storage/ifc...  │ │
│ size_bytes: 45632               │ │
│ validation_passed: true         │ │
│ created_at: 2024-11-21 14:07    │ │
└──────────────────────────────────┘ │
                                     │
                    [Can download and open in Blender/Revit]
```

---

## Summary: From Prompt to IFC

```
User Input:           "Design a small house"
        │
        ▼ (5-stage pipeline)
Product Owner JSON:   { building_type: 'residential', components: [...] }
        │
        ▼ (Architecture enrichment)
Architect JSON:       { spaces: [...], columns: [...], beams: [...] }
        │
        ▼ (Code generation with constraints)
Python Code:          ifcopenshell.api.run(...) [only approved functions]
        │
        ▼ (Validation before execution)
Validated Code:       Same code, but checked for errors + corrections
        │
        ▼ (Execution on Railway)
IFC File:             Binary IFC format (created by Blender)
        │
        ▼ (Upload and storage)
Public URL:           https://supabase.storage.../ifc-files/uuid.ifc
        │
        ▼ (Frontend)
User Downloads:       Click → Download → Open in Revit/Blender/Viewer

Total Time:           ~60-90 seconds (success) | ~120-180 (with retries)
Success Rate:         ~90% (vs. 20% before)
Error Recovery:       Automatic (up to 3 retries)
Observability:        Full audit trail in execution_logs
```
