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

// Helper to log to database
async function logToDatabase(supabase: any, taskId: string, stage: string, level: string, message: string, metadata?: any) {
  await supabase.from('ifc_generation_logs').insert({
    task_id: taskId,
    stage,
    level,
    message,
    metadata
  });
  console.log(`[${stage}] ${level}: ${message}`, metadata || '');
}

// Helper to update task status
async function updateTaskStatus(supabase: any, taskId: string, updates: any) {
  const { error } = await supabase
    .from('ifc_generation_tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', taskId);
  
  if (error) {
    console.error('Failed to update task status:', error);
  }
}

// Helper: sanitize known BlenderBIM pitfalls in generated code
function sanitizeBlenderBimCode(code: string): string {
  let sanitized = code;

  // Remove forbidden name= parameter from context.add_context calls
  sanitized = sanitized.replace(
    /(ifcopenshell\.api\.run\(\s*["']context\.add_context["']\s*,[^)]*?),\s*name\s*=\s*["'][^"']*["']/g,
    '$1'
  );

  // Remove deprecated/invalid project= parameter from context.add_context
  sanitized = sanitized.replace(
    /(ifcopenshell\.api\.run\(\s*["']context\.add_context["']\s*,[^)]*?),\s*project\s*=\s*[^,)]+/g,
    '$1'
  );

  return sanitized;
}

// Stage 1: Parse intent into structured design spec
async function parseIntent(supabase: any, taskId: string, userPrompt: string, apiKey: string): Promise<any> {
  await logToDatabase(supabase, taskId, 'intent_parsing', 'info', 'Starting intent parsing');
  await updateTaskStatus(supabase, taskId, { 
    status: 'intent_parsing',
    current_stage: 'Analyzing your design requirements...'
  });

  const systemPrompt = `You are a professional structural engineer analyzing building design requirements. Your job is to extract COMPLETE specifications from the user's prompt.

CRITICAL REQUIREMENTS:
1. Extract or infer ALL necessary dimensions (length, width, height, thickness)
2. Determine appropriate materials for each component
3. Specify exact positions and orientations
4. Define load-bearing requirements
5. Include all structural relationships
6. Use metric units (meters)

If the user's prompt lacks specific details, you MUST:
- Infer industry-standard dimensions based on building type and codes
- Select appropriate materials based on structural requirements
- Calculate reasonable positions based on spatial relationships
- Apply standard construction practices

For example:
- Standard residential wall height: 2.7-3.0m
- Typical wall thickness: 0.2-0.3m for exterior, 0.1-0.15m for interior
- Foundation depth: based on building height and soil conditions
- Column spacing: 4-6m for residential, 6-8m for commercial
- Beam depths: span/12 to span/15 for steel, span/10 to span/12 for concrete

Output a JSON object with this exact structure:
{
  "building_type": "residential/commercial/industrial",
  "components": [
    {
      "type": "wall/floor/roof/door/window/column/beam/foundation/slab",
      "dimensions": {"length": number, "width": number, "height": number, "thickness": number},
      "position": {"x": number, "y": number, "z": number},
      "material": "concrete/steel/wood/glass/brick/stone",
      "structural_role": "load_bearing/non_load_bearing/foundation",
      "properties": {"grade": "C30/37", "reinforcement": "details"}
    }
  ],
  "spaces": [
    {
      "name": "room name",
      "area": number,
      "floor_level": number,
      "ceiling_height": number,
      "function": "bedroom/kitchen/office/etc"
    }
  ],
  "relationships": [
    {
      "parent": "component_name",
      "children": ["component_name"],
      "connection_type": "bearing/bolted/welded"
    }
  ],
  "engineering_notes": "Any assumptions made or standards applied"
}

BE THOROUGH. Include foundations, structural grid, all walls, slabs, roof structure, and connections.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      throw new Error(`Intent parsing failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const designIntent = JSON.parse(data.choices[0].message.content);

    await updateTaskStatus(supabase, taskId, {
      design_intent: designIntent,
      intent_status: 'completed'
    });

    await logToDatabase(supabase, taskId, 'intent_parsing', 'info', 'Intent parsing completed', { designIntent });
    return designIntent;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToDatabase(supabase, taskId, 'intent_parsing', 'error', errorMessage);
    throw error;
  }
}

// Stage 2: Generate BlenderBIM Python code
async function generateCode(supabase: any, taskId: string, designIntent: any, apiKey: string, attempt: number = 0): Promise<string> {
  await logToDatabase(supabase, taskId, 'code_generation', 'info', `Generating code (attempt ${attempt + 1})`);
  await updateTaskStatus(supabase, taskId, { 
    status: 'code_generation',
    current_stage: 'Generating Python code for your model...',
    code_generation_attempts: attempt + 1
  });

  const systemPrompt = `You are an expert BlenderBIM Python code generator with deep knowledge of the execution environment and backend toolset.

=== EXECUTION ENVIRONMENT ===
- Docker container on Railway (blenderbim-backend)
- Blender 4.0.2 running headless with BlenderBIM addon
- Python 3.10 with ifcopenshell library
- Backend API: POST /generate-ifc at ${Deno.env.get('PYTHON_BACKEND_URL') || 'railway-backend'}
- All dimensions are in METERS

=== BACKEND TOOLSET REFERENCE (42 FUNCTIONS) ===
The backend has these pre-built functions in blender_generator.py that you can learn from:

**BASIC SHAPES (6)**
- create_box: width, height, depth, x, y, z, color, name
- create_cylinder: radius, height, x, y, z, color, name
- create_sphere: radius, x, y, z, color, name
- create_cone: radius, height, x, y, z, color, name
- create_torus: radius, tube, x, y, z, color, name
- create_plane: width, height, x, y, z, color, name

**BASIC BIM ELEMENTS (8)**
- create_wall: length, height, thickness (typical 0.2m), x, y, z, color, name
- create_slab: length, width, thickness (typical 0.15-0.2m), x, y, z, color, name
- create_door: width (typical 0.9m), height (typical 2.1m), thickness, x, y, z, color, name
- create_window: width, height, thickness, x, y, z, color, name
- create_column: width, depth (typical 0.3x0.3m), height, x, y, z, color, name
- create_beam: length, width, height (typical 0.3x0.4m), x, y, z, color, name
- create_roof: length, width, thickness, x, y, z, color, name
- create_stairs: width, height, depth, num_steps, x, y, z, color, name

**STRUCTURAL FOUNDATIONS (3)**
- create_footing: width, depth, thickness, x, y, z, color, name
- create_pile: diameter, length, x, y, z, name
- create_pile_cap: width, depth, thickness, x, y, z, name

**STRUCTURAL FRAMING (4)**
- create_truss: length, height, width, x, y, z, name
- create_brace: length, width, height, x, y, z, angle, name
- create_plate: length, width, thickness, x, y, z, name
- create_reinforcing_bar: diameter, length, x, y, z, name

**ARCHITECTURAL ELEMENTS (5)**
- create_ramp: length, width, height, x, y, z, color, name
- create_railing: length, height, x, y, z, color, name
- create_curtain_wall: length, height, x, y, z, color, name
- create_ceiling: length, width, thickness, x, y, z, color, name
- create_covering: length, width, thickness, x, y, z, color, name

**MEP SYSTEMS (10)**
- create_duct: length, width, height, x, y, z, color, name
- create_pipe: diameter, length, x, y, z, color, name
- create_cable_carrier: width, height, length, x, y, z, color, name
- create_hvac_equipment: width, height, depth, x, y, z, color, name
- create_pump: width, height, depth, x, y, z, color, name
- create_valve: diameter, x, y, z, color, name
- create_sensor: x, y, z, color, name
- create_light_fixture: width, height, depth, x, y, z, color, name
- create_electrical_outlet: x, y, z, color, name
- create_switch: x, y, z, color, name

**FURNISHING (3)**
- create_furniture: width, height, depth, x, y, z, color, name
- create_cabinet: width, height, depth, x, y, z, color, name
- create_countertop: length, width, thickness, x, y, z, color, name

**SITE ELEMENTS (4)**
- create_pavement: length, width, thickness, x, y, z, color, name
- create_kerb: length, width, height, x, y, z, color, name
- create_parking_space: length, width, x, y, z, color, name
- create_signage: width, height, x, y, z, color, name

All backend functions use:
- Dimensions in METERS
- Colors in hex format (e.g., "#808080")
- Proper IFC class assignment (IfcWall, IfcColumn, IfcSlab, etc.)
- Material application with color rendering

=== CODE WRAPPER STRUCTURE ===
Your code will be wrapped like this:

import sys
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.geom
from blenderbim.bim.ifc import IfcStore

try:
    # === YOUR CODE GOES HERE ===
    [YOUR CODE]
    # === END YOUR CODE ===
    
    # Wrapper stores in IfcStore and exports
    if 'ifc' in locals():
        IfcStore.file = ifc
        ifc.write(output_path)
    else:
        raise RuntimeError("Variable 'ifc' not found")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {str(e)}", file=sys.stderr)
    sys.exit(1)

=== CRITICAL RULES ===
1. ✓ DO: Create 'ifc' variable via project.create_file
2. ✓ DO: Use ifcopenshell.api.run() for ALL IFC operations
3. ✓ DO: Use parameter names EXACTLY (product= not products=)
4. ✓ DO: Convert dimensions to METERS (walls: 0.2m, columns: 0.3x0.3m, slabs: 0.15m)
5. ✓ DO: Use proper IFC classes (IfcWall, IfcColumn, IfcSlab, IfcBeam, IfcDoor, IfcWindow)
6. ✓ DO: Add geometry representations for visibility in viewers
7. ✗ DON'T: Add import statements (wrapper provides them)
8. ✗ DON'T: Add try/except blocks (wrapper handles errors)
9. ✗ DON'T: Assign to IfcStore.file (wrapper does this)
10. ✗ DON'T: Call ifc.write() (wrapper exports automatically)
11. ✗ DON'T: Use name= parameter in context.add_context

=== SPATIAL HIERARCHY ===
Use aggregate.assign_object for spatial containers:
- Project → Site: aggregate.assign_object(ifc, product=site, relating_object=project)
- Site → Building: aggregate.assign_object(ifc, product=building, relating_object=site)
- Building → Storey: aggregate.assign_object(ifc, product=storey, relating_object=building)

Use spatial.assign_container for building elements:
- Wall → Storey: spatial.assign_container(ifc, product=wall, relating_structure=storey)
- Column → Storey: spatial.assign_container(ifc, product=column, relating_structure=storey)

=== IFCOPENSHELL API REFERENCE ===
- project.create_file: version="IFC4"
- root.create_entity: ifc, ifc_class="IfcWall|IfcColumn|etc", name="Name"
- context.add_context: ifc, context_type="Model" (NO name parameter!)
- aggregate.assign_object: ifc, product=child, relating_object=parent
- spatial.assign_container: ifc, product=element, relating_structure=container
- geometry.add_wall_representation: ifc, context=context, wall=wall, height=3.0, width=0.2, length=5.0
- geometry.edit_object_placement: ifc, product=element, matrix=matrix

=== EXAMPLE WITH GEOMETRY ===
import numpy as np

# Create IFC file
ifc = ifcopenshell.api.run("project.create_file", version="IFC4")
project = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcProject", name="Building")
context = ifcopenshell.api.run("context.add_context", ifc, context_type="Model")

# Spatial hierarchy
site = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcSite", name="Site")
building = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcBuilding", name="Building")
storey = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcBuildingStorey", name="Ground Floor")

ifcopenshell.api.run("aggregate.assign_object", ifc, product=site, relating_object=project)
ifcopenshell.api.run("aggregate.assign_object", ifc, product=building, relating_object=site)
ifcopenshell.api.run("aggregate.assign_object", ifc, product=storey, relating_object=building)

# Create wall with geometry
wall = ifcopenshell.api.run("root.create_entity", ifc, ifc_class="IfcWall", name="Wall 1")
ifcopenshell.api.run("spatial.assign_container", ifc, product=wall, relating_structure=storey)
ifcopenshell.api.run("geometry.add_wall_representation", ifc, context=context, wall=wall, height=3.0, width=0.2, length=5.0)

# Position wall
matrix = np.eye(4)
matrix[0, 3] = 0.0  # X
matrix[1, 3] = 0.0  # Y
matrix[2, 3] = 0.0  # Z
ifcopenshell.api.run("geometry.edit_object_placement", ifc, product=wall, matrix=matrix)

=== YOUR TASK ===
Generate production-ready BlenderBIM code for this design:
${JSON.stringify(designIntent, null, 2)}

GUIDELINES:
1. Study the backend toolset above to understand supported IFC elements
2. Create proper spatial hierarchy (Project → Site → Building → Storey → Elements)
3. Convert ALL dimensions to meters (typical: walls 0.2m, columns 0.3x0.3m, slabs 0.15-0.2m)
4. Use correct IFC classes for each element type
5. Add geometry representations so elements are visible
6. Position elements with matrix transformations using numpy
7. Group similar elements logically

Return ONLY the Python code, no markdown fences or explanations.`;

  try {
    await logToDatabase(supabase, taskId, 'code_generation', 'info', 'Calling Gemini Pro API...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for code gen

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the BlenderBIM code for this design.' }
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    await logToDatabase(supabase, taskId, 'code_generation', 'info', `API responded with status ${response.status}`);

    if (!response.ok) {
      await logToDatabase(supabase, taskId, 'code_generation', 'error', `API error status: ${response.status}`);
      let errorText;
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read error response';
      }
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      throw new Error(`Code generation failed (${response.status}): ${errorText}`);
    }

    let data;
    try {
      await logToDatabase(supabase, taskId, 'code_generation', 'info', 'Reading response body...');
      const responseText = await response.text();
      await logToDatabase(supabase, taskId, 'code_generation', 'info', `Response body length: ${responseText.length} chars`);
      
      await logToDatabase(supabase, taskId, 'code_generation', 'info', 'Parsing JSON response...');
      data = JSON.parse(responseText);
      await logToDatabase(supabase, taskId, 'code_generation', 'info', `JSON parsed successfully, keys: ${Object.keys(data).join(', ')}`);
      
      await logToDatabase(supabase, taskId, 'code_generation', 'info', `Choices array length: ${data.choices?.length || 0}`);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      await logToDatabase(supabase, taskId, 'code_generation', 'error', `Response parsing failed: ${errorMsg}`);
      throw new Error(`Failed to parse API response: ${errorMsg}`);
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      await logToDatabase(supabase, taskId, 'code_generation', 'error', `Invalid response structure. Data keys: ${JSON.stringify(Object.keys(data))}`);
      throw new Error('Invalid response structure from AI');
    }

    await logToDatabase(supabase, taskId, 'code_generation', 'info', 'Extracting code from response...');
    let code = data.choices[0].message.content;
    await logToDatabase(supabase, taskId, 'code_generation', 'info', `Raw code length: ${code.length} chars`);
    
    // Clean up markdown fences if present
    code = code.replace(/```python\n?/g, '').replace(/```\n?/g, '').trim();
    await logToDatabase(supabase, taskId, 'code_generation', 'info', `Cleaned code length: ${code.length} chars`);

    await logToDatabase(supabase, taskId, 'code_generation', 'info', 'Saving code to database...');
    await updateTaskStatus(supabase, taskId, {
      blender_code: code,
      code_status: 'pending'
    });

    await logToDatabase(supabase, taskId, 'code_generation', 'info', 'Code generated and saved successfully');
    return code;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToDatabase(supabase, taskId, 'code_generation', 'error', errorMessage);
    throw error;
  }
}

// Stage 3: Validate code with retry logic
async function validateCode(supabase: any, taskId: string, code: string, apiKey: string, maxRetries: number = 2): Promise<{ valid: boolean; errors?: any; finalCode: string }> {
  await logToDatabase(supabase, taskId, 'code_validation', 'info', 'Starting code validation');
  await updateTaskStatus(supabase, taskId, { 
    status: 'code_validation',
    current_stage: 'Validating generated code...'
  });

  const systemPrompt = `You are a BlenderBIM code validator with deep knowledge of the execution environment.

=== VALIDATION CHECKLIST ===
1. ✓ Code creates 'ifc' variable using project.create_file
2. ✓ Uses ifcopenshell.api.run() for ALL IFC operations
3. ✓ Uses product= (NOT products=) in spatial.assign_container and aggregate.assign_object
4. ✓ NEVER uses name= parameter in context.add_context
5. ✓ Uses aggregate.assign_object for Site→Project and Building→Site
6. ✓ Uses spatial.assign_container ONLY for building elements→Storey
7. ✗ NO import statements
8. ✗ NO try/except blocks
9. ✗ NO IfcStore.file assignments
10. ✗ NO ifc.write() calls

=== RESPONSE FORMAT ===
If errors found:
{
  "valid": false,
  "errors": ["Specific issue 1", "Specific issue 2"],
  "corrected_code": "COMPLETE corrected code here"
}

If valid:
{ "valid": true }

CRITICAL: If providing corrected_code, include the ENTIRE corrected code, not just snippets.`;

  let currentCode = code;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await logToDatabase(supabase, taskId, 'code_validation', 'info', `Validation attempt ${attempt + 1}/${maxRetries}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Validate and fix if needed:\n\n${currentCode}` }
          ],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        }
        if (response.status === 402) {
          throw new Error('Payment required. Please add credits to your Lovable workspace.');
        }
        throw new Error(`Validation API failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);

      if (result.valid) {
        await updateTaskStatus(supabase, taskId, {
          code_status: 'validated',
          validation_notes: `Code validated after ${attempt + 1} attempt(s)`
        });
        await logToDatabase(supabase, taskId, 'code_validation', 'info', `Code validated successfully on attempt ${attempt + 1}`);
        return { valid: true, finalCode: currentCode };
      }

      // Code has errors
      await logToDatabase(supabase, taskId, 'code_validation', 'warning', `Errors found on attempt ${attempt + 1}`, { errors: result.errors });

      if (result.corrected_code && attempt < maxRetries - 1) {
        // Use corrected code for next validation attempt
        currentCode = result.corrected_code;
        await updateTaskStatus(supabase, taskId, {
          blender_code: currentCode,
          validation_errors: result.errors,
          code_status: 'correcting'
        });
        await logToDatabase(supabase, taskId, 'code_validation', 'info', 'Using AI-corrected code for re-validation');
        attempt++;
        continue;
      }

      // Final attempt or no correction provided
      await updateTaskStatus(supabase, taskId, {
        validation_errors: result.errors,
        code_status: 'error'
      });

      // Return the best code we have (corrected if available)
      return {
        valid: false,
        errors: result.errors,
        finalCode: result.corrected_code || currentCode
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logToDatabase(supabase, taskId, 'code_validation', 'error', errorMessage);
      
      if (attempt >= maxRetries - 1) {
        throw error;
      }
      attempt++;
    }
  }

  // Should not reach here, but return current code if we do
  return { valid: false, errors: ['Validation retries exhausted'], finalCode: currentCode };
}

// Stage 4: Structural review
async function structuralReview(supabase: any, taskId: string, designIntent: any, apiKey: string): Promise<any> {
  await logToDatabase(supabase, taskId, 'structural_review', 'info', 'Starting structural review');
  await updateTaskStatus(supabase, taskId, { 
    status: 'structural_review',
    current_stage: 'Performing structural analysis...'
  });

  const systemPrompt = `You are a structural engineer reviewing building designs. Check for:
1. Structural integrity (missing supports, unrealistic spans)
2. Code compliance (basic building codes)
3. Practical concerns (accessibility, safety)

Return JSON:
{
  "passed": boolean,
  "warnings": ["list of concerns"],
  "recommendations": ["list of improvements"]
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Review this design:\n\n${JSON.stringify(designIntent, null, 2)}` }
        ],
        response_format: { type: "json_object" }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      throw new Error(`Structural review failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const review = JSON.parse(data.choices[0].message.content);

    await updateTaskStatus(supabase, taskId, {
      structural_warnings: review.warnings,
      structural_notes: JSON.stringify(review)
    });

    await logToDatabase(supabase, taskId, 'structural_review', 'info', 'Structural review completed', review);
    return review;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToDatabase(supabase, taskId, 'structural_review', 'error', errorMessage);
    throw error;
  }
}

// Stage 5: Execute on Railway (returns error for retry handling)
async function executeOnRailway(
  supabase: any, 
  taskId: string, 
  code: string, 
  projectName: string, 
  attempt: number = 0
): Promise<{ success: boolean; ifcUrl?: string; error?: string }> {
  await logToDatabase(supabase, taskId, 'execution', 'info', `Executing on Railway (attempt ${attempt + 1}/3)`);
  await updateTaskStatus(supabase, taskId, { 
    status: 'executing',
    current_stage: `Building your 3D model (attempt ${attempt + 1}/3)...`,
    execution_attempts: attempt + 1
  });

  const pythonBackendUrl = Deno.env.get('PYTHON_BACKEND_URL');
  if (!pythonBackendUrl) {
    return { success: false, error: 'PYTHON_BACKEND_URL not configured' };
  }

  const url = pythonBackendUrl.startsWith('http') ? pythonBackendUrl : `https://${pythonBackendUrl}`;

  try {
    const response = await fetch(`${url}/generate-ifc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        python_code: code,
        project_name: projectName || 'AI Generated Model',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logToDatabase(supabase, taskId, 'execution', 'error', `Railway error (attempt ${attempt + 1}/3): ${errorText}`);
      return { success: false, error: errorText };
    }

    // Get IFC file as blob
    const ifcBlob = await response.blob();
    
    // Upload to Supabase Storage
    const fileName = `${taskId}.ifc`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ifc-files')
      .upload(fileName, ifcBlob, {
        contentType: 'application/x-step',
        upsert: true
      });

    if (uploadError) {
      await logToDatabase(supabase, taskId, 'execution', 'error', `Storage upload failed: ${uploadError.message}`);
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('ifc-files')
      .getPublicUrl(fileName);

    await logToDatabase(supabase, taskId, 'execution', 'info', `IFC file generated successfully on attempt ${attempt + 1}/3`, { url: publicUrl });
    return { success: true, ifcUrl: publicUrl };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToDatabase(supabase, taskId, 'execution', 'error', `Execution exception (attempt ${attempt + 1}/3): ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// Helper: Search Tavily for error solutions
async function searchErrorSolutions(railwayError: string, tavilyKey: string): Promise<string> {
  try {
    const errorQuery = `ifcopenshell blenderbim python error fix solution: ${railwayError.substring(0, 200)}`;
    
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: errorQuery,
        search_depth: 'advanced',
        include_domains: [
          'docs.ifcopenshell.org',
          'blenderbim.org',
          'wiki.osarch.org',
          'github.com/IfcOpenShell',
          'stackoverflow.com'
        ],
        max_results: 5
      })
    });

    if (!response.ok) {
      console.error('[Tavily] Search failed:', response.status);
      return '';
    }

    const data = await response.json();
    const results = data.results || [];
    
    return results
      .map((r: any) => `[${r.title}]\n${r.content}\nSource: ${r.url}`)
      .join('\n\n---\n\n');
  } catch (error) {
    console.error('[Tavily] Search error:', error);
    return '';
  }
}

// Helper: Regenerate code based on Railway error
async function regenerateCodeWithError(
  supabase: any,
  taskId: string,
  originalCode: string,
  railwayError: string,
  designIntent: any,
  apiKey: string,
  tavilyKey: string,
  attempt: number
): Promise<string> {
  await logToDatabase(supabase, taskId, 'code_regeneration', 'info', `Regenerating code with error feedback (attempt ${attempt}/3)`);
  await updateTaskStatus(supabase, taskId, {
    status: 'retrying',
    current_stage: `Analyzing error and regenerating code (attempt ${attempt}/3)...`
  });

  // Search Tavily for solutions
  const errorSolutions = await searchErrorSolutions(railwayError, tavilyKey);
  
  if (errorSolutions) {
    await logToDatabase(supabase, taskId, 'code_regeneration', 'info', 'Retrieved error solutions from Tavily');
  } else {
    await logToDatabase(supabase, taskId, 'code_regeneration', 'warning', 'No solutions found from Tavily, proceeding with AI fix only');
  }

  const fixPrompt = `You are an expert BlenderBIM Python code fixer. The following code failed during execution with an error from the Railway backend.

ORIGINAL CODE THAT FAILED:
\`\`\`python
${originalCode}
\`\`\`

RAILWAY BACKEND ERROR:
${railwayError}

${errorSolutions ? `RELEVANT SOLUTIONS FROM DOCUMENTATION:
${errorSolutions}

` : ''}ORIGINAL DESIGN INTENT:
${JSON.stringify(designIntent, null, 2)}

CRITICAL RULES:
1. Fix the specific error that occurred
2. Use ONLY the approved ifcopenshell.api.run functions
3. Ensure proper parameter names (product= not products= for assign functions)
4. NO context.add_context with name= parameter
5. All dimensions in METERS
6. Proper spatial hierarchy: Project → Site → Building → Storey
7. NO imports, NO try/except blocks (handled by wrapper)
8. Return ONLY the corrected Python code, no markdown fences or explanations

Generate the COMPLETE corrected code:`;

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
          { role: 'system', content: 'You are an expert BlenderBIM Python code fixer.' },
          { role: 'user', content: fixPrompt }
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      throw new Error(`AI fix failed: ${response.status}`);
    }

    const data = await response.json();
    let fixedCode = data.choices[0].message.content;
    
    // Clean markdown if present
    fixedCode = fixedCode.replace(/```python\n?/g, '').replace(/```\n?/g, '').trim();

    // Apply the same hard sanitization before re-use
    fixedCode = sanitizeBlenderBimCode(fixedCode);

    await logToDatabase(supabase, taskId, 'code_regeneration', 'info', 'Code regenerated successfully');
    await updateTaskStatus(supabase, taskId, {
      blender_code: fixedCode,
      code_status: 'regenerated'
    });

    return fixedCode;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logToDatabase(supabase, taskId, 'code_regeneration', 'error', errorMessage);
    throw error;
  }
}

// Main orchestrator
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
    
    if (!apiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    // Create task
    const { data: task, error: taskError } = await supabase
      .from('ifc_generation_tasks')
      .insert({
        user_id: user?.id,
        user_prompt,
        project_name,
        status: 'pending',
        current_stage: 'Initializing...'
      })
      .select()
      .single();

    if (taskError) throw taskError;

    const taskId = task.id;

    // Start async pipeline (runs in background) - wrapped with waitUntil to prevent premature shutdown
    const pipelinePromise = (async () => {
      try {
        const maxRetries = 3;
        const tavilyKey = Deno.env.get('TAVILY_API_KEY');
        
        if (!tavilyKey) {
          await logToDatabase(supabase, taskId, 'pipeline', 'warning', 'TAVILY_API_KEY not configured - retries will proceed without documentation search');
        }

        // Stage 1: Parse intent (only once)
        const designIntent = await parseIntent(supabase, taskId, user_prompt, apiKey);

        // Stage 2: Generate initial code (only once)
        let code = await generateCode(supabase, taskId, designIntent, apiKey, 0);

        // Apply hard sanitization to guard against known BlenderBIM API pitfalls
        code = sanitizeBlenderBimCode(code);

        // Stage 3: Validate code (has internal retry logic)
        const validationResult = await validateCode(supabase, taskId, code, apiKey);
        
        // Use the final validated/corrected code and sanitize again
        code = sanitizeBlenderBimCode(validationResult.finalCode);
        await updateTaskStatus(supabase, taskId, {
          blender_code: code,
          code_status: validationResult.valid ? 'validated' : 'corrected'
        });

        if (!validationResult.valid) {
          await logToDatabase(supabase, taskId, 'code_validation', 'warning', 
            'Proceeding with best available code despite validation concerns', 
            { errors: validationResult.errors }
          );
        }

        // Stage 4: Structural review (non-blocking)
        await structuralReview(supabase, taskId, designIntent, apiKey);

        // Stage 5: Execute with retry loop (up to 3 attempts)
        let executionAttempt = 0;
        let executionResult = await executeOnRailway(supabase, taskId, code, project_name || 'AI Model', executionAttempt);
        
        // Retry loop for execution errors
        while (!executionResult.success && executionAttempt < maxRetries - 1) {
          executionAttempt++;
          
          await logToDatabase(supabase, taskId, 'pipeline', 'info', 
            `Execution failed on attempt ${executionAttempt}/${maxRetries}, starting retry with error feedback`
          );
          
          // Regenerate code based on Railway error
          try {
            code = await regenerateCodeWithError(
              supabase,
              taskId,
              code,
              executionResult.error || 'Unknown error',
              designIntent,
              apiKey,
              tavilyKey || '',
              executionAttempt + 1
            );
            
            // Try executing the regenerated code
            executionResult = await executeOnRailway(supabase, taskId, code, project_name || 'AI Model', executionAttempt);
            
            // If successful on first retry
            if (executionResult.success && executionAttempt === 1) {
              await logToDatabase(supabase, taskId, 'pipeline', 'info', 
                '🎉 Model generated successfully on first retry!',
                { ifcUrl: executionResult.ifcUrl }
              );
            }
            
          } catch (regenError) {
            const errorMsg = regenError instanceof Error ? regenError.message : String(regenError);
            await logToDatabase(supabase, taskId, 'pipeline', 'error', `Code regeneration failed: ${errorMsg}`);
            
            // Continue to next attempt or fail
            if (executionAttempt >= maxRetries - 1) {
              executionResult = { success: false, error: `Code regeneration failed: ${errorMsg}` };
              break;
            }
          }
        }
        
        // Check final result
        if (!executionResult.success) {
          const finalMessage = `Pipeline failed after ${executionAttempt + 1} execution attempts: ${executionResult.error}`;
          
          await updateTaskStatus(supabase, taskId, {
            status: 'failed',
            current_stage: 'Failed',
            last_error: executionResult.error,
            total_retries: executionAttempt + 1,
            completed_at: new Date().toISOString()
          });
          
          await logToDatabase(supabase, taskId, 'pipeline', 'error', finalMessage);
          return;
        }
        
        // Success!
        const successMessage = executionAttempt === 0
          ? 'Pipeline completed successfully on first attempt!'
          : `Pipeline completed successfully after ${executionAttempt + 1} execution attempts!`;
        
        await updateTaskStatus(supabase, taskId, {
          ifc_file_url: executionResult.ifcUrl,
          status: 'completed',
          current_stage: 'Completed!',
          total_retries: executionAttempt,
          completed_at: new Date().toISOString()
        });
        
        await logToDatabase(supabase, taskId, 'pipeline', 'info', successMessage, {
          ifcUrl: executionResult.ifcUrl,
          attempts: executionAttempt + 1
        });
        
        return;

      } catch (stageError) {
        const errorMessage = stageError instanceof Error ? stageError.message : String(stageError);
        
        await logToDatabase(supabase, taskId, 'pipeline', 'error', 
          `Pipeline stage error: ${errorMessage}`
        );

        await updateTaskStatus(supabase, taskId, {
          last_error: errorMessage,
          status: 'failed',
          current_stage: 'Failed',
          completed_at: new Date().toISOString()
        });

        await logToDatabase(supabase, taskId, 'pipeline', 'error', 'Pipeline stage failed');
      }
    })();

    // Return task ID immediately
    return new Response(
      JSON.stringify({ task_id: taskId, status: 'started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Pipeline error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
