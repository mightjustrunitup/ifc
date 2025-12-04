-- Multi-Agent BIM Pipeline Schema
-- Supabase SQL Migration
-- Run this in: Supabase Dashboard → SQL Editor → paste and execute

-- ==================== TABLE 1: PROJECTS ====================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null,
  status text not null default 'pending',
  -- pending | running | verifying | completed | failed
  
  -- Final results
  ifc_url text,
  glb_url text,
  
  -- Current state
  current_stage text,
  retry_count int default 0,
  last_error text,
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  
  constraint status_check check (status in ('pending', 'running', 'verifying', 'completed', 'failed'))
);

create index idx_projects_user_id on public.projects(user_id);
create index idx_projects_status on public.projects(status);
create index idx_projects_created_at on public.projects(created_at desc);

-- ==================== TABLE 2: DESIGN INTENTS ====================
create table public.design_intents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  -- User raw prompt
  user_prompt text not null,
  
  -- Structured output (JSON)
  intent_json jsonb not null,
  -- {
  --   "building_type": "residential",
  --   "components": [...],
  --   "spaces": [...],
  --   "relationships": [...],
  --   "engineering_notes": "..."
  -- }
  
  -- Architect enrichment
  architect_enrichment jsonb,
  -- Additional floors, spatial layout, dimensions
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_design_intents_project_id on public.design_intents(project_id);

-- ==================== TABLE 3: CODE VERSIONS ====================
create table public.code_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  -- Python code
  python_code text not null,
  
  -- Validation state
  status text not null default 'pending',
  -- pending | validated | executing | success | error
  
  -- Validation details
  validator_notes jsonb,
  -- { "errors": [...], "warnings": [...] }
  
  validation_attempt int default 0,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_code_versions_project_id on public.code_versions(project_id);
create index idx_code_versions_status on public.code_versions(status);

-- ==================== TABLE 4: EXECUTION LOGS ====================
create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  stage text not null,
  -- product_owner | architect | programmer | validator | reviewer | executor | recovery
  
  level text not null,
  -- info | warning | error
  
  message text not null,
  metadata jsonb,
  
  created_at timestamptz default now()
);

create index idx_execution_logs_project_id on public.execution_logs(project_id);
create index idx_execution_logs_stage on public.execution_logs(stage);
create index idx_execution_logs_level on public.execution_logs(level);
create index idx_execution_logs_created_at on public.execution_logs(created_at desc);

-- ==================== TABLE 5: IFC FILES ====================
create table public.ifc_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  
  -- File locations
  ifc_url text not null,
  glb_url text,
  
  size_bytes int,
  validation_passed boolean default false,
  
  created_at timestamptz default now()
);

create index idx_ifc_files_project_id on public.ifc_files(project_id);

-- ==================== ROW LEVEL SECURITY ====================

-- Projects: Users can only see their own projects
alter table public.projects enable row level security;
create policy "users_own_projects" on public.projects
  for all using (auth.uid() = user_id);

-- Design intents: Users can only see intents for their projects
alter table public.design_intents enable row level security;
create policy "users_own_design_intents" on public.design_intents
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Code versions: Users can only see code for their projects
alter table public.code_versions enable row level security;
create policy "users_own_code_versions" on public.code_versions
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Execution logs: Users can only see logs for their projects
alter table public.execution_logs enable row level security;
create policy "users_own_execution_logs" on public.execution_logs
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- IFC files: Users can only see files for their projects
alter table public.ifc_files enable row level security;
create policy "users_own_ifc_files" on public.ifc_files
  for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );
