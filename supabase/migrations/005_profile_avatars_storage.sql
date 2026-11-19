-- 005_profile_avatars_storage.sql
-- Etapa 3 do banco de dados do Praiou?: foto de perfil personalizada com Supabase Storage.
-- Execução transacional e não destrutiva; não altera 001, 002, 003 ou 004.

BEGIN;

-- ============================================================================
-- TABELA: public.profiles (separação explícita entre avatar externo e Storage)
-- ============================================================================
-- avatar_url: preservada com a URL externa original (ex.: foto do Google) ou NULL.
-- avatar_path: caminho relativo no bucket privado/público 'avatars' (<user_id>/<arquivo>.<ext>)
-- quando o usuário salva uma foto personalizada; NULL quando usa foto padrão/iniciais.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_avatar_path_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_avatar_path_format
  CHECK (
    avatar_path IS NULL
    OR (
      avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
      AND position('..' in avatar_path) = 0
    )
  );

-- Atualiza grants de coluna mantendo o menor privilégio possível:
-- o usuário autenticado só pode editar display_name e avatar_path da própria linha.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_path) ON TABLE public.profiles TO authenticated;

-- ============================================================================
-- STORAGE BUCKET: avatars
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- STORAGE RLS POLICIES: storage.objects (escopo exclusivo no bucket 'avatars')
-- ============================================================================
-- O bucket 'avatars' é público para entrega de imagens via URL pública,
-- portanto não é necessário liberar SELECT geral em storage.objects.
-- O SELECT abaixo fica restrito ao próprio usuário autenticado para operações
-- de gerenciamento e remoção dos próprios arquivos.
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_own" ON storage.objects;
CREATE POLICY "avatars_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    AND position('..' in name) = 0
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
