-- 010_usernames_and_public_profiles.sql
-- Etapa 8 do banco de dados do Praiou?: identidade pública com @username único e perfis visitáveis.
-- Execução transacional e não destrutiva; não altera 001..009 em disco.

BEGIN;

-- ============================================================================
-- 1. ADICIONAR COLUNA username EM public.profiles (em etapas seguras)
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

-- Garante unicidade antes do backfill para que qualquer colisão seja tratada
-- pela constraint real do banco.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.profiles'::regclass
      AND c.conname = 'uq_profiles_username'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT uq_profiles_username UNIQUE (username);
  END IF;
END;
$$;

-- ============================================================================
-- 2. BACKFILL SEGURO PARA USUÁRIOS EXISTENTES E PERFIS AUSENTES
-- ============================================================================
-- Gera usernames neutros no formato banhista_<sufixo_aleatorio> (sem derivar de
-- e-mail, telefone ou UUID completo) e com tratamento real de colisão via
-- unique_violation. Nunca sobrescreve usernames já definidos.
DO $$
DECLARE
  v_missing_user record;
  v_profile record;
  v_candidate text;
  v_display_name text;
  v_avatar_url text;
  v_attempts integer;
  v_suffix_len integer;
BEGIN
  -- 2a) Cria perfis eventualmente ausentes para usuários já existentes em auth.users
  FOR v_missing_user IN
    SELECT u.id, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    v_display_name := btrim(left(btrim(COALESCE(
      v_missing_user.raw_user_meta_data ->> 'full_name',
      v_missing_user.raw_user_meta_data ->> 'name',
      v_missing_user.raw_user_meta_data ->> 'preferred_username',
      ''
    )), 60));

    IF char_length(v_display_name) < 2 THEN
      v_display_name := 'Banhista';
    END IF;

    v_avatar_url := NULLIF(btrim(COALESCE(
      v_missing_user.raw_user_meta_data ->> 'avatar_url',
      v_missing_user.raw_user_meta_data ->> 'picture',
      ''
    )), '');

    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      IF v_attempts > 50 THEN
        RAISE EXCEPTION 'Não foi possível gerar um username inicial único durante o backfill.';
      END IF;

      v_suffix_len := CASE WHEN v_attempts <= 20 THEN 8 ELSE 12 END;
      v_candidate := 'banhista_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, v_suffix_len);

      BEGIN
        INSERT INTO public.profiles (id, display_name, username, avatar_url)
        VALUES (v_missing_user.id, v_display_name, v_candidate, v_avatar_url)
        ON CONFLICT (id) DO NOTHING;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_missing_user.id) THEN
            EXIT;
          END IF;
      END;
    END LOOP;
  END LOOP;

  -- 2b) Preenche somente perfis existentes cujo username ainda seja NULL
  FOR v_profile IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.username IS NULL
    ORDER BY p.created_at ASC, p.id ASC
  LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      IF v_attempts > 50 THEN
        RAISE EXCEPTION 'Não foi possível preencher username único para perfil existente.';
      END IF;

      v_suffix_len := CASE WHEN v_attempts <= 20 THEN 8 ELSE 12 END;
      v_candidate := 'banhista_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, v_suffix_len);

      BEGIN
        UPDATE public.profiles
        SET username = v_candidate
        WHERE id = v_profile.id
          AND username IS NULL;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          -- Tenta novo sufixo aleatório em caso de colisão
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ============================================================================
-- 3. CONSTRAINTS ESTRITAS DE FORMATO, UNICIDADE E NOMES RESERVADOS NO BANCO
-- ============================================================================
ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_username_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_username_format
  CHECK (username ~ '^[a-z0-9_]{3,24}$');

-- Reserva apenas nomes exatos administrativos/sistema/rotas do app,
-- sem prefixos amplos que bloqueiem nomes legítimos.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_username_not_reserved;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_username_not_reserved
  CHECK (
    NOT (
      username = ANY (ARRAY[
        'admin',
        'administrador',
        'administracao',
        'moderador',
        'moderacao',
        'suporte',
        'support',
        'praiou',
        'sistema',
        'system',
        'oficial',
        'staff',
        'equipe',
        'contato',
        'ajuda',
        'help',
        'seguranca',
        'privacidade',
        'termos',
        'sobre',
        'root',
        'api',
        'feed',
        'perfil',
        'entrar',
        'relatar',
        'praia',
        'praias',
        'auth'
      ])
    )
  );

-- ============================================================================
-- 4. TRIGGER DE NOVOS USUÁRIOS: PRESERVA GOOGLE E GERA USERNAME NEUTRO ÚNICO
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate_name text;
  v_display_name text;
  v_avatar_url text;
  v_candidate_username text;
  v_attempts integer := 0;
  v_suffix_len integer;
BEGIN
  v_candidate_name := btrim(left(btrim(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'preferred_username',
    ''
  )), 60));

  IF char_length(v_candidate_name) < 2 THEN
    v_display_name := 'Banhista';
  ELSE
    v_display_name := v_candidate_name;
  END IF;

  v_avatar_url := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'picture',
    ''
  )), '');

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar um username inicial único para o novo perfil.';
    END IF;

    v_suffix_len := CASE WHEN v_attempts <= 20 THEN 8 ELSE 12 END;
    v_candidate_username := 'banhista_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, v_suffix_len);

    BEGIN
      INSERT INTO public.profiles (id, display_name, username, avatar_url)
      VALUES (NEW.id, v_display_name, v_candidate_username, v_avatar_url)
      ON CONFLICT (id) DO NOTHING;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.id) THEN
          EXIT;
        END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ============================================================================
-- 5. PRIVILÉGIO MÍNIMO ADICIONAL PARA EDIÇÃO DE username
-- ============================================================================
-- Mantém RLS profiles_update_own (auth.uid() = id) e grants existentes
-- (display_name, avatar_path, banner_path), concedendo UPDATE apenas em username.
GRANT UPDATE (username) ON TABLE public.profiles TO authenticated;

-- ============================================================================
-- 6. RPC DE CONTAGENS PÚBLICAS EXATAS (sem limite de 1000 registros)
-- ============================================================================
-- Retorna apenas agregados públicos de relatos visíveis (moderation_status = 'visible'),
-- mantendo consistência mesmo quando o visitante for o autor ou um moderador.
CREATE OR REPLACE FUNCTION public.get_public_profile_stats(
  p_user_id uuid
)
RETURNS TABLE (
  visible_reports_count integer,
  evaluated_beaches_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    COUNT(*)::integer AS visible_reports_count,
    COUNT(DISTINCT br.beach_id)::integer AS evaluated_beaches_count
  FROM public.beach_reports br
  WHERE p_user_id IS NOT NULL
    AND br.user_id = p_user_id
    AND br.moderation_status = 'visible';
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_stats(uuid) TO anon, authenticated;

COMMIT;
