-- 006_profile_banners_storage.sql
-- Etapa 4 do banco de dados do Praiou?: banner/capa personalizada no perfil com Supabase Storage.
-- Execução transacional e não destrutiva; não altera 001, 002, 003, 004 ou 005.

BEGIN;

-- ============================================================================
-- TABELA: public.profiles (reutiliza a coluna banner_path com validação estrita)
-- ============================================================================
-- banner_path: caminho relativo no bucket público 'profile-banners' (<user_id>/<arquivo>.<ext>)
-- quando o usuário salva uma capa personalizada; NULL quando usa o fundo padrão.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_path text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_banner_path_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_banner_path_format
  CHECK (
    banner_path IS NULL
    OR (
      banner_path ~ ('^' || id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
      AND position('..' in banner_path) = 0
    )
  );

-- Concede UPDATE apenas na coluna adicional banner_path, preservando os grants atuais
-- (display_name e avatar_path) sem liberar UPDATE irrestrito na tabela.
GRANT UPDATE (banner_path) ON TABLE public.profiles TO authenticated;

-- ============================================================================
-- STORAGE BUCKET: profile-banners
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-banners',
  'profile-banners',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE RLS POLICIES: storage.objects (escopo exclusivo no bucket 'profile-banners')
-- ============================================================================
-- O bucket 'profile-banners' é público para exibição das imagens pela URL pública,
-- portanto não é necessário liberar SELECT geral para visitantes em storage.objects.
-- O SELECT abaixo fica restrito ao próprio usuário autenticado para listagem de
-- gerenciamento e exclusão dos próprios arquivos.
DROP POLICY IF EXISTS "profile_banners_select_own" ON storage.objects;
CREATE POLICY "profile_banners_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-banners'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_banners_insert_own" ON storage.objects;
CREATE POLICY "profile_banners_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-banners'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    AND position('..' in name) = 0
  );

DROP POLICY IF EXISTS "profile_banners_delete_own" ON storage.objects;
CREATE POLICY "profile_banners_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-banners'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
