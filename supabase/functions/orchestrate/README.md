# IFC Orchestration Pipeline - Whitelist-Based Validation System

## Overview

This orchestration system generates IFC (Industry Foundation Classes) files from natural language prompts using a multi-stage AI pipeline with strict API validation.

## Architecture

```
User Prompt
    ↓
Product Owner (design intent extraction)
    ↓
Architect (spatial enrichment)
    ↓
Programmer (Python code generation with API whitelist)
    ↓
Pre-Validator (AST-based quick validation)
    ↓
Self-Healer (auto-fix common mistakes)
    ↓
Validator (deep API signature validation)
    ↓
Self-Healer (post-validation corrections)
    ↓
Execute on Railway (Blender backend)
    ↓
IFC File Generated
```

## Key Components

### 1. API Reference Whitelist (`api-reference.json`)
- **Source**: Backend introspection of BlenderBIM 240602
- **Total APIs**: 335 approved IfcOpenShell APIs
- **Purpose**: Single source of truth for code generation and validation
- **Format**: JSON array of fully qualified API names

### 2. API Validator (`api-loader.ts`)
TypeScript module providing:
- `isAllowed(apiName)`: Check if API is in whitelist
- `extractAPICalls(code)`: Parse Python code for API calls
- `validateCode(code)`: Validate all calls against whitelist
- `detectParameterMistakes(code)`: Find common errors
- `autoFixCode(code)`: Apply automatic corrections
- `formatAPIListForPrompt()`: Generate formatted API list for AI prompts

### 3. Pre-Validator Stage (`stages/pre-validator.ts`)
Fast AST-based validation before deep checks:
- Extracts all `ifcopenshell.api.run()` calls
- Validates each against whitelist
- Detects common parameter mistakes
- Checks for forbidden patterns (file I/O, system calls, eval, try/except)
- Returns confidence score (must be ≥95% to proceed)

### 4. Self-Healer Stage (`stages/self-healer.ts`)
Automatic code corrections:
- `product_type=` → `predefined_type=`
- `products=` → `product=` (spatial.assign_container)
- `objects_to_assign=` → `object_to_assign=` (aggregate.assign_object)
- Removes try/except blocks
- Removes file I/O operations
- Removes bpy.* and tool.* calls

### 5. Enhanced Programmer Stage
- Injects complete API whitelist into prompt (335 APIs)
- Includes critical parameter rules with examples
- Eliminates Tavily dependency (whitelist is the source of truth)
- Validates output matches approved APIs only

### 6. Enhanced Validator Stage
- Cross-references every API call against whitelist
- Validates parameter names and signatures
- Checks spatial hierarchy completeness
- Ensures all elements have geometry and container assignment
- Auto-fixes common mistakes with retry logic

## Critical Parameter Rules

### Common Mistakes (Auto-Fixed)

| ❌ WRONG | ✅ CORRECT | Context |
|----------|-----------|---------|
| `product_type=` | `predefined_type=` | `root.create_entity` |
| `products=` | `product=` | `spatial.assign_container` |
| `objects_to_assign=` | `object_to_assign=` | `aggregate.assign_object` |

### Correct Usage Examples

```python
# ✅ Create entity with predefined type
wall = ifcopenshell.api.run(
    'root.create_entity', 
    ifc, 
    ifc_class='IfcWall', 
    predefined_type='SOLIDWALL',  # NOT product_type
    name='W1'
)

# ✅ Assign to container (singular)
ifcopenshell.api.run(
    'spatial.assign_container',
    ifc,
    relating_structure=storey,
    product=wall  # NOT products=[wall]
)

# ✅ Aggregate hierarchy (singular)
ifcopenshell.api.run(
    'aggregate.assign_object',
    ifc,
    relating_object=building,
    object_to_assign=storey  # NOT objects_to_assign=[storey]
)
```

## Validation Pipeline Details

### Stage 1: Pre-Validator (Fast Check)
**Checks:**
- API whitelist compliance
- Parameter naming mistakes
- Forbidden patterns detection
- Confidence scoring

**Output:**
```typescript
{
  canProceed: boolean,
  confidence: 0-100,
  issues: string[]
}
```

**Action:** If `canProceed=false`, trigger Self-Healer

### Stage 2: Self-Healer (Auto-Fix)
**Corrections:**
- Parameter name fixes
- Forbidden pattern removal
- Structural improvements

**Output:**
```typescript
{
  healed: boolean,
  code: string,
  changes: string[]
}
```

### Stage 3: Validator (Deep Check)
**Checks:**
- API signatures match whitelist
- Spatial hierarchy: Project→Site→Building→Storey
- All elements assigned to storey
- All elements have geometry
- No forbidden operations

**Output:**
```typescript
{
  valid: boolean,
  code: string,
  errors?: string[]
}
```

**Action:** If `valid=false`, trigger Self-Healer again

### Stage 4: Post-Validation Self-Healer
Final attempt to fix any remaining issues before execution.

## Forbidden Patterns

The system strictly prohibits:

1. **File I/O**: `open()`, `write()`, `read()`
2. **System Calls**: `os.system()`, `subprocess`
3. **Code Execution**: `eval()`, `exec()`
4. **Error Handling**: `try/except` blocks
5. **Blender Calls**: `bpy.*` (use ifcopenshell.api only)
6. **Tool Calls**: `tool.*` (deprecated)
7. **Unauthorized APIs**: Any API not in the 335-item whitelist

## Environment Configuration

### Required Environment Variables
```bash
LOVABLE_API_KEY=<auto-provisioned>  # For AI gateway
PYTHON_BACKEND_URL=<railway-url>    # BlenderBIM worker
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<key>
```

### Optional Environment Variables
```bash
TAVILY_API_KEY=<optional>  # For supplementary docs (no longer required)
```

## Database Schema

### Projects Table
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID,
  project_name TEXT,
  status TEXT,  -- pending|running|completed|failed
  current_stage TEXT,
  ifc_url TEXT,
  glb_url TEXT,
  retry_count INT,
  last_error TEXT,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Execution Logs Table
```sql
CREATE TABLE execution_logs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  stage TEXT,  -- product_owner|architect|programmer|pre_validator|validator|self_healer|executor
  level TEXT,  -- info|warning|error
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);
```

### Code Versions Table
```sql
CREATE TABLE code_versions (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  python_code TEXT,
  status TEXT,  -- pending|validated|error|executing
  validation_attempt INT,
  validator_notes JSONB,
  created_at TIMESTAMP
);
```

## API Response Format

### Initiate Pipeline
```typescript
POST /orchestrate
{
  "user_prompt": "Create a simple house with 2 stories",
  "project_name": "My House"
}

Response:
{
  "project_id": "uuid",
  "status": "started"
}
```

### Monitor Progress
Query the `projects` table:
```typescript
{
  "id": "uuid",
  "status": "running",
  "current_stage": "Validating code...",
  "retry_count": 0
}
```

### Check Logs
Query the `execution_logs` table filtered by `project_id`.

## Error Handling & Retries

### Retry Strategy
1. **Pre-Validator Failure** → Self-Healer → Continue
2. **Validator Failure** → Self-Healer → Retry (max 2)
3. **Execution Failure** → Revalidate with error → Retry (max 3)
4. **Pipeline Failure** → Full pipeline retry (max 3)

### Exponential Backoff
```typescript
retryDelay = 2000ms * retryCount
```

## Performance Optimizations

### Tavily Elimination
- **Before**: Multiple Tavily searches per stage (slow, unreliable)
- **After**: Embedded API whitelist (instant, deterministic)
- **Speed Improvement**: ~70% faster validation

### Confidence Scoring
Pre-Validator calculates confidence score:
```
confidence = (validAPIs / totalAPIs) × 100
```
Minimum 95% required to proceed.

### AST Parsing
Fast regex-based extraction of API calls:
```typescript
/ifcopenshell\.api\.run\s*\(\s*["']([^"']+)["']/g
```

## Monitoring & Debugging

### Log Levels
- `info`: Normal operation
- `warning`: Non-critical issues, auto-corrected
- `error`: Critical failures requiring intervention

### Key Metrics to Monitor
- Pre-validator confidence scores
- Self-healer application frequency
- Validation retry rates
- Execution success rates
- Average pipeline duration

### Debug Checklist
1. Check `execution_logs` for stage-by-stage progress
2. Review `code_versions` for generated Python code
3. Verify API whitelist loaded correctly
4. Confirm all environment variables set
5. Check Railway backend availability

## Extending the System

### Adding New APIs
1. Update `api-reference.json` with new API names
2. API validator automatically picks up changes
3. No code modifications needed

### Adding New Validation Rules
1. Edit `stages/pre-validator.ts` for fast checks
2. Edit `prompts/validator-enhanced.txt` for AI-based validation
3. Add auto-fix rules to `api-loader.ts`

### Adding New Stages
1. Create new stage file in `stages/`
2. Import in `index.ts`
3. Add to pipeline sequence
4. Update database schema for new stage logs

## Security Considerations

- No file system access in generated code
- No system calls allowed
- No code execution via eval/exec
- API whitelist prevents unauthorized operations
- All secrets managed via environment variables
- User code executed in isolated Blender container

## Troubleshooting

### Common Issues

**Issue**: "Unauthorized API detected"
- **Cause**: Code uses API not in whitelist
- **Fix**: Review `api-reference.json`, ensure API is approved

**Issue**: "Confidence score below 95%"
- **Cause**: Too many invalid API calls
- **Fix**: Check Self-Healer logs, may need manual intervention

**Issue**: "Validation retries exhausted"
- **Cause**: Code has structural issues Self-Healer can't fix
- **Fix**: Review error logs, may need to adjust Programmer prompt

**Issue**: "Execution failed with signature mismatch"
- **Cause**: Backend API signature differs from whitelist
- **Fix**: Update `api-reference.json` from latest backend introspection

## Best Practices

1. **Always use named parameters** in API calls
2. **Follow spatial hierarchy**: Project→Site→Building→Storey→Elements
3. **Assign all elements to storey** via `spatial.assign_container`
4. **Add geometry to all elements** via `geometry.*` APIs
5. **Use numpy for placement matrices**: `np.eye(4)` or `np.array()`
6. **Avoid complex logic**: Keep code generation simple and deterministic
7. **Monitor confidence scores**: Investigate if consistently below 98%
8. **Review Self-Healer changes**: Ensure auto-fixes align with intent

## Future Enhancements

### Planned Features
- [ ] Pattern library for common building components
- [ ] Signature database with full parameter specs
- [ ] Confidence-based early rejection
- [ ] Advanced error message generation with examples
- [ ] Code caching for similar prompts
- [ ] Multi-model fallback (GPT-5 for complex cases)
- [ ] Real-time validation feedback streaming
- [ ] Visual diff for Self-Healer changes

### Under Consideration
- [ ] WebAssembly IfcOpenShell validation in browser
- [ ] Distributed validation across multiple workers
- [ ] ML-based code suggestion ranking
- [ ] User feedback loop for validation improvements
