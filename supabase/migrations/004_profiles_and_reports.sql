-- 004_profiles_and_reports.sql
-- Etapa 2 do banco de dados do Praiou?: perfis públicos (public.profiles) e relatos reais (public.beach_reports).
-- Execução transacional e não destrutiva; não altera 001, 002 ou 003.

BEGIN;

-- ============================================================================
-- TABELA: public.profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  banner_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_profiles_display_name_length
    CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 60)
);

-- Reaproveita a função public.set_updated_at() criada em 001_initial_schema.sql
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Função de trigger para criar perfil automático de novos usuários (sem copiar e-mail/telefone/tokens)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate text;
  v_display_name text;
  v_avatar_url text;
BEGIN
  v_candidate := btrim(left(btrim(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'preferred_username',
    ''
  )), 60));

  IF char_length(v_candidate) < 2 THEN
    v_display_name := 'Banhista';
  ELSE
    v_display_name := v_candidate;
  END IF;

  v_avatar_url := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'picture',
    ''
  )), '');

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, v_display_name, v_avatar_url)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill seguro para usuários já existentes em auth.users (não sobrescreve perfis existentes)
INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
  u.id,
  CASE
    WHEN char_length(btrim(left(btrim(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'preferred_username',
      ''
    )), 60))) < 2 THEN 'Banhista'
    ELSE btrim(left(btrim(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'preferred_username',
      ''
    )), 60))
  END AS display_name,
  NULLIF(btrim(COALESCE(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture',
    ''
  )), '') AS avatar_url
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- RLS, Políticas e Grants de coluna para public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- TABELA: public.beach_reports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES public.beaches(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating smallint NOT NULL CONSTRAINT chk_beach_reports_rating CHECK (rating BETWEEN 1 AND 5),
  comment text CONSTRAINT chk_beach_reports_comment_length CHECK (comment IS NULL OR char_length(comment) <= 180),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beach_reports_created_id_desc
  ON public.beach_reports (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_beach_reports_beach_created_id_desc
  ON public.beach_reports (beach_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_beach_reports_user_created_id_desc
  ON public.beach_reports (user_id, created_at DESC, id DESC);

-- RLS, Políticas e Grants de coluna para public.beach_reports
ALTER TABLE public.beach_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beach_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beach_reports TO anon, authenticated;
GRANT INSERT (beach_id, user_id, rating, comment) ON TABLE public.beach_reports TO authenticated;
GRANT DELETE ON TABLE public.beach_reports TO authenticated;

DROP POLICY IF EXISTS "beach_reports_select_public" ON public.beach_reports;
CREATE POLICY "beach_reports_select_public"
  ON public.beach_reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "beach_reports_insert_own_active_beach" ON public.beach_reports;
CREATE POLICY "beach_reports_insert_own_active_beach"
  ON public.beach_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.beaches b
      WHERE b.id = beach_reports.beach_id
        AND b.is_active = true
    )
  );

DROP POLICY IF EXISTS "beach_reports_delete_own" ON public.beach_reports;
CREATE POLICY "beach_reports_delete_own"
  ON public.beach_reports
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

COMMIT;
