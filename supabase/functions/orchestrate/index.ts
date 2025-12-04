import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { apiValidator } from "./api-loader.ts";

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

// ==================== TAVILY SEARCH ====================
async function searchDocs(query: string, apiKey: string): Promise<string> {
  try {
    console.log('[tavily] Searching:', query);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'advanced',
        include_domains: [
          'docs.ifcopenshell.org',
          'blenderbim.org',
          'wiki.osarch.org',
          'github.com/IfcOpenShell'
        ],
        max_results: 5
      })
    });

    if (!response.ok) {
      console.error('[tavily] API error:', response.status);
      return '';
    }

    const data = await response.json();
    const results = data.results || [];
    
    const docSnippets = results
      .map((r: any) => `[${r.title}]\n${r.content}\nSource: ${r.url}`)
      .join('\n\n---\n\n');
    
    console.log('[tavily] Found', results.length, 'results');
    return docSnippets;
  } catch (error) {
    console.error('[tavily] Search failed:', error);
    return '';
  }
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
    const productOwnerPrompt = `You are PRODUCT_OWNER. Your job is to expand vague user descriptions into complete, unambiguous building specifications.

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
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: productOwnerPrompt },
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
    const architectPrompt = `You are ARCHITECT. You take the Product Owner's specifications and create a detailed, realizable BIM design.

INPUT: Building specification JSON from Product Owner

OUTPUT: Enhanced JSON with:
1. Detailed spatial layout (X,Y,Z positions for every component)
2. Structural grid (column spacing, load paths)
3. Floor plans with wall arrangements
4. Material specifications
5. Engineering notes

CRITICAL: Use standard dimensions where missing:
- Residential ceiling height: 2.7m
- Commercial ceiling height: 3.0-3.5m
- Typical column grid: 6m x 8m
- Standard wall thickness: exterior 0.25m, interior 0.12m
- Door width: 0.9m, height: 2.1m
- Window width: 1.5m, height: 1.2m

Return ONLY valid JSON. No markdown. No explanations.`;

    await logStage(supabase, projectId, 'architect', 'info', 'Calling AI gateway for design');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: architectPrompt },
          { role: 'user', content: JSON.stringify(intent) }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    await logStage(supabase, projectId, 'architect', 'info', 'Received AI response for design');

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
  tavilyKey: string,
  attempt: number = 0
): Promise<string> {
  await logStage(supabase, projectId, 'programmer', 'info', `Code generation attempt ${attempt + 1}`);
  await updateProject(supabase, projectId, { 
    current_stage: `Generating code (attempt ${attempt + 1}/3)...`
  });

  try {
    // Get complete API list with signatures
    const apiListWithSignatures = apiValidator.formatAPIListForPrompt();
    
    await logStage(supabase, projectId, 'programmer', 'info', 'Loaded complete API signatures', { 
      totalAPIs: apiValidator.getAllAPIs().length
    });

    const programmerPrompt = `You are PROGRAMMER. Generate Python code to create the BIM model using ONLY approved IfcOpenShell APIs with EXACT signatures.

BACKEND ENVIRONMENT:
- Blender: 4.2.0
- BlenderBIM: 240602
- IfcOpenShell: 0.8.x (June 2024)
- Python: 3.11

===== CRITICAL: USE ACTUAL API SIGNATURES =====

Below are COMPLETE function signatures from Railway introspection.
These are ACTUAL signatures - NOT assumptions.

DO NOT hallucinate or assume parameter names.
DO NOT guess parameter types.
VERIFY every parameter against the actual signatures provided.

===== COMPLETE API SIGNATURES =====

${apiListWithSignatures}

===== MANDATORY CONSTRAINTS =====

1. ✓ ONLY use APIs with signatures provided above
2. ✓ ONLY use parameter names from actual signatures
3. ✓ Start with: ifc = ifcopenshell.api.run("project.create_file", version="IFC4")
4. ✓ Structure: Project → Site → Building → Storey → Elements
5. ✓ ALL elements MUST be assigned to storey
6. ✓ ALL elements MUST have geometry
7. ✓ Use numpy for matrices: import numpy as np
8. ✓ Use named parameters for all API calls
9. ✓ NO file I/O, NO system calls, NO eval/exec, NO try/except
10. ✓ NO bpy.* calls, NO tool.* calls
11. ✓ Return ONLY Python code, no markdown

INPUT DESIGN (JSON):
${JSON.stringify(design)}

OUTPUT: Complete, executable Python code using ONLY APIs with EXACT signatures from above.`;

    console.log('[programmer] Calling AI gateway...');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: programmerPrompt },
          { role: 'user', content: `Generate code for: ${JSON.stringify(design.components?.slice(0, 3) || {})}` }
        ]
      }),
      signal: AbortSignal.timeout(120000),
    });

    console.log('[programmer] Response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[programmer] API error:', response.status, errorText);
      throw new Error(`API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[programmer] Got response from AI');
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
      // Get complete API signatures
      const apiListWithSignatures = apiValidator.formatAPIListForPrompt();
      
      await logStage(supabase, projectId, 'validator', 'info', 'Validating against complete signatures', {
        totalAPIs: apiValidator.getAllAPIs().length
      });

      const validatorPrompt = `You are CODE_VALIDATOR. Validate BlenderBIM Python code against actual API signatures.

BACKEND ENVIRONMENT:
- Blender: 4.2.0
- BlenderBIM: 240602
- IfcOpenShell: 0.8.x (June 2024)
- Python: 3.11

===== VALIDATION AGAINST ACTUAL SIGNATURES =====

Below are COMPLETE function signatures from Railway introspection.
VERIFY EVERY parameter name matches the ACTUAL signature.
DO NOT assume parameter names.
DO NOT accept hallucinated parameters.

===== COMPLETE API SIGNATURES =====
${apiListWithSignatures}

===== VALIDATION CHECKLIST =====
1. ✓ Extract all ifcopenshell.api.run() calls
2. ✓ Check EVERY API against approved list
3. ✓ Verify EVERY parameter name against actual signatures
4. ✓ Check spatial hierarchy: Project→Site→Building→Storey
5. ✓ Verify all elements assigned to storey
6. ✓ Verify all elements have geometry
7. ✓ NO file I/O, NO system calls, NO eval/exec
8. ✓ NO try/except blocks
9. ✓ NO bpy.* or tool.* calls
10. ✓ Balanced parentheses/brackets

RESPOND WITH JSON:
{
  "valid": true/false,
  "confidence": 0-100,
  "errors": [
    {
      "type": "unauthorized_api" | "parameter_error" | "structural_error",
      "line": line_number,
      "message": "specific error description",
      "actual_signature": "the correct signature",
      "suggested_fix": "how to fix it"
    }
  ],
  "corrected_code": "COMPLETE fixed code if errors found, null if valid"
}

If valid=true, return {"valid": true, "confidence": 100}.
If any parameter doesn't match actual signature, set valid=false.
Use actual signatures to fix parameter names.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: validatorPrompt },
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

// ==================== EXECUTION ERROR VALIDATOR ====================
async function revalidateWithExecutionError(
  supabase: any,
  projectId: string,
  code: string,
  executionError: string,
  apiKey: string
): Promise<string> {
  await logStage(supabase, projectId, 'executor', 'info', 'Re-validating code with execution error feedback');

  // Get API list for reference
  const apiList = apiValidator.formatAPIListForPrompt();

  const validatorPrompt = `CRITICAL: Runtime execution error detected. Fix the code.

RUNTIME ERROR FROM BLENDER:
${executionError}

This error shows the ACTUAL function signature from your backend. Use it exactly!

BACKEND ENVIRONMENT:
- Blender: 4.2.0
- BlenderBIM: 240602  
- IfcOpenShell: 0.8.x (June 2024)
- Python: 3.11

APPROVED APIs FOR REFERENCE:
${apiList}

CODE TO FIX:
${code}

RESPOND WITH JSON:
{
  "corrected_code": "complete fixed code using exact signatures from error message"
}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: validatorPrompt }],
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`Revalidation API error ${response.status}`);
  
  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  await logStage(supabase, projectId, 'executor', 'info', 'Code corrected based on runtime error');
  
  return result.corrected_code || code;
}

// ==================== STAGE 5: EXECUTE ON RAILWAY ====================
async function executeOnRailway(
  supabase: any,
  projectId: string,
  code: string,
  projectName: string,
  apiKey: string
): Promise<string> {
  await logStage(supabase, projectId, 'executor', 'info', 'Sending to Blender worker');
  await updateProject(supabase, projectId, { 
    current_stage: 'Building 3D model...'
  });

  const backendUrl = Deno.env.get('PYTHON_BACKEND_URL') || 'http://localhost:8000';
  let currentCode = code;
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(`${backendUrl}/generate-ifc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          python_code: currentCode,
          project_name: projectName || 'Generated Model'
        })
      });

      const responseText = await response.text();

      if (!response.ok) {
        attempt++;
        await logStage(supabase, projectId, 'executor', 'warn', `Execution failed (attempt ${attempt}/${maxAttempts})`, {
          error: responseText
        });

        if (attempt >= maxAttempts) {
          throw new Error(`Blender execution failed after ${maxAttempts} attempts: ${responseText}`);
        }

        // Re-validate with execution error
        currentCode = await revalidateWithExecutionError(
          supabase,
          projectId,
          currentCode,
          responseText,
          apiKey
        );
        
        continue;
      }

      // Success - parse as blob
      const ifcBlob = new Blob([responseText], { type: 'application/x-step' });
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
      if (attempt >= maxAttempts - 1) {
        const msg = error instanceof Error ? error.message : String(error);
        await logStage(supabase, projectId, 'executor', 'error', msg);
        throw error;
      }
      attempt++;
    }
  }

  throw new Error('Execution failed after all retries');
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

    // Try to get user from auth header (optional)
    let userId: string | null = null;
    
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userId = user.id;
        }
      } catch (error) {
        console.log('Auth check failed, proceeding without user:', error);
      }
    }

    // Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        project_name: project_name || 'Untitled Project',
        status: 'pending'
      })
      .select()
      .single();

    if (projectError || !project) {
      throw new Error(`Failed to create project: ${projectError?.message || 'Unknown error'}`);
    }

    const projectId = project.id;
    await logStage(supabase, projectId, 'orchestrator', 'info', 'Pipeline started', { user_prompt });

    // Async pipeline (returns immediately)
    (async () => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          // Tavily is now optional - only used for supplementary docs in Programmer
          const tavilyKey = Deno.env.get('TAVILY_API_KEY') || '';

          const intent = await productOwnerStage(supabase, projectId, user_prompt, apiKey);
          const design = await architectStage(supabase, projectId, intent, apiKey);
          let code = await programmerStage(supabase, projectId, design, apiKey, tavilyKey, retries);
          
          // Import validation stages
          const { preValidatorStage } = await import("./stages/pre-validator.ts");
          const { selfHealerStage } = await import("./stages/self-healer.ts");
          
          // Pre-validation check
          const preCheck = await preValidatorStage(supabase, projectId, code, apiKey);
          
          if (!preCheck.canProceed) {
            await logStage(supabase, projectId, 'orchestrator', 'warning', 'Pre-validation failed, attempting self-heal', {
              confidence: preCheck.confidence,
              issues: preCheck.issues
            });
            
            // Try to auto-fix
            const healResult = await selfHealerStage(supabase, projectId, code, preCheck.issues);
            code = healResult.code;
            
            if (healResult.healed) {
              await logStage(supabase, projectId, 'orchestrator', 'info', 'Self-healing applied', {
                changes: healResult.changes
              });
            }
          }
          
          // Full validation
          const validationResult = await validatorStage(supabase, projectId, code, apiKey);
          code = validationResult.code;
          
          // If still invalid after validation, try self-heal again
          if (!validationResult.valid && validationResult.errors) {
            const healResult = await selfHealerStage(supabase, projectId, code, validationResult.errors);
            if (healResult.healed) {
              code = healResult.code;
              await logStage(supabase, projectId, 'orchestrator', 'info', 'Post-validation self-healing applied');
            }
          }

          const ifcUrl = await executeOnRailway(supabase, projectId, code, project_name || 'Model', apiKey);

          await updateProject(supabase, projectId, {
            status: 'completed',
            ifc_url: ifcUrl,
            current_stage: 'Completed!',
            completed_at: new Date().toISOString()
          });

          await logStage(supabase, projectId, 'orchestrator', 'info', 'Pipeline completed successfully');
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
            status: 'running',
            retry_count: retries,
            last_error: msg,
            current_stage: `Retrying... (${retries}/${maxRetries})`
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
