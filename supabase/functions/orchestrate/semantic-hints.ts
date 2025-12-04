/**
 * Semantic Type Hints - Replace generic entity_instance with specific IFC types
 * This bridges the gap between syntax (what Python accepts) and semantics (what IFC requires)
 */

export interface SemanticHint {
  api: string;
  parameter: string;
  genericType: string;
  semanticType: string;
  explanation: string;
}

export const SEMANTIC_HINTS: SemanticHint[] = [
  // project.assign_declaration - FORBIDDEN API (for library assets only)
  {
    api: "ifcopenshell.api.project.assign_declaration",
    parameter: "relating_context",
    genericType: "entity_instance",
    semanticType: "FORBIDDEN - This API is for library assets, NOT building elements",
    explanation: "DO NOT USE project.assign_declaration. It's for declaring library assets, not for building element creation."
  },
  
  // aggregate.assign_object - Products vs single product confusion
  {
    api: "ifcopenshell.api.aggregate.assign_object",
    parameter: "products",
    genericType: "list[entity_instance]",
    semanticType: "list[IfcSpatialElement | IfcElement]",
    explanation: "List of spatial elements (Site, Building, Storey) or building elements"
  },
  
  // spatial.assign_container - CRITICAL: Storey required, NEVER Project/Site/Building
  {
    api: "ifcopenshell.api.spatial.assign_container",
    parameter: "relating_structure",
    genericType: "entity_instance",
    semanticType: "IfcBuildingStorey (ONLY storey, NEVER project/site/building)",
    explanation: "MUST be 'storey' (IfcBuildingStorey). NEVER use project, site, or building as container."
  },
  {
    api: "ifcopenshell.api.spatial.assign_container",
    parameter: "product",
    genericType: "entity_instance",
    semanticType: "IfcElement (Wall, Slab, Door, Window, Column, Beam - NOT Site/Building/Storey)",
    explanation: "ONLY building elements (walls, slabs, doors, etc.). NEVER spatial elements (project/site/building/storey)."
  },
  
  // unit.assign_unit - CRITICAL: DO NOT use length/area/volume shortcuts
  {
    api: "ifcopenshell.api.unit.assign_unit",
    parameter: "units",
    genericType: "list[entity_instance]",
    semanticType: "list[IfcUnit] (REQUIRED - create with unit.add_si_unit first)",
    explanation: "ALWAYS use two-step: (1) create unit with unit.add_si_unit, (2) pass to units=[] list"
  },
  {
    api: "ifcopenshell.api.unit.assign_unit",
    parameter: "length",
    genericType: "Optional[dict]",
    semanticType: "FORBIDDEN - causes KeyError: 'is_metric'",
    explanation: "DO NOT USE length parameter. Units are pre-configured in boilerplate."
  },
  {
    api: "ifcopenshell.api.unit.assign_unit",
    parameter: "area",
    genericType: "Optional[dict]",
    semanticType: "FORBIDDEN - causes KeyError",
    explanation: "DO NOT USE area parameter. Units are pre-configured in boilerplate."
  },
  {
    api: "ifcopenshell.api.unit.assign_unit",
    parameter: "volume",
    genericType: "Optional[dict]",
    semanticType: "FORBIDDEN - causes KeyError",
    explanation: "DO NOT USE volume parameter. Units are pre-configured in boilerplate."
  },
  
  // geometry.assign_representation - Context type matters
  {
    api: "ifcopenshell.api.geometry.assign_representation",
    parameter: "context",
    genericType: "entity_instance",
    semanticType: "IfcGeometricRepresentationContext",
    explanation: "Use 'body_context' for 3D geometry"
  },
  
  // material.assign_material - Element types
  {
    api: "ifcopenshell.api.material.assign_material",
    parameter: "products",
    genericType: "list[entity_instance]",
    semanticType: "list[IfcElement]",
    explanation: "Building elements that need materials (walls, slabs, etc.)"
  },
  
  // style.assign_material_style - Visual representation
  {
    api: "ifcopenshell.api.style.assign_material_style",
    parameter: "material",
    genericType: "entity_instance",
    semanticType: "IfcMaterial",
    explanation: "Material instance created by material.add_material"
  },
  {
    api: "ifcopenshell.api.style.assign_material_style",
    parameter: "style",
    genericType: "entity_instance",
    semanticType: "IfcSurfaceStyle",
    explanation: "Style instance created by style.add_surface_style"
  }
];

/**
 * Apply semantic hints to a signature string
 */
export function applySemanticHints(api: string, signature: string): string {
  const hints = SEMANTIC_HINTS.filter(h => h.api === api);
  
  let enhanced = signature;
  for (const hint of hints) {
    // Replace generic type with semantic type in signature
    const pattern = new RegExp(`${hint.parameter}:\\s*${hint.genericType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    enhanced = enhanced.replace(pattern, `${hint.parameter}: ${hint.semanticType}`);
  }
  
  return enhanced;
}

/**
 * Get explanation for a specific parameter
 */
export function getParameterExplanation(api: string, parameter: string): string | null {
  const hint = SEMANTIC_HINTS.find(h => h.api === api && h.parameter === parameter);
  return hint ? hint.explanation : null;
}

/**
 * Format semantic hints for prompt injection
 */
export function formatSemanticHintsForPrompt(): string {
  const grouped = new Map<string, SemanticHint[]>();
  
  for (const hint of SEMANTIC_HINTS) {
    if (!grouped.has(hint.api)) {
      grouped.set(hint.api, []);
    }
    grouped.get(hint.api)!.push(hint);
  }
  
  let output = "===== SEMANTIC TYPE CONSTRAINTS =====\n\n";
  output += "The following parameters have SPECIFIC semantic requirements beyond their Python type:\n\n";
  
  for (const [api, hints] of grouped) {
    output += `${api}:\n`;
    for (const hint of hints) {
      output += `  - ${hint.parameter}: ${hint.semanticType}\n`;
      output += `    → ${hint.explanation}\n`;
    }
    output += "\n";
  }
  
  return output;
}
