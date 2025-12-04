-- Make user_id nullable in projects table to allow unauthenticated project creation
ALTER TABLE projects ALTER COLUMN user_id DROP NOT NULL;

-- Drop the foreign key constraint if it exists
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_user_id_fkey;

-- Update RLS policy to allow public access for project creation and viewing
DROP POLICY IF EXISTS users_own_projects ON projects;

-- Allow anyone to create projects
CREATE POLICY "Anyone can create projects" ON projects
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to view projects
CREATE POLICY "Anyone can view projects" ON projects
  FOR SELECT
  USING (true);

-- Allow users to update their own projects or any project if no user_id
CREATE POLICY "Users can update projects" ON projects
  FOR UPDATE
  USING (user_id IS NULL OR auth.uid() = user_id);

-- Allow users to delete their own projects or any project if no user_id
CREATE POLICY "Users can delete projects" ON projects
  FOR DELETE
  USING (user_id IS NULL OR auth.uid() = user_id);