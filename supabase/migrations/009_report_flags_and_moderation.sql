-- 009_report_flags_and_moderation.sql
-- Etapa 7 do banco de dados do Praiou?: denúncia de relatos e moderação manual básica.
-- Execução transacional e não destrutiva; não altera arquivos 001..008 em disco.
-- IMPORTANTE: Esta migration NÃO insere moderadores automaticamente.
-- Após executá-la, cadastre o UUID do primeiro moderador manualmente em private.moderators.

BEGIN;

-- ============================================================================
-- 1. SCHEMA PRIVADO E TABELA DE MODERADORES (fora da Data API)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.moderators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.moderators FROM PUBLIC, anon, authenticated;

-- Função mínima para o cliente verificar apenas se o próprio auth.uid() é moderador.
-- SECURITY DEFINER é necessário porque private.moderators fica em schema não exposto
-- e sem grants diretos. Nunca aceita user_id externo e retorna apenas boolean.
CREATE OR REPLACE FUNCTION public.is_current_user_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM private.moderators m
      WHERE m.user_id = auth.uid()
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_current_user_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_moderator() TO authenticated;

-- ============================================================================
-- 2. ESTADO DE MODERAÇÃO EM public.beach_reports E VISIBILIDADE EFETIVA
-- ============================================================================
ALTER TABLE public.beach_reports
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible';

ALTER TABLE public.beach_reports
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_moderation_status;

ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_moderation_status
  CHECK (moderation_status IN ('visible', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_beach_reports_moderation_created_id_desc
  ON public.beach_reports (moderation_status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_beach_reports_moderation_beach_created_id_desc
  ON public.beach_reports (moderation_status, beach_id, created_at DESC, id DESC);

-- Substitui a política antiga permisiva ("USING (true)") para que relatos ocultos
-- fiquem bloqueados no banco/RLS para visitantes e outros usuários.
-- Autor continua podendo consultar o próprio relato ocultado para ver aviso e excluir.
-- Moderadores continuam podendo consultar para revisão.
-- Usuário comum continua sem GRANT UPDATE em beach_reports.
DROP POLICY IF EXISTS "beach_reports_select_public" ON public.beach_reports;
DROP POLICY IF EXISTS "beach_reports_select_visible_public" ON public.beach_reports;
DROP POLICY IF EXISTS "beach_reports_select_own_or_moderator" ON public.beach_reports;

CREATE POLICY "beach_reports_select_visible_public"
  ON public.beach_reports
  FOR SELECT
  TO anon, authenticated
  USING (moderation_status = 'visible');

CREATE POLICY "beach_reports_select_own_or_moderator"
  ON public.beach_reports
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_current_user_moderator()
  );

DROP POLICY IF EXISTS "beach_reports_insert_own_active_beach" ON public.beach_reports;
CREATE POLICY "beach_reports_insert_own_active_beach"
  ON public.beach_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND moderation_status = 'visible'
    AND moderated_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.beaches b
      WHERE b.id = beach_reports.beach_id
        AND b.is_active = true
    )
  );

-- ============================================================================
-- 3. PROTEÇÃO DA REAÇÃO "FOI ÚTIL" PARA RELATOS OCULTOS
-- ============================================================================
-- Atualiza trigger e política de INSERT para bloquear novas reações em relatos ocultos,
-- preservando reações existentes para eventual restauração.
CREATE OR REPLACE FUNCTION public.prevent_self_report_helpful_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_author_id uuid;
  v_moderation_status text;
BEGIN
  SELECT br.user_id, br.moderation_status
    INTO v_author_id, v_moderation_status
  FROM public.beach_reports br
  WHERE br.id = NEW.report_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Relato não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_author_id = NEW.user_id THEN
    RAISE EXCEPTION 'Você não pode marcar o próprio relato como útil.'
      USING ERRCODE = '42501';
  END IF;

  IF v_moderation_status <> 'visible' THEN
    RAISE EXCEPTION 'Este relato não está disponível para novas marcações.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_self_report_helpful_reaction() FROM PUBLIC;

DROP POLICY IF EXISTS "helpful_reactions_insert_own_other_author"
  ON public.beach_report_helpful_reactions;

CREATE POLICY "helpful_reactions_insert_own_other_author"
  ON public.beach_report_helpful_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.beach_reports br
      WHERE br.id = beach_report_helpful_reactions.report_id
        AND br.user_id <> auth.uid()
        AND br.moderation_status = 'visible'
    )
  );

-- Atualiza RPC de resumo de "Foi útil" para nunca revelar dados/agregados de
-- relatos ocultos para quem não pode vê-los (somente visíveis, ou próprio autor/moderador).
CREATE OR REPLACE FUNCTION public.get_beach_report_helpful_summary(
  p_report_ids uuid[]
)
RETURNS TABLE (
  report_id uuid,
  helpful_count integer,
  viewer_has_reacted boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_is_moderator boolean := false;
  v_distinct_ids uuid[];
BEGIN
  IF p_report_ids IS NULL OR COALESCE(array_length(p_report_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF array_length(p_report_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Limite máximo de 50 relatos por consulta de utilidade.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id_item), ARRAY[]::uuid[])
    INTO v_distinct_ids
  FROM unnest(p_report_ids) AS id_item
  WHERE id_item IS NOT NULL;

  IF COALESCE(array_length(v_distinct_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF v_viewer_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM private.moderators m
      WHERE m.user_id = v_viewer_id
    )
      INTO v_is_moderator;
  END IF;

  RETURN QUERY
  SELECT
    br.id AS report_id,
    GREATEST(0, COUNT(rx.user_id))::integer AS helpful_count,
    CASE
      WHEN v_viewer_id IS NULL THEN false
      ELSE COALESCE(BOOL_OR(rx.user_id = v_viewer_id), false)
    END AS viewer_has_reacted
  FROM unnest(v_distinct_ids) AS requested(id)
  INNER JOIN public.beach_reports br
    ON br.id = requested.id
  LEFT JOIN public.beach_report_helpful_reactions rx
    ON rx.report_id = br.id
  WHERE
    br.moderation_status = 'visible'
    OR (
      v_viewer_id IS NOT NULL
      AND (br.user_id = v_viewer_id OR v_is_moderator)
    )
  GROUP BY br.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_beach_report_helpful_summary(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beach_report_helpful_summary(uuid[]) TO anon, authenticated;

-- ============================================================================
-- 4. TABELA DE DENÚNCIAS: public.beach_report_flags
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_report_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.beach_reports(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CONSTRAINT chk_beach_report_flags_reason CHECK (
    reason IN (
      'spam',
      'harassment',
      'inappropriate_media',
      'personal_data',
      'misleading_or_dangerous',
      'other'
    )
  ),
  details text CONSTRAINT chk_beach_report_flags_details_length CHECK (
    details IS NULL OR char_length(btrim(details)) <= 500
  ),
  status text NOT NULL DEFAULT 'pending' CONSTRAINT chk_beach_report_flags_status CHECK (
    status IN ('pending', 'resolved_kept', 'resolved_hidden')
  ),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_beach_report_flags_report_reporter UNIQUE (report_id, reporter_id),
  CONSTRAINT chk_beach_report_flags_other_requires_details CHECK (
    reason <> 'other' OR (details IS NOT NULL AND char_length(btrim(details)) >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_beach_report_flags_report_status_created
  ON public.beach_report_flags (report_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beach_report_flags_reporter_created
  ON public.beach_report_flags (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beach_report_flags_status_created
  ON public.beach_report_flags (status, created_at DESC);

ALTER TABLE public.beach_report_flags ENABLE ROW LEVEL SECURITY;

-- Grants mínimos:
-- - anon não acessa a tabela.
-- - authenticated só lê suas próprias denúncias e apenas colunas não administrativas
--   (sem reviewed_by/reviewed_at); criação é exclusivamente via RPC transacional.
REVOKE ALL ON TABLE public.beach_report_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, report_id, reporter_id, reason, details, status, created_at)
  ON TABLE public.beach_report_flags TO authenticated;

DROP POLICY IF EXISTS "beach_report_flags_select_own" ON public.beach_report_flags;
CREATE POLICY "beach_report_flags_select_own"
  ON public.beach_report_flags
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- ============================================================================
-- 5. HISTÓRICO ADMINISTRATIVO: public.beach_report_moderation_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_report_moderation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.beach_reports(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CONSTRAINT chk_moderation_logs_action CHECK (
    action IN ('keep_visible', 'hide', 'restore')
  ),
  reason text CONSTRAINT chk_moderation_logs_reason_length CHECK (
    reason IS NULL OR char_length(btrim(reason)) <= 500
  ),
  flags_resolved_count integer NOT NULL DEFAULT 0 CHECK (flags_resolved_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_moderation_logs_reason_required CHECK (
    action = 'keep_visible' OR (reason IS NOT NULL AND char_length(btrim(reason)) >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_beach_report_moderation_logs_report_created
  ON public.beach_report_moderation_logs (report_id, created_at DESC);

ALTER TABLE public.beach_report_moderation_logs ENABLE ROW LEVEL SECURITY;

-- Sem acesso direto para anon ou authenticated (leitura/gravação somente por RPCs
-- administrativas que validam private.moderators no banco).
REVOKE ALL ON TABLE public.beach_report_moderation_logs FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. RPC: ENVIAR DENÚNCIA (validação, unicidade e rate limit atômico 5/hora)
-- ============================================================================
-- Justificativa de SECURITY DEFINER:
-- Impõe limite concorrente de 5 denúncias/hora por usuário, verifica estado do relato
-- e grava com segurança sem liberar INSERT direto na tabela base.
CREATE OR REPLACE FUNCTION public.submit_beach_report_flag(
  p_report_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS TABLE (
  flag_id uuid,
  report_id uuid,
  reason text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_details text := NULLIF(btrim(COALESCE(p_details, '')), '');
  v_author_id uuid;
  v_moderation_status text;
  v_recent_count integer;
  v_inserted_id uuid;
  v_inserted_created_at timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Entre com sua conta Google para denunciar um relato.'
      USING ERRCODE = '42501';
  END IF;

  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Relato inválido para denúncia.'
      USING ERRCODE = '22023';
  END IF;

  IF v_reason NOT IN (
    'spam',
    'harassment',
    'inappropriate_media',
    'personal_data',
    'misleading_or_dangerous',
    'other'
  ) THEN
    RAISE EXCEPTION 'Selecione um motivo válido para a denúncia.'
      USING ERRCODE = '22023';
  END IF;

  IF v_details IS NOT NULL AND char_length(v_details) > 500 THEN
    RAISE EXCEPTION 'A observação deve ter no máximo 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_reason = 'other' AND v_details IS NULL THEN
    RAISE EXCEPTION 'Informe uma observação para o motivo "Outro".'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa requisições simultâneas do mesmo denunciante para impor 5/hora sem corrida
  PERFORM pg_advisory_xact_lock(hashtext('flag_rate_limit:' || v_actor_id::text));

  -- Bloqueia o relato alvo para evitar corrida entre denúncia e ocultação/exclusão
  SELECT br.user_id, br.moderation_status
    INTO v_author_id, v_moderation_status
  FROM public.beach_reports br
  WHERE br.id = p_report_id
  FOR UPDATE;

  IF v_author_id IS NULL OR v_moderation_status <> 'visible' THEN
    RAISE EXCEPTION 'Este relato não está mais disponível para denúncia.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_author_id = v_actor_id THEN
    RAISE EXCEPTION 'Você não pode denunciar o próprio relato.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.beach_report_flags f
    WHERE f.report_id = p_report_id
      AND f.reporter_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Você já denunciou este relato.'
      USING ERRCODE = '23505';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_recent_count
  FROM public.beach_report_flags f
  WHERE f.reporter_id = v_actor_id
    AND f.created_at >= now() - interval '1 hour';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Você atingiu o limite de 5 denúncias por hora. Tente novamente mais tarde.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.beach_report_flags (
    report_id,
    reporter_id,
    reason,
    details,
    status
  )
  VALUES (
    p_report_id,
    v_actor_id,
    v_reason,
    v_details,
    'pending'
  )
  RETURNING id, public.beach_report_flags.created_at
    INTO v_inserted_id, v_inserted_created_at;

  RETURN QUERY
  SELECT
    v_inserted_id,
    p_report_id,
    v_reason,
    'pending'::text,
    v_inserted_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_beach_report_flag(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_beach_report_flag(uuid, text, text) TO authenticated;

-- ============================================================================
-- 7. RPC ADMINISTRATIVA: LISTAR FILA DE MODERAÇÃO AGRUPADA E PAGINADA
-- ============================================================================
-- Justificativa de SECURITY DEFINER:
-- Permite que moderadores verificados em private.moderators consultem denúncias
-- agrupadas e histórico administrativo sem expor beach_report_flags ou
-- beach_report_moderation_logs nem dados de auth.users a usuários comuns.
CREATE OR REPLACE FUNCTION public.get_moderation_reports(
  p_filter text DEFAULT 'pending',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_filter text := CASE WHEN p_filter = 'resolved' THEN 'resolved' ELSE 'pending' END;
  v_page integer := GREATEST(1, COALESCE(p_page, 1));
  v_page_size integer := LEAST(25, GREATEST(1, COALESCE(p_page_size, 10)));
  v_offset integer := (v_page - 1) * v_page_size;
  v_pending_reports_count integer := 0;
  v_resolved_reports_count integer := 0;
  v_total_count integer := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.moderators m WHERE m.user_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Acesso restrito à moderação.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_pending_reports_count
  FROM public.beach_reports br
  WHERE EXISTS (
    SELECT 1
    FROM public.beach_report_flags f
    WHERE f.report_id = br.id
      AND f.status = 'pending'
  );

  SELECT COUNT(*)::integer
    INTO v_resolved_reports_count
  FROM public.beach_reports br
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.beach_report_flags f
    WHERE f.report_id = br.id
      AND f.status = 'pending'
  )
  AND (
    br.moderation_status = 'hidden'
    OR EXISTS (
      SELECT 1
      FROM public.beach_report_flags f2
      WHERE f2.report_id = br.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.beach_report_moderation_logs ml
      WHERE ml.report_id = br.id
    )
  );

  v_total_count := CASE
    WHEN v_filter = 'pending' THEN v_pending_reports_count
    ELSE v_resolved_reports_count
  END;

  WITH candidate_reports AS (
    SELECT
      br.id AS report_id,
      br.beach_id,
      b.slug AS beach_slug,
      b.name AS beach_name,
      br.user_id AS author_id,
      COALESCE(NULLIF(btrim(p.display_name), ''), 'Banhista') AS author_name,
      p.avatar_url AS author_avatar_url,
      p.avatar_path AS author_avatar_path,
      br.rating,
      COALESCE(br.comment, '') AS comment,
      br.photo_path,
      br.created_at AS report_created_at,
      br.moderation_status,
      br.moderated_at,
      (
        SELECT COUNT(*)::integer
        FROM public.beach_report_flags fp
        WHERE fp.report_id = br.id
          AND fp.status = 'pending'
      ) AS pending_flags_count,
      (
        SELECT COUNT(*)::integer
        FROM public.beach_report_flags fa
        WHERE fa.report_id = br.id
      ) AS total_flags_count,
      (
        SELECT MAX(fa.created_at)
        FROM public.beach_report_flags fa
        WHERE fa.report_id = br.id
      ) AS latest_flag_at,
      (
        SELECT MAX(ml.created_at)
        FROM public.beach_report_moderation_logs ml
        WHERE ml.report_id = br.id
      ) AS latest_log_at
    FROM public.beach_reports br
    INNER JOIN public.beaches b
      ON b.id = br.beach_id
    LEFT JOIN public.profiles p
      ON p.id = br.user_id
    WHERE (
      v_filter = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.beach_report_flags f
        WHERE f.report_id = br.id
          AND f.status = 'pending'
      )
    ) OR (
      v_filter = 'resolved'
      AND NOT EXISTS (
        SELECT 1
        FROM public.beach_report_flags f
        WHERE f.report_id = br.id
          AND f.status = 'pending'
      )
      AND (
        br.moderation_status = 'hidden'
        OR EXISTS (
          SELECT 1
          FROM public.beach_report_flags f2
          WHERE f2.report_id = br.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.beach_report_moderation_logs ml
          WHERE ml.report_id = br.id
        )
      )
    )
  ),
  paged AS (
    SELECT
      *,
      CASE
        WHEN v_filter = 'pending' THEN COALESCE(latest_flag_at, report_created_at)
        ELSE COALESCE(moderated_at, latest_log_at, latest_flag_at, report_created_at)
      END AS sort_ts
    FROM candidate_reports
    ORDER BY
      CASE
        WHEN v_filter = 'pending' THEN COALESCE(latest_flag_at, report_created_at)
        ELSE COALESCE(moderated_at, latest_log_at, latest_flag_at, report_created_at)
      END DESC,
      report_created_at DESC,
      report_id DESC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'reportId', pd.report_id,
        'beachId', pd.beach_id,
        'beachSlug', pd.beach_slug,
        'beachName', pd.beach_name,
        'authorId', pd.author_id,
        'authorName', pd.author_name,
        'authorAvatarUrl', pd.author_avatar_url,
        'authorAvatarPath', pd.author_avatar_path,
        'rating', pd.rating,
        'comment', pd.comment,
        'photoPath', pd.photo_path,
        'reportCreatedAt', pd.report_created_at,
        'moderationStatus', pd.moderation_status,
        'moderatedAt', pd.moderated_at,
        'pendingFlagsCount', pd.pending_flags_count,
        'totalFlagsCount', pd.total_flags_count,
        'latestFlagAt', pd.latest_flag_at,
        'helpfulCount', (
          SELECT COUNT(*)::integer
          FROM public.beach_report_helpful_reactions rx
          WHERE rx.report_id = pd.report_id
        ),
        'reasonSummary', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('reason', rs.reason, 'count', rs.cnt)
            ORDER BY rs.cnt DESC, rs.reason ASC
          )
          FROM (
            SELECT f.reason, COUNT(*)::integer AS cnt
            FROM public.beach_report_flags f
            WHERE f.report_id = pd.report_id
            GROUP BY f.reason
          ) rs
        ), '[]'::jsonb),
        'flags', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'reason', f.reason,
              'details', f.details,
              'status', f.status,
              'createdAt', f.created_at,
              'reporterName', COALESCE(NULLIF(btrim(rp.display_name), ''), 'Banhista')
            )
            ORDER BY f.created_at DESC, f.id DESC
          )
          FROM public.beach_report_flags f
          LEFT JOIN public.profiles rp
            ON rp.id = f.reporter_id
          WHERE f.report_id = pd.report_id
        ), '[]'::jsonb),
        'logs', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ml.id,
              'action', ml.action,
              'reason', ml.reason,
              'flagsResolvedCount', ml.flags_resolved_count,
              'createdAt', ml.created_at,
              'moderatorName', COALESCE(NULLIF(btrim(mp.display_name), ''), 'Moderador')
            )
            ORDER BY ml.created_at DESC, ml.id DESC
          )
          FROM public.beach_report_moderation_logs ml
          LEFT JOIN public.profiles mp
            ON mp.id = ml.moderator_id
          WHERE ml.report_id = pd.report_id
        ), '[]'::jsonb)
      )
      ORDER BY pd.sort_ts DESC, pd.report_created_at DESC, pd.report_id DESC
    ),
    '[]'::jsonb
  )
    INTO v_items
  FROM paged pd;

  RETURN jsonb_build_object(
    'filter', v_filter,
    'page', v_page,
    'pageSize', v_page_size,
    'totalCount', v_total_count,
    'pendingReportsCount', v_pending_reports_count,
    'resolvedReportsCount', v_resolved_reports_count,
    'hasMore', (v_offset + jsonb_array_length(v_items)) < v_total_count,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_moderation_reports(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_moderation_reports(text, integer, integer) TO authenticated;

-- ============================================================================
-- 8. RPC ADMINISTRATIVA: DECISÃO TRANSACIONAL DE MODERAÇÃO
-- ============================================================================
-- Atualiza estado do relato, encerra denúncias pendentes e registra log na
-- mesma transação, com trava de linha (FOR UPDATE) e checagem otimista para
-- impedir sobrescrita silenciosa em decisões simultâneas.
CREATE OR REPLACE FUNCTION public.moderate_beach_report(
  p_report_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_expected_moderation_status text DEFAULT NULL,
  p_expected_pending_count integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_action text := btrim(COALESCE(p_action, ''));
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_current_status text;
  v_pending_count integer := 0;
  v_next_status text;
  v_next_flag_status text;
  v_resolved_count integer := 0;
  v_now timestamptz := now();
BEGIN
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM private.moderators m WHERE m.user_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Acesso restrito à moderação.'
      USING ERRCODE = '42501';
  END IF;

  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Relato inválido para moderação.'
      USING ERRCODE = '22023';
  END IF;

  IF v_action NOT IN ('keep_visible', 'hide', 'restore') THEN
    RAISE EXCEPTION 'Ação de moderação inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A justificativa deve ter no máximo 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_action IN ('hide', 'restore') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Informe uma justificativa para ocultar ou restaurar o relato.'
      USING ERRCODE = '22023';
  END IF;

  -- Trava exclusiva no relato para serializar decisões simultâneas e novas denúncias
  SELECT br.moderation_status
    INTO v_current_status
  FROM public.beach_reports br
  WHERE br.id = p_report_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Relato não encontrado ou já excluído pelo autor.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_pending_count
  FROM public.beach_report_flags f
  WHERE f.report_id = p_report_id
    AND f.status = 'pending';

  IF p_expected_moderation_status IS NOT NULL
     AND v_current_status <> p_expected_moderation_status THEN
    RAISE EXCEPTION 'Este relato já foi moderado por outro responsável. Atualize a fila antes de tentar novamente.'
      USING ERRCODE = '40001';
  END IF;

  IF p_expected_pending_count IS NOT NULL
     AND v_pending_count <> p_expected_pending_count THEN
    RAISE EXCEPTION 'As denúncias pendentes deste relato foram alteradas durante a revisão. Atualize a fila para conferir.'
      USING ERRCODE = '40001';
  END IF;

  IF v_action = 'keep_visible' THEN
    IF v_current_status <> 'visible' THEN
      RAISE EXCEPTION 'Este relato já está ocultado. Atualize a fila para vê-lo nas resolvidas.'
        USING ERRCODE = '40001';
    END IF;
    IF v_pending_count <= 0 THEN
      RAISE EXCEPTION 'Não há denúncias pendentes para encerrar neste relato.'
        USING ERRCODE = '40001';
    END IF;
    v_next_status := 'visible';
    v_next_flag_status := 'resolved_kept';
  ELSIF v_action = 'hide' THEN
    IF v_current_status <> 'visible' THEN
      RAISE EXCEPTION 'Este relato já foi ocultado anteriormente.'
        USING ERRCODE = '40001';
    END IF;
    v_next_status := 'hidden';
    v_next_flag_status := 'resolved_hidden';
  ELSE
    -- restore
    IF v_current_status <> 'hidden' THEN
      RAISE EXCEPTION 'Este relato já está visível.'
        USING ERRCODE = '40001';
    END IF;
    v_next_status := 'visible';
    v_next_flag_status := 'resolved_kept';
  END IF;

  UPDATE public.beach_reports
  SET
    moderation_status = v_next_status,
    moderated_at = v_now
  WHERE id = p_report_id;

  UPDATE public.beach_report_flags
  SET
    status = v_next_flag_status,
    reviewed_by = v_actor_id,
    reviewed_at = v_now
  WHERE report_id = p_report_id
    AND status = 'pending';

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;

  INSERT INTO public.beach_report_moderation_logs (
    report_id,
    moderator_id,
    action,
    reason,
    flags_resolved_count,
    created_at
  )
  VALUES (
    p_report_id,
    v_actor_id,
    v_action,
    v_reason,
    v_resolved_count,
    v_now
  );

  RETURN jsonb_build_object(
    'reportId', p_report_id,
    'action', v_action,
    'moderationStatus', v_next_status,
    'moderatedAt', v_now,
    'flagsResolvedCount', v_resolved_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_beach_report(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_beach_report(uuid, text, text, text, integer) TO authenticated;

COMMIT;
