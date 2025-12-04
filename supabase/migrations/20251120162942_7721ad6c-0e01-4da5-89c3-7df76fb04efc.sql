-- Create storage bucket for IFC files
INSERT INTO storage.buckets (id, name, public)
VALUES ('ifc-files', 'ifc-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for IFC files
CREATE POLICY "Anyone can view IFC files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ifc-files');

CREATE POLICY "Authenticated users can upload IFC files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ifc-files' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update their own IFC files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'ifc-files' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete their own IFC files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ifc-files' 
    AND auth.role() = 'authenticated'
  );