import { apiValidator } from "../api-loader.ts";

export async function selfHealerStage(
  supabase: any,
  projectId: string,
  code: string,
  validationIssues: string[]
): Promise<{ healed: boolean; code: string; changes: string[] }> {
  await logToStage(supabase, projectId, 'self_healer', 'info', 'Attempting auto-fix');

  try {
    // Auto-fix common mistakes
    const { fixed: healedCode, changes } = apiValidator.autoFixCode(code);
    
    // Additional fixes for structural issues
    let finalCode = healedCode;
    const additionalChanges: string[] = [...changes];
    
    // CRITICAL: Block project.assign_declaration entirely (for library assets, not building elements)
    const projectDeclarationPattern = /ifcopenshell\.api\.run\s*\(\s*["']project\.assign_declaration["']/gi;
    if (projectDeclarationPattern.test(finalCode)) {
      finalCode = finalCode.replace(/.*ifcopenshell\.api\.run\s*\(\s*["']project\.assign_declaration["'].*\n?/gi, '# REMOVED: project.assign_declaration is FORBIDDEN (for library assets only)\n');
      additionalChanges.push('Blocked project.assign_declaration (forbidden API)');
    }
    
    // CRITICAL: Block context.add_context (contexts already created in boilerplate)
    const contextAddPattern = /ifcopenshell\.api\.run\s*\(\s*["']context\.add_context["']/gi;
    if (contextAddPattern.test(finalCode)) {
      finalCode = finalCode.replace(/.*ifcopenshell\.api\.run\s*\(\s*["']context\.add_context["'].*\n?/gi, '# REMOVED: context.add_context is FORBIDDEN (contexts already initialized)\n');
      additionalChanges.push('Blocked context.add_context (already initialized)');
    }
    
    // CRITICAL: Block aggregate.assign_object (spatial hierarchy already complete)
    const aggregatePattern = /ifcopenshell\.api\.run\s*\(\s*["']aggregate\.assign_object["']/gi;
    if (aggregatePattern.test(finalCode)) {
      finalCode = finalCode.replace(/.*ifcopenshell\.api\.run\s*\(\s*["']aggregate\.assign_object["'].*\n?/gi, '# REMOVED: aggregate.assign_object is FORBIDDEN (spatial hierarchy already complete)\n');
      additionalChanges.push('Blocked aggregate.assign_object (hierarchy already complete)');
    }
    
    // CRITICAL: Block invalid spatial.assign_container usage
    // Pattern: spatial.assign_container with project/site/building as relating_structure
    const invalidSpatialPattern = /ifcopenshell\.api\.run\s*\(\s*["']spatial\.assign_container["']\s*,\s*[^)]*relating_structure\s*=\s*(project|site|building)[\s,)]/gi;
    if (invalidSpatialPattern.test(finalCode)) {
      finalCode = finalCode.replace(invalidSpatialPattern, '# REMOVED: Invalid spatial.assign_container (relating_structure must be storey)\n');
      additionalChanges.push('Blocked spatial.assign_container with project/site/building as relating_structure');
    }
    
    // Block spatial.assign_container with spatial elements as products
    const invalidProductPattern = /ifcopenshell\.api\.run\s*\(\s*["']spatial\.assign_container["']\s*,\s*[^)]*product\s*=\s*(project|site|building|storey)[\s,)]/gi;
    if (invalidProductPattern.test(finalCode)) {
      finalCode = finalCode.replace(invalidProductPattern, '# REMOVED: Invalid spatial.assign_container (product cannot be spatial element)\n');
      additionalChanges.push('Blocked spatial.assign_container with spatial elements as product');
    }
    
    // Block unit.assign_unit with length/area/volume parameters (causes KeyError)
    const invalidUnitPattern = /ifcopenshell\.api\.run\s*\(\s*["']unit\.assign_unit["']\s*,\s*[^)]*(?:length|area|volume)\s*=/gi;
    if (invalidUnitPattern.test(finalCode)) {
      finalCode = finalCode.replace(invalidUnitPattern, '# REMOVED: Invalid unit.assign_unit (use unit.add_si_unit first, then pass units=[] list)\n');
      additionalChanges.push('Blocked unit.assign_unit with length/area/volume shortcuts');
    }
    
    // Block unit.add_si_unit or unit.assign_unit entirely (units already configured in boilerplate)
    const unitSetupPattern = /ifcopenshell\.api\.run\s*\(\s*["']unit\.(?:add_si_unit|assign_unit)["']/gi;
    if (unitSetupPattern.test(finalCode)) {
      finalCode = finalCode.replace(/.*ifcopenshell\.api\.run\s*\(\s*["']unit\.(?:add_si_unit|assign_unit)["'].*\n?/gi, '# REMOVED: Unit setup already done in boilerplate\n');
      additionalChanges.push('Removed unit setup calls (already initialized)');
    }
    
    // Remove try/except blocks
    if (/try\s*:/i.test(finalCode)) {
      finalCode = finalCode.replace(/try\s*:[\s\S]*?except[\s\S]*?:/gi, '');
      additionalChanges.push('Removed try/except blocks');
    }
    
    // Remove file I/O
    if (/open\s*\(/i.test(finalCode)) {
      finalCode = finalCode.replace(/.*open\s*\(.*\n?/gi, '');
      additionalChanges.push('Removed file I/O operations');
    }
    
    // Remove bpy.* calls
    if (/bpy\./i.test(finalCode)) {
      finalCode = finalCode.replace(/.*bpy\..*\n?/gi, '');
      additionalChanges.push('Removed bpy.* calls');
    }
    
    // Remove tool.* calls
    if (/tool\./i.test(finalCode)) {
      finalCode = finalCode.replace(/.*tool\..*\n?/gi, '');
      additionalChanges.push('Removed tool.* calls');
    }
    
    const healed = additionalChanges.length > 0;
    
    await logToStage(supabase, projectId, 'self_healer', 'info', healed ? 'Auto-fixes applied' : 'No fixes needed', {
      changes: additionalChanges
    });
    
    return {
      healed,
      code: finalCode,
      changes: additionalChanges
    };
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logToStage(supabase, projectId, 'self_healer', 'error', msg);
    return {
      healed: false,
      code,
      changes: []
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
