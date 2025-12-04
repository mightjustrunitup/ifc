# Multi-Agent BIM Code Generation System

## Overview

This project implements a professional-grade multi-agent system for generating Industry Foundation Classes (IFC) building models using AI. The system employs four specialized agents that work together to ensure high-quality, architecturally sound BIM code generation.

## Architecture

### Agent Pipeline

```
User Request
    ↓
┌───────────────────────────────┐
│   1. Orchestrator Agent       │  ← Understands intent, gathers requirements
│   Model: gemini-2.5-flash     │
└───────────────────────────────┘
    ↓
    ├─ Conversational Response (if more info needed)
    │
    └─ GENERATE_CODE signal
           ↓
┌───────────────────────────────┐
│   2. Code Generator Agent     │  ← Generates BlenderBIM Python code
│   Model: gemini-2.5-flash     │
└───────────────────────────────┘
           ↓
┌───────────────────────────────┐
│   3. Code Validator Agent     │  ← Validates and refines code
│   Model: gemini-2.5-flash     │
└───────────────────────────────┘
           ↓
┌───────────────────────────────┐
│ 4. Architecture Specialist    │  ← Reviews complex structures
│    (medium/complex only)      │     (buildings, bridges, etc.)
│   Model: gemini-2.5-flash     │
└───────────────────────────────┘
           ↓
     Python Backend (BlenderBIM)
           ↓
       IFC File Output
```

## Agent Responsibilities

### 1. Orchestrator Agent
**Role**: Project Manager & Requirements Analyst

**Responsibilities**:
- Parse user requests and understand intent
- Ask clarifying questions to gather complete requirements
- Determine project complexity (simple, medium, complex)
- Signal when sufficient information is available for code generation

**Output Format**:
```
GENERATE_CODE: complexity:[simple|medium|complex] [detailed description]
```

**Example**:
```
User: "Build me a house"
Orchestrator: "I'd be happy to help! To create your house, I need some details:
- How many bedrooms and bathrooms?
- Single or multi-story?
- Approximate dimensions?
- Any specific style preferences?"

User: "2 bedrooms, 1 story, 10m x 8m"
Orchestrator: "GENERATE_CODE: complexity:complex Create a single-story residential house 
with 2 bedrooms, 1 bathroom, living area, and kitchen. Dimensions: 10m x 8m."
```

### 2. Code Generator Agent
**Role**: Senior BIM Developer

**Responsibilities**:
- Generate production-ready Python code using ifcopenshell and BlenderBIM
- Implement precise positioning and spatial relationships
- Apply materials, colors, and properties as specified
- Follow IFC standards and best practices

**Key Capabilities**:
- Creates IFC project structure (File → Project → Context)
- Generates geometric representations
- Applies RGB colors from hex codes
- Positions elements with proper coordinate systems
- Saves output to `/tmp/output.ifc`

**Code Quality Standards**:
- ✓ Clean, readable Python code
- ✓ Proper imports and initialization
- ✓ Accurate dimensional calculations
- ✓ Correct IFC entity relationships
- ✓ Material and style application

### 3. Code Validator Agent
**Role**: Quality Assurance Engineer

**Responsibilities**:
- Review generated code for syntax errors
- Validate logical consistency (positioning, relationships)
- Check ifcopenshell.api usage patterns
- Ensure IFC file structure compliance
- Refine code when issues are detected

**Validation Checklist**:
- ✓ Proper imports present
- ✓ IFC file, project, context initialized
- ✓ Entities use correct IFC classes
- ✓ Positioning is logical (no conflicts, negative values)
- ✓ Colors applied correctly
- ✓ File save operation included
- ✓ No syntax errors
- ✓ All variables properly referenced

**Output**:
- `VALIDATION_PASSED` → Code proceeds to execution
- `VALIDATION_FAILED` → Provides refined code with fixes

### 4. Architecture Specialist Agent
**Role**: Licensed Architect & Structural Engineer

**Responsibilities**:
- Review design for architectural soundness
- Validate structural integrity
- Check spatial proportions and relationships
- Ensure building code compliance
- Recommend improvements for complex structures

**Review Criteria**:
- Realistic proportions (room sizes, ceiling heights)
- Proper load paths (columns → beams → slabs)
- Logical door/window placement
- Material compatibility
- Structural stability
- Code compliance (egress, accessibility, etc.)

**Activation**: Only for medium and complex projects

**Output**:
```
ARCHITECTURE_REVIEW: [APPROVED|NEEDS_REVISION]
Comments: [professional assessment]
Recommendations: [specific improvements]
```

## Complexity Levels

### Simple (Single Element)
- **Examples**: Column, beam, wall, door, window
- **Agents**: Orchestrator → Generator → Validator
- **Typical Response Time**: 3-5 seconds

### Medium (Room/Assembly)
- **Examples**: Room with walls/doors/windows, staircase, roof assembly
- **Agents**: Orchestrator → Generator → Validator → Architecture Specialist
- **Typical Response Time**: 5-8 seconds

### Complex (Full Building)
- **Examples**: Complete buildings, bridges, multi-level structures
- **Agents**: Full pipeline with detailed architecture review
- **Typical Response Time**: 8-15 seconds

## Technical Implementation

### Backend: Supabase Edge Function
**File**: `supabase/functions/ifc-chat/index.ts`

**Key Components**:
```typescript
// Agent communication
async function callAgent(
  systemPrompt: string,
  messages: Message[],
  apiKey: string,
  agentName: string
): Promise<string>

// Code generation pipeline
async function generateBIMCode(
  requirements: string,
  complexity: string,
  apiKey: string
): Promise<{ code: string; validation: string; architectureReview?: string }>
```

### Python Backend: BlenderBIM Executor
**Location**: Railway deployment at `blenderbim-production.up.railway.app`

**Process**:
1. Receives Python code from agent pipeline
2. Executes code in Blender headless mode
3. Generates IFC file using ifcopenshell
4. Returns binary IFC file to frontend

### Frontend: React Chat Interface
**File**: `src/components/IfcChat.tsx`

**Features**:
- Real-time chat with BIM assistant
- Multi-agent status indicators
- IFC file generation and preview
- 3D model viewer integration

## Benefits of Multi-Agent Approach

### 1. **Separation of Concerns**
Each agent has a single, well-defined responsibility, making the system modular and maintainable.

### 2. **Quality Assurance**
Multiple validation layers catch errors before code execution, reducing failures.

### 3. **Architectural Expertise**
Dedicated architecture agent ensures designs are practical and structurally sound.

### 4. **Scalability**
Easy to add new specialized agents (e.g., MEP specialist, cost estimator).

### 5. **Debugging**
Clear agent-by-agent logging makes issue identification straightforward.

### 6. **Reliability**
If one agent needs improvement, others continue functioning normally.

## Error Handling

### Rate Limiting (429)
```json
{
  "error": "Rate limit exceeded. Please wait a moment and try again."
}
```

### Payment Required (402)
```json
{
  "error": "Payment required. Please add credits to your Lovable AI workspace."
}
```

### Code Generation Failure
- Validator agent attempts automatic refinement
- If refinement fails, returns detailed error to user
- Conversation continues - user can provide more details

## Performance Metrics

### Agent Response Times
- **Orchestrator**: 0.5-2s
- **Code Generator**: 2-4s
- **Code Validator**: 1-3s
- **Architecture Specialist**: 2-4s

### Success Rates (Target)
- **Simple structures**: 95%+ success rate
- **Medium complexity**: 85%+ success rate
- **Complex buildings**: 75%+ success rate

## Future Enhancements

### Potential New Agents
1. **MEP Specialist** - Mechanical, Electrical, Plumbing systems
2. **Cost Estimator** - Material quantities and cost analysis
3. **Energy Analyst** - Building performance simulation
4. **Code Compliance Checker** - Automated code compliance validation
5. **Structural Engineer** - Advanced structural calculations

### System Improvements
- Conversation memory for multi-turn projects
- Template library for common structures
- Real-time code visualization
- Export to multiple formats (Revit, ArchiCAD, etc.)
- Collaborative multi-user sessions

## Development Guidelines

### Adding a New Agent
1. Create system prompt in `ifc-chat/index.ts`
2. Define agent's role, responsibilities, and output format
3. Integrate into `generateBIMCode()` pipeline
4. Add logging for debugging
5. Update frontend to display agent status
6. Document agent in this file

### Modifying Agent Behavior
1. Update system prompt with specific instructions
2. Test with representative examples
3. Validate against edge cases
4. Monitor agent logs for issues
5. Update documentation

### Best Practices
- Keep system prompts focused and specific
- Use structured output formats (e.g., "KEYWORD: data")
- Log all agent interactions for debugging
- Handle errors gracefully with fallbacks
- Test across complexity levels

## API Reference

### Edge Function: `ifc-chat`
**Endpoint**: `/functions/v1/ifc-chat`

**Request**:
```json
{
  "messages": [
    { "role": "user", "content": "Build a 2-bedroom house" }
  ]
}
```

**Response (Conversational)**:
```json
{
  "role": "assistant",
  "content": "I'd be happy to help! Can you provide dimensions?"
}
```

**Response (Generation)**:
```json
{
  "role": "assistant",
  "content": "✅ Code Validation: Passed\n✅ Architecture Review: Design approved\n🏗️ Generating...",
  "tool_calls": [{
    "id": "generate_ifc",
    "type": "function",
    "function": {
      "name": "generate_ifc",
      "arguments": "{\"code\": \"...\", \"project_name\": \"...\"}"
    }
  }]
}
```

## Conclusion

This multi-agent architecture provides a robust, professional-grade solution for AI-powered BIM model generation. By separating concerns across specialized agents, the system achieves higher quality, better reliability, and easier maintenance than a single-agent approach.

The system is designed for scalability - new agents can be added as needed to enhance capabilities without disrupting existing functionality.
