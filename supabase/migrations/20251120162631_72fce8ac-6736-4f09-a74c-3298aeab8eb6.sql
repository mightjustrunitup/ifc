-- Create enum types for status tracking
CREATE TYPE pipeline_status AS ENUM ('pending', 'intent_parsing', 'code_generation', 'code_validation', 'structural_review', 'executing', 'retrying', 'completed', 'failed');
CREATE TYPE code_status AS ENUM ('pending', 'validated', 'error', 'executing');

-- Main state table for IFC generation pipeline
CREATE TABLE ifc_generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  
  -- User input
  user_prompt TEXT NOT NULL,
  project_name TEXT,
  
  -- Stage 1: Intent parsing
  design_intent JSONB,
  intent_status TEXT DEFAULT 'pending',
  
  -- Stage 2: Code generation
  blender_code TEXT,
  code_status code_status DEFAULT 'pending',
  code_generation_attempts INTEGER DEFAULT 0,
  
  -- Stage 3: Validation
  validation_notes TEXT,
  validation_errors JSONB,
  
  -- Stage 4: Structural review
  structural_notes TEXT,
  structural_warnings JSONB,
  
  -- Stage 5: Execution
  ifc_file_url TEXT,
  execution_errors JSONB,
  execution_attempts INTEGER DEFAULT 0,
  
  -- Overall status
  status pipeline_status DEFAULT 'pending',
  current_stage TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Error handling
  total_retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT
);

-- Logs table for detailed tracking
CREATE TABLE ifc_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES ifc_generation_tasks(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  level TEXT NOT NULL, -- info, warning, error
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ifc_generation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifc_generation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tasks
CREATE POLICY "Users can view own tasks"
  ON ifc_generation_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks"
  ON ifc_generation_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON ifc_generation_tasks FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for logs
CREATE POLICY "Users can view own logs"
  ON ifc_generation_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ifc_generation_tasks
      WHERE ifc_generation_tasks.id = ifc_generation_logs.task_id
      AND ifc_generation_tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert logs"
  ON ifc_generation_logs FOR INSERT
  WITH CHECK (true);

-- Trigger to update updated_at
CREATE TRIGGER update_ifc_tasks_updated_at
  BEFORE UPDATE ON ifc_generation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_ifc_tasks_user_id ON ifc_generation_tasks(user_id);
CREATE INDEX idx_ifc_tasks_status ON ifc_generation_tasks(status);
CREATE INDEX idx_ifc_logs_task_id ON ifc_generation_logs(task_id);
CREATE INDEX idx_ifc_logs_created_at ON ifc_generation_logs(created_at DESC);

-- Real-time for frontend updates
ALTER PUBLICATION supabase_realtime ADD TABLE ifc_generation_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE ifc_generation_logs;