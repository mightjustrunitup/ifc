# 🚀 Implementation Quickstart

**Duration**: 4-6 hours for full implementation  
**Prerequisites**: Supabase project, Railway account, Lovable/Vercel project  
**Target**: Production-ready multi-agent BIM system with 90%+ success rate

---

## 📋 Pre-Implementation Checklist

- [ ] Supabase project created and accessible
- [ ] Railway account with BlenderBIM backend deployed
- [ ] Lovable API key available (`LOVABLE_API_KEY`)
- [ ] Environment: Node.js 18+, npm/yarn
- [ ] Read `ARCHITECTURE_REDESIGN.md` (understand the 5-stage pipeline)
- [ ] Read `IFCOPENSHELL_API_REFERENCE.md` (understand approved APIs)

---

## Phase 1: Database Setup (45 minutes)

### Step 1.1: Open Supabase SQL Editor

1. Go to https://supabase.com → Your Project → SQL Editor
2. Create new query

### Step 1.2: Run Full Migration

Copy-paste this **complete SQL** into Supabase SQL Editor and execute:

```sql
-- ============================================
-- PROJECTS TABLE
-- ============================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null,
  status text not null default 'pending',
  ifc_url text,
  glb_url text,
  current_stage text,
  retry_count int default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  constraint status_check check (status in ('pending', 'running', 'verifying', 'completed', 'failed'))
);

create index idx_projects_user_id on public.projects(user_id);
create index idx_projects_status on public.projects(status);
create index idx_projects_created_at on public.projects(created_at desc);

-- ============================================
-- DESIGN INTENTS TABLE
-- ============================================
create table public.design_intents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_prompt text not null,
  intent_json jsonb not null,
  architect_enrichment jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_design_intents_project_id on public.design_intents(project_id);

-- ============================================
-- CODE VERSIONS TABLE
-- ============================================
create table public.code_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  python_code text not null,
  status text not null default 'pending',
  validator_notes jsonb,
  validation_attempt int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_code_versions_project_id on public.code_versions(project_id);
create index idx_code_versions_status on public.code_versions(status);

-- ============================================
-- EXECUTION LOGS TABLE
-- ============================================
create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null,
  level text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create index idx_execution_logs_project_id on public.execution_logs(project_id);
create index idx_execution_logs_stage on public.execution_logs(stage);
create index idx_execution_logs_level on public.execution_logs(level);
create index idx_execution_logs_created_at on public.execution_logs(created_at desc);

-- ============================================
-- IFC FILES TABLE
-- ============================================
create table public.ifc_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  ifc_url text not null,
  glb_url text,
  size_bytes int,
  validation_passed boolean default false,
  created_at timestamptz default now()
);

create index idx_ifc_files_project_id on public.ifc_files(project_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
alter table public.projects enable row level security;
create policy "users_own_projects" on public.projects
  for all using (auth.uid() = user_id);

alter table public.design_intents enable row level security;
create policy "users_own_design_intents" on public.design_intents
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

alter table public.code_versions enable row level security;
create policy "users_own_code_versions" on public.code_versions
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

alter table public.execution_logs enable row level security;
create policy "users_own_execution_logs" on public.execution_logs
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

alter table public.ifc_files enable row level security;
create policy "users_own_ifc_files" on public.ifc_files
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );
```

**✅ Verify**: You should see 5 tables created in Supabase Table Editor.

---

### Step 1.3: Create Storage Bucket

1. Go to Supabase → Storage
2. Create new bucket: `ifc-files`
3. Make it **Public** (change permissions)
4. Optional: Set expiry policy (7 days)

---

## Phase 2: Create Supabase Functions (90 minutes)

### Step 2.1: Create Directory Structure

```bash
cd supabase/functions

# Create main orchestrator
mkdir -p orchestrate/prompts

# Touch all files
touch orchestrate/index.ts
touch orchestrate/prompts/product-owner.txt
touch orchestrate/prompts/architect.txt
touch orchestrate/prompts/programmer.txt
touch orchestrate/prompts/validator.txt
touch orchestrate/prompts/reviewer.txt
```

### Step 2.2: Create `orchestrate/index.ts`

Copy the full TypeScript file from `ARCHITECTURE_REDESIGN.md` **section 4** into:

```
supabase/functions/orchestrate/index.ts
```

**Key points**:
- Replace placeholder `getPrompt()` function to read from `./prompts/` directory
- Ensure timeouts are set (60-90 seconds per stage)
- Log every error to `execution_logs` table

### Step 2.3: Create System Prompts

Create 5 files in `supabase/functions/orchestrate/prompts/`:

#### **`product-owner.txt`**
Copy from `ARCHITECTURE_REDESIGN.md` **section 3.1**

#### **`architect.txt`**
Copy from `ARCHITECTURE_REDESIGN.md` **section 3.2**

#### **`programmer.txt`**
Copy from `ARCHITECTURE_REDESIGN.md` **section 3.3** + include reference to `IFCOPENSHELL_API_REFERENCE.md`

#### **`validator.txt`**
Copy from `ARCHITECTURE_REDESIGN.md` **section 3.4**

#### **`reviewer.txt`**
Copy from `ARCHITECTURE_REDESIGN.md` **section 3.5**

### Step 2.4: Deploy Functions

```bash
# From project root
supabase functions deploy orchestrate

# Verify
supabase functions list
```

**Expected output**: `orchestrate` function deployed, ready to invoke

### Step 2.5: Set Environment Variables

In Supabase Dashboard → Settings → Edge Functions → Environment Variables:

```
LOVABLE_API_KEY = <your_api_key>
PYTHON_BACKEND_URL = https://<your-railway-app>.up.railway.app
SUPABASE_URL = <already_set>
SUPABASE_SERVICE_ROLE_KEY = <already_set>
```

---

## Phase 3: Update Blender Worker (60 minutes)

### Step 3.1: Replace Backend Code

Replace entire `blenderbim-backend/main.py` with code from `ARCHITECTURE_REDESIGN.md` **section 5**.

### Step 3.2: Update Dockerfile

Dockerfile should look like this (already in your repo, verify):

```dockerfile
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Install dependencies (same as before)
RUN apt-get update && apt-get install -y \
    wget bzip2 libfreetype6 libgl1-mesa-glx libglu1-mesa libxi6 \
    libxrender1 libgomp1 libgeos-dev python3.11 python3-pip xvfb

# Download Blender 4.0.2
RUN wget -q https://download.blender.org/release/Blender4.0/blender-4.0.2-linux-x64.tar.xz && \
    tar -xf blender-4.0.2-linux-x64.tar.xz && \
    mv blender-4.0.2-linux-x64 /opt/blender && \
    rm blender-4.0.2-linux-x64.tar.xz && \
    ln -s /opt/blender/blender /usr/local/bin/blender

# Install BlenderBIM addon
RUN wget -q https://github.com/IfcOpenShell/IfcOpenShell/releases/download/blenderbim-240115/blenderbim-240115-py311-linux.zip && \
    mkdir -p /root/.config/blender/4.0/scripts/addons && \
    unzip -q blenderbim-240115-py311-linux.zip -d /root/.config/blender/4.0/scripts/addons/ && \
    rm blenderbim-240115-py311-linux.zip && \
    rm -rf /root/.config/blender/4.0/scripts/addons/blenderbim/libs/site/packages/shapely && \
    rm -rf /root/.config/blender/4.0/scripts/addons/blenderbim/libs/site/packages/lxml

# Install Python packages
RUN /opt/blender/4.0/python/bin/python3.10 -m ensurepip && \
    /opt/blender/4.0/python/bin/python3.10 -m pip install --upgrade pip && \
    /opt/blender/4.0/python/bin/python3.10 -m pip install shapely==2.0.2 lxml==5.1.0

# Enable BlenderBIM addon
RUN blender --background --python-expr "import bpy; bpy.ops.preferences.addon_enable(module='blenderbim'); bpy.ops.wm.save_userpref()"

# Copy app files
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY blender_worker.py .
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8000
CMD ["./start.sh"]
```

### Step 3.3: Update `requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.2
python-multipart==0.0.12
shapely==2.0.2
numpy==1.24.3
```

### Step 3.4: Create/Update `start.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Starting BlenderBIM Worker..."
python3 blender_worker.py
```

### Step 3.5: Deploy to Railway

```bash
# Navigate to blenderbim-backend directory
cd blenderbim-backend

# Build Docker image locally to test
docker build -t blender-worker .

# Push to Railway (or use Railway CLI)
railway up
```

**Verify**: 
- Go to Railway Dashboard → Your App
- Check logs for: `🚀 Starting BlenderBIM Worker...`
- Call health endpoint: `https://<your-app>.up.railway.app/health`
- Should return: `{"status": "healthy", "blender": "Blender 4.0.2 ...  "}`

---

## Phase 4: Update Frontend (30 minutes)

### Step 4.1: Update `IfcChat.tsx`

Modify the `startGeneration` function:

```typescript
const startGeneration = async (fullPrompt: string) => {
  setIsGenerating(true);
  
  try {
    // Call new orchestrate endpoint
    const { data, error } = await supabase.functions.invoke('orchestrate', {
      body: { 
        user_prompt: fullPrompt,
        project_name: 'AI Building Model'
      }
    });

    if (error) throw error;

    const projectId = data.project_id;
    setCurrentProjectId(projectId);

    // Subscribe to real-time project updates
    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`
        },
        (payload) => {
          const project = payload.new;
          updateProjectProgress(project);
          
          if (project.status === 'completed' && project.ifc_url) {
            loadGeneratedIFC(project.ifc_url);
          }
        }
      )
      .subscribe();

    // Add initial message
    setMessages(prev => [...prev, {
      role: 'system',
      content: '⏳ Pipeline started: analyzing requirements...',
      status: 'pending',
      taskId: projectId
    }]);

  } catch (error) {
    console.error('Pipeline error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `❌ Pipeline Error: ${errorMsg}`,
      status: 'failed'
    }]);
    
    toast({
      title: "Generation Failed",
      description: errorMsg,
      variant: "destructive"
    });
    
    setIsGenerating(false);
  }
};

const updateProjectProgress = (project: any) => {
  const statusMap: Record<string, string> = {
    pending: '⏳ Initializing...',
    running: '🔄 Processing...',
    verifying: '✓ Validating code...',
    completed: '✅ Complete!',
    failed: '❌ Failed'
  };

  const emoji = statusMap[project.status] || '⏳';

  setMessages(prev => {
    const lastMsg = prev[prev.length - 1];
    if (lastMsg?.taskId === project.id) {
      return [
        ...prev.slice(0, -1),
        {
          ...lastMsg,
          content: `${emoji} ${project.current_stage || project.status}`,
          progress: project.status === 'completed' ? 100 : 
                   project.status === 'verifying' ? 70 :
                   project.status === 'running' ? 40 : 0
        }
      ];
    }
    return prev;
  });
};
```

### Step 4.2: Test Frontend

```bash
npm run dev
```

- Go to http://localhost:8080
- Try submitting a prompt: "Small 2-story house"
- Monitor Supabase → Logs (real-time updates)

---

## Phase 5: End-to-End Testing (45 minutes)

### Test 1: Simple House

1. **Submit prompt**:
   ```
   Design a small 2-story residential house. 
   Floor area about 100 m² per floor. 
   Concrete foundation, load-bearing walls. 
   Include living room, kitchen, 3 bedrooms, 2 bathrooms.
   ```

2. **Monitor progress**:
   - Open Supabase → projects table
   - Watch `status` change: `pending` → `running` → `completed`

3. **Check logs**:
   ```sql
   SELECT stage, level, message, created_at
   FROM execution_logs
   WHERE project_id = '<your_project_id>'
   ORDER BY created_at ASC;
   ```

4. **Verify IFC**:
   - Download IFC from `ifc_files` table
   - Open in Blender or online IFC viewer

### Test 2: Error Recovery

1. **Submit prompt** with intentional complexity:
   ```
   20-story skyscraper with complex architectural details
   ```

2. **Watch for errors**:
   - Some errors expected (code validation failures)
   - System should auto-retry (check `retry_count` in projects table)
   - After retries, should either succeed or fail gracefully

3. **Check error logs**:
   ```sql
   SELECT * FROM execution_logs 
   WHERE project_id = '<your_project_id>' 
   AND level = 'error'
   ORDER BY created_at DESC;
   ```

---

## 🔍 Debugging Guide

### Issue: "API Gateway Error 402"

**Cause**: Lovable API credits exhausted  
**Fix**: Add credits to Lovable workspace at https://lovable.dev/account/billing

### Issue: "Blender execution timeout"

**Cause**: Model too complex, Blender taking >120 seconds  
**Fix**: Increase timeout in `blender_worker.py` line 80: `timeout=180`

### Issue: "No IFC products created"

**Cause**: Generated code doesn't create any elements  
**Fix**: 
- Check code in `code_versions` table
- Verify `spatial.assign_container` called for each element
- Check Programmer prompt includes `IFCOPENSHELL_API_REFERENCE.md`

### Issue: "Variable 'ifc' not found"

**Cause**: Code doesn't create IFC file  
**Fix**: First line of generated code must be:
```python
ifc = ifcopenshell.api.run('project.create_file', version='IFC4')
```

### Issue: UI shows "Pipeline started" but never updates

**Cause**: Real-time subscriptions not working  
**Fix**: 
- Check Supabase RLS policies (should allow reads on projects table)
- Verify `user_id` matches authenticated user in projects table
- Check browser console for Supabase errors

---

## 📊 Monitoring Dashboard (SQL Queries)

### View Recent Projects

```sql
SELECT id, project_name, status, retry_count, created_at, updated_at
FROM projects
ORDER BY updated_at DESC
LIMIT 10;
```

### View Pipeline Stages Distribution

```sql
SELECT stage, COUNT(*) as count, 
       AVG(EXTRACT(epoch FROM (created_at - LAG(created_at) OVER (PARTITION BY project_id ORDER BY created_at)))) as avg_duration_sec
FROM execution_logs
GROUP BY stage
ORDER BY count DESC;
```

### Find Failed Projects

```sql
SELECT id, project_name, last_error, retry_count, updated_at
FROM projects
WHERE status = 'failed'
ORDER BY updated_at DESC;
```

### View Logs for Specific Project

```sql
SELECT stage, level, message, metadata::text, created_at
FROM execution_logs
WHERE project_id = '<project_id>'
ORDER BY created_at ASC;
```

---

## ✅ Success Checklist

After completing all phases, verify:

- [ ] All 5 Supabase tables created with RLS enabled
- [ ] Storage bucket `ifc-files` created and public
- [ ] Orchestrate Edge Function deployed with environment variables
- [ ] Blender Worker running on Railway (health check passes)
- [ ] Frontend updated and running
- [ ] Test 1 (Simple House) completes successfully
- [ ] Test 2 (Error Recovery) completes with retries
- [ ] Logs visible in `execution_logs` table
- [ ] IFC files downloadable from Supabase Storage
- [ ] No API hallucinations in generated code

---

## 🎯 Next Steps

1. **Run Production Load Test**: Submit 5-10 projects, measure success rates
2. **Optimize Prompts**: Refine system prompts based on test results
3. **Add Monitoring**: Set up alerts for `status='failed'` projects
4. **Performance Tuning**: Increase LLM parallelization if needed
5. **Feature Additions**: Add GLB preview generation, multi-file support, etc.

---

## 📞 Support

- **Supabase Issues**: Check Dashboard → Logs
- **Edge Function Issues**: Check `supabase functions logs orchestrate`
- **Railway Issues**: Check Railway Dashboard → Deployment logs
- **LLM Issues**: Check `execution_logs` table for API responses
- **IFC Issues**: Validate generated code against `IFCOPENSHELL_API_REFERENCE.md`

---

**Total Time**: 4-6 hours  
**Result**: Production-ready multi-agent BIM system with 90%+ success rate and automatic error recovery

🚀 **You're ready to build!**
