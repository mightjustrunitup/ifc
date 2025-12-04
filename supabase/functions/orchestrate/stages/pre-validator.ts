import { apiValidator } from "../api-loader.ts";

export async function preValidatorStage(
  supabase: any,
  projectId: string,
  code: string,
  apiKey: string
): Promise<{ canProceed: boolean; confidence: number; issues: string[] }> {
  await logToStage(supabase, projectId, 'pre_validator', 'info', 'Starting pre-flight validation');

  try {
    // Fast AST-based validation
    const validation = apiValidator.validateCode(code);
    const paramMistakes = apiValidator.detectParameterMistakes(code);
    
    const issues: string[] = [];
    
    // Check unauthorized APIs
    if (validation.unauthorizedAPIs.length > 0) {
      issues.push(`Unauthorized APIs detected: ${validation.unauthorizedAPIs.join(', ')}`);
    }
    
    // Check parameter mistakes
    if (paramMistakes.length > 0) {
      issues.push(...paramMistakes);
    }
    
    // Check for forbidden patterns
    const forbiddenPatterns = [
      { pattern: /open\s*\(/, message: 'File I/O detected (open)' },
      { pattern: /os\.system/, message: 'System call detected (os.system)' },
      { pattern: /subprocess/, message: 'System call detected (subprocess)' },
      { pattern: /eval\s*\(/, message: 'eval() detected' },
      { pattern: /exec\s*\(/, message: 'exec() detected' },
      { pattern: /try\s*:/, message: 'try/except block detected' },
      { pattern: /bpy\./, message: 'bpy.* call detected (use ifcopenshell.api only)' },
      { pattern: /tool\./, message: 'tool.* call detected (forbidden)' },
    ];
    
    forbiddenPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(code)) {
        issues.push(message);
      }
    });
    
    const canProceed = issues.length === 0 && validation.confidence >= 95;
    
    await logToStage(supabase, projectId, 'pre_validator', 'info', 'Pre-validation complete', {
      confidence: validation.confidence,
      canProceed,
      totalAPIs: validation.validAPIs.length + validation.unauthorizedAPIs.length,
      validAPIs: validation.validAPIs.length,
      unauthorizedAPIs: validation.unauthorizedAPIs.length,
      issues: issues.length
    });
    
    return {
      canProceed,
      confidence: validation.confidence,
      issues
    };
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logToStage(supabase, projectId, 'pre_validator', 'error', msg);
    return {
      canProceed: false,
      confidence: 0,
      issues: [msg]
    };
  }
}

async function logToStage(supabase: any, projectId: string, stage: string, level: string, message: string, metadata?: any) {
  await supabase.from('execution_logs').insert({
    project_id: projectId,
    stage,
    level,
    message,
    metadata
  });
  console.log(`[${stage}] ${level}: ${message}`, metadata || '');
}
