-- ============================================================
-- 05_STORAGE.SQL — Penca Mundial 2026
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Bucket público para avatares de usuario
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  2097152,  -- 2 MB máximo
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Cada usuario solo puede subir/editar en su carpeta (avatars/{user_id}/*)
CREATE POLICY "avatars_user_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
