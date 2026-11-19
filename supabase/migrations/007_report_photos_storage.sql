-- 007_report_photos_storage.sql
-- Etapa 5 do banco de dados do Praiou?: fotos reais opcionais nos relatos (public.beach_reports)
-- com Supabase Storage no bucket dedicado 'report-photos'.
-- Execução transacional e não destrutiva; não altera 001, 002, 003, 004, 005 ou 006.

BEGIN;

-- ============================================================================
-- TABELA: public.beach_reports (coluna photo_path opcional + validação estrita)
-- ============================================================================
-- photo_path: caminho relativo no bucket público 'report-photos'
-- no formato '<user_id>/<report_id>/<uuid>.<jpg|jpeg|png|webp>' quando há foto;
-- NULL para relatos sem foto (preserva todos os registros existentes).

ALTER TABLE public.beach_reports
  ADD COLUMN IF NOT EXISTS photo_path text;

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_photo_path_format;

ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_photo_path_format
  CHECK (
    photo_path IS NULL
    OR (
      photo_path ~ (
        '^' || user_id::text || '/' || id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
      )
      AND position('..' in photo_path) = 0
    )
  );

-- Concede apenas o mínimo adicional necessário para inserir o id gerado antes
-- do upload e o photo_path correspondente, preservando os grants atuais de
-- (beach_id, user_id, rating, comment) e sem liberar UPDATE na tabela.
GRANT INSERT (id, photo_path) ON TABLE public.beach_reports TO authenticated;

-- ============================================================================
-- STORAGE BUCKET: report-photos
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-photos',
  'report-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE RLS POLICIES: storage.objects (escopo exclusivo no bucket 'report-photos')
-- ============================================================================
-- O bucket 'report-photos' é público para exibição das fotos pela URL pública,
-- sem liberar SELECT geral para visitantes em storage.objects.
-- SELECT de gerenciamento, INSERT e DELETE ficam restritos à pasta do próprio auth.uid().
-- Não exige existência prévia do relato porque o upload ocorre antes do INSERT em beach_reports.
DROP POLICY IF EXISTS "report_photos_select_own" ON storage.objects;
CREATE POLICY "report_photos_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-photos'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "report_photos_insert_own" ON storage.objects;
CREATE POLICY "report_photos_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-photos'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ (
      '^' || auth.uid()::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
    )
    AND position('..' in name) = 0
  );

DROP POLICY IF EXISTS "report_photos_delete_own" ON storage.objects;
CREATE POLICY "report_photos_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-photos'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
