/**
 * API Reference Loader - Single Source of Truth for IfcOpenShell APIs
 */

import apiReference from "./api-reference.json" with { type: "json" };
import apiSignatures from "./api-signatures-complete.json" with { type: "json" };
import { applySemanticHints, formatSemanticHintsForPrompt } from "./semantic-hints.ts";

export interface APIReference {
  generated_at: string;
  source: string;
  api: string[];
}

export interface APISignatures {
  [key: string]: string;
}

export class APIValidator {
  private allowedAPIs: Set<string>;
  private apiList: string[];
  private signatures: APISignatures;

  constructor() {
    const ref = apiReference as APIReference;
    this.apiList = ref.api;
    this.allowedAPIs = new Set(ref.api);
    // The uploaded signatures are just a flat object with API names as keys
    this.signatures = apiSignatures as APISignatures;
  }

  /**
   * Check if an API is in the whitelist
   */
  isAllowed(apiName: string): boolean {
    return this.allowedAPIs.has(apiName);
  }

  /**
   * Get all allowed APIs
   */
  getAllAPIs(): string[] {
    return this.apiList;
  }

  /**
   * Get APIs by category
   */
  getAPIsByCategory(category: string): string[] {
    return this.apiList.filter(api => api.startsWith(`ifcopenshell.api.${category}`));
  }

  /**
   * Get critical APIs for core operations
   */
  getCriticalAPIs(): string[] {
    const categories = ['project', 'root', 'spatial', 'aggregate', 'geometry', 'material', 'pset', 'unit', 'owner', 'context'];
    return this.apiList.filter(api => 
      categories.some(cat => api.startsWith(`ifcopenshell.api.${cat}`))
    );
  }

  /**
   * Get complete signature for an API with semantic type hints applied
   */
  getSignature(apiName: string): string | null {
    const rawSig = this.signatures[apiName] || null;
    if (!rawSig) return null;
    return applySemanticHints(apiName, rawSig);
  }

  /**
   * Get all signatures
   */
  getAllSignatures(): APISignatures {
    return this.signatures;
  }

  /**
   * Extract API calls from Python code
   */
  extractAPICalls(code: string): string[] {
    const calls: string[] = [];
    const runPattern = /ifcopenshell\.api\.run\s*\(\s*["']([^"']+)["']/g;
    let match;
    
    while ((match = runPattern.exec(code)) !== null) {
      calls.push(`ifcopenshell.api.${match[1]}`);
    }
    
    return calls;
  }

  /**
   * Validate code against whitelist
   */
  validateCode(code: string): {
    valid: boolean;
    unauthorizedAPIs: string[];
    validAPIs: string[];
    confidence: number;
  } {
    const extractedAPIs = this.extractAPICalls(code);
    const validAPIs = extractedAPIs.filter(api => this.isAllowed(api));
    const unauthorizedAPIs = extractedAPIs.filter(api => !this.isAllowed(api));
    
    const confidence = extractedAPIs.length > 0 
      ? (validAPIs.length / extractedAPIs.length) * 100 
      : 0;
    
    return {
      valid: unauthorizedAPIs.length === 0 && extractedAPIs.length > 0,
      unauthorizedAPIs,
      validAPIs,
      confidence
    };
  }

  /**
   * Detect common parameter mistakes
   */
  detectParameterMistakes(code: string): string[] {
    const mistakes: string[] = [];
    
    // Common mistakes
    const patterns = [
      { wrong: 'product_type=', correct: 'predefined_type=', api: 'root.create_entity' },
      { wrong: 'products=', correct: 'product=', api: 'spatial.assign_container' },
      { wrong: 'objects_to_assign=', correct: 'object_to_assign=', api: 'aggregate.assign_object' },
    ];
    
    patterns.forEach(pattern => {
      if (code.includes(pattern.wrong)) {
        mistakes.push(`Found '${pattern.wrong}' - should be '${pattern.correct}' in ${pattern.api}`);
      }
    });
    
    return mistakes;
  }

  /**
   * Auto-fix common mistakes
   */
  autoFixCode(code: string): { fixed: string; changes: string[] } {
    let fixed = code;
    const changes: string[] = [];
    
    const fixes = [
      { pattern: /product_type\s*=/g, replacement: 'predefined_type=', desc: 'product_type → predefined_type' },
      { pattern: /products\s*=/g, replacement: 'product=', desc: 'products → product' },
      { pattern: /objects_to_assign\s*=/g, replacement: 'object_to_assign=', desc: 'objects_to_assign → object_to_assign' },
    ];
    
    fixes.forEach(fix => {
      if (fix.pattern.test(fixed)) {
        fixed = fixed.replace(fix.pattern, fix.replacement);
        changes.push(fix.desc);
      }
    });
    
    return { fixed, changes };
  }

  /**
   * Format API list with signatures for prompts
   */
  formatAPIListForPrompt(): string {
    const categories = new Map<string, Array<{api: string, signature: string}>>();
    
    // Group by category with signatures
    this.apiList.forEach(api => {
      const match = api.match(/ifcopenshell\.api\.([^.]+)/);
      if (match) {
        const category = match[1];
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        const signature = this.getSignature(api) || 'no signature available';
        categories.get(category)!.push({ api, signature });
      }
    });
    
    // Format as string with signatures
    let formatted = `COMPLETE API SIGNATURES (${this.apiList.length} total):\n\n`;
    formatted += `CRITICAL: These are the ACTUAL function signatures from Railway introspection.\n`;
    formatted += `DO NOT assume or hallucinate parameter names. USE ONLY these exact signatures.\n\n`;
    formatted += formatSemanticHintsForPrompt() + "\n";
    
    for (const [category, items] of categories) {
      formatted += `${category.toUpperCase()} (${items.length}):\n`;
      items.forEach(({api, signature}) => {
        formatted += `  ${api}\n    ${signature}\n`;
      });
      formatted += `\n`;
    }
    
    return formatted;
  }
}

// Singleton instance
export const apiValidator = new APIValidator();
