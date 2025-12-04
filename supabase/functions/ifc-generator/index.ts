import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Sanitize code for BlenderBIM API compatibility
function sanitizeForBlenderBIM(code: string): string {
  let sanitized = code;
  
  // Fix 1: aggregate.assign_object - products=[x] -> product=x
  sanitized = sanitized.replace(
    /ifcopenshell\.api\.run\s*\(\s*["']aggregate\.assign_object["']\s*,\s*ifc\s*,\s*relating_object\s*=\s*(\w+)\s*,\s*products\s*=\s*\[([^\]]+)\]\s*\)/g,
    'ifcopenshell.api.run("aggregate.assign_object", ifc, relating_object=$1, product=$2)'
  );
  
  // Fix 2: spatial.assign_container - products=[x] -> product=x
  sanitized = sanitized.replace(
    /ifcopenshell\.api\.run\s*\(\s*["']spatial\.assign_container["']\s*,\s*ifc\s*,\s*products\s*=\s*\[([^\]]+)\]\s*,\s*relating_structure\s*=\s*(\w+)\s*\)/g,
    'ifcopenshell.api.run("spatial.assign_container", ifc, product=$1, relating_structure=$2)'
  );
  
  // Fix 3: Remove name= from context.add_context
  sanitized = sanitized.replace(
    /(ifcopenshell\.api\.run\s*\(\s*["']context\.add_context["'][^)]*),\s*name\s*=\s*["'][^"']*["']/g,
    '$1'
  );
  
  return sanitized;
}

// Helper: Clean user code - AGGRESSIVELY remove imports, try/except blocks, and wrapper code
function cleanUserCode(code: string): string {
  // First, remove ANY line containing try/except/finally keywords
  let cleaned = code
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Remove lines with try/except/finally keywords
      if (/\b(try|except|finally)\s*:/i.test(trimmed)) {
        return false;
      }
      // Remove import statements
      if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
        return false;
      }
      // Remove markdown fences
      if (trimmed.startsWith('```')) {
        return false;
      }
      // Remove placeholder comments
      if (/TODO|PLACEHOLDER|FIX_ME/i.test(trimmed)) {
        return false;
      }
      // Remove IfcStore assignment (added by wrapper)
      if (trimmed === 'IfcStore.file = ifc') {
        return false;
      }
      return true;
    })
    .join('\n');
  
  return cleaned;
}

// Helper: validate Python code syntax - ULTRA STRICT validation
function validatePythonCode(code: string): string | null {
  // Block ANY occurrence of try/except/finally keywords ANYWHERE in the code
  const tryMatch = code.match(/\b(try|except|finally)\b/gi);
  if (tryMatch) {
    return `Found forbidden error-handling keywords: ${tryMatch.join(', ')}. All error handling is managed by the wrapper.`;
  }

  // Block ANY import statements ANYWHERE
  const importMatch = code.match(/^\s*(import|from)\s+\w/m);
  if (importMatch) {
    return `Found import statement: "${importMatch[0]}". All imports are added by the wrapper.`;
  }

  // Check for unmatched braces/brackets
  const openBrackets = (code.match(/[\[\{]/g) || []).length;
  const closeBrackets = (code.match(/[\]\}]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    return "Unmatched brackets or braces detected.";
  }

  // Check for forbidden dangerous operations
  const forbidden = ['os.system(', 'subprocess.', 'eval(', 'exec(', '__import__'];
  for (const token of forbidden) {
    if (code.includes(token)) {
      return `Forbidden operation detected: ${token}`;
    }
  }

  return null; // No issues
}

// Wrapper to ensure valid Blender script structure
function generateWrappedPython(userCode: string): string {
  // Clean the user code first - remove duplicate imports and placeholders
  const cleaned = cleanUserCode(userCode);
  
  const header = [
    'import ifcopenshell',
    'import ifcopenshell.api',
    'import ifcopenshell.geom',
    'from blenderbim.bim.ifc import IfcStore',
    '',
    '# === BEGIN USER CODE ===',
  ];
  const footer = [
    '',
    '# === END USER CODE ===',
    '# Store in IfcStore for export',
    'IfcStore.file = ifc',
  ];

  return [...header, cleaned, ...footer].join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { python_code, project_name, retry_count = 0 } = await req.json();
    
    if (!python_code) {
      return new Response(
        JSON.stringify({ error: 'No Python code provided' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('=== Incoming Python code ===');
    console.log(python_code.substring(0, 500) + '...');
    console.log('=== End Python code ===');
    
    // Sanitize for BlenderBIM API compatibility FIRST
    const sanitizedCode = sanitizeForBlenderBIM(python_code);
    console.log('=== After BlenderBIM sanitization ===');
    console.log(sanitizedCode.substring(0, 500) + '...');
    
    // Validate Python code AFTER sanitization
    const validationError = validatePythonCode(sanitizedCode);
    if (validationError) {
      console.error('Validation failed:', validationError);
      return new Response(
        JSON.stringify({ 
          error: 'Code validation failed: ' + validationError,
          hint: 'The generated code contains issues. Please try a simpler request or rephrase.'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Wrap the code for safety (removes duplicates, adds structure)
    const safePython = generateWrappedPython(sanitizedCode);
    console.log('=== Wrapped & cleaned Python code ===');
    console.log(safePython.substring(0, 800) + '...');
    console.log('=== Total length:', safePython.length, 'chars ===');
    
    // Get Python backend URL from environment
    let pythonBackendUrl = Deno.env.get('PYTHON_BACKEND_URL');
    
    if (!pythonBackendUrl) {
      return new Response(
        JSON.stringify({ 
          error: 'Python backend not configured. Please deploy the Python backend and add PYTHON_BACKEND_URL secret.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Add https:// if protocol is missing
    if (!pythonBackendUrl.startsWith('http://') && !pythonBackendUrl.startsWith('https://')) {
      pythonBackendUrl = `https://${pythonBackendUrl}`;
    }

    console.log('Calling Python backend:', pythonBackendUrl);
    console.log('Safe Python code length:', safePython.length, 'chars');

    // Call Python FastAPI backend with wrapped code
    const response = await fetch(`${pythonBackendUrl}/generate-ifc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        python_code: safePython,
        project_name: project_name || 'AI Generated BIM Model',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python backend error:', errorText);
      
      // Auto-retry: If this is the first attempt (retry_count === 0), try to fix the code
      if (retry_count === 0) {
        console.log('[Auto-Retry] Attempting to fix code with AI...');
        
        const apiKey = Deno.env.get('LOVABLE_API_KEY');
        if (apiKey) {
          try {
            const fixResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'openai/gpt-5',
                messages: [
                  { 
                    role: 'system', 
                    content: `You are a BlenderBIM Python code fixer. Fix ONLY the error shown.

CRITICAL BlenderBIM API Rules:
- Use product= (singular, not products=) for spatial.assign_container
- Use product= (singular, not products=) for aggregate.assign_object  
- NEVER use name= parameter in context.add_context calls
- Always use proper numeric dimensions

Return ONLY the corrected Python code without explanations or markdown.`
                  },
                  { 
                    role: 'user', 
                    content: `This BlenderBIM code failed execution:\n\n\`\`\`python\n${sanitizedCode}\n\`\`\`\n\nError from Python backend:\n${errorText}\n\nFix the specific error and return the corrected code:` 
                  }
                ],
              }),
            });
            
            if (fixResponse.ok) {
              const fixData = await fixResponse.json();
              const fixedCodeRaw = fixData.choices[0].message.content;
              const codeMatch = fixedCodeRaw.match(/```(?:python)?\s*([\s\S]*?)\s*```/);
              const fixedCode = codeMatch ? codeMatch[1] : fixedCodeRaw;
              
              console.log('[Auto-Retry] AI provided fixed code, retrying generation...');
              
              // Retry with fixed code
              const retryResponse = await fetch(req.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  python_code: fixedCode,
                  project_name: project_name,
                  retry_count: 1  // Mark as retry attempt
                })
              });
              
              // Return the retry response directly
              return retryResponse;
            }
          } catch (retryError) {
            console.error('[Auto-Retry] Failed:', retryError);
          }
        }
      }
      
      const snippet = safePython.substring(0, 1200);
      return new Response(
        JSON.stringify({ 
          error: `Python backend error: ${errorText}`,
          wrapped_code_snippet: snippet,
          wrapped_code_length: safePython.length,
          python_backend_url: pythonBackendUrl,
          retry_attempted: retry_count > 0
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get IFC file bytes
    const ifcBytes = await response.arrayBuffer();
    
    console.log('IFC file generated, size:', ifcBytes.byteLength, 'bytes');

    // Return IFC file
    return new Response(ifcBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/x-step',
        'Content-Disposition': `attachment; filename="${project_name || 'model'}.ifc"`,
      },
    });

  } catch (error) {
    console.error('Error in ifc-generator function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
