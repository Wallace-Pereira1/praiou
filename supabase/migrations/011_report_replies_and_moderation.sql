-- 011_report_replies_and_moderation.sql
-- Etapa 9 do banco de dados do Praiou?: respostas textuais aos relatos (camada única),
-- contagens públicas em lote, denúncia de respostas e moderação manual em /moderacao.
-- Execução transacional e não destrutiva; não altera 001..010 em disco.

BEGIN;

-- ============================================================================
-- 1. TABELA DE RESPOSTAS: public.beach_report_replies
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_report_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.beach_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CONSTRAINT chk_beach_report_replies_body_length CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 500
  ),
  moderation_status text NOT NULL DEFAULT 'visible' CONSTRAINT chk_beach_report_replies_moderation_status CHECK (
    moderation_status IN ('visible', 'hidden')
  ),
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beach_report_replies_report_created_id_asc
  ON public.beach_report_replies (report_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_beach_report_replies_report_status_created_id_asc
  ON public.beach_report_replies (report_id, moderation_status, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_beach_report_replies_user_created_desc
  ON public.beach_report_replies (user_id, created_at DESC);

ALTER TABLE public.beach_report_replies ENABLE ROW LEVEL SECURITY;

-- Grants mínimos:
-- - anon e authenticated podem ler (sujeito à RLS de visibilidade).
-- - authenticated pode excluir apenas as próprias respostas (sujeito à RLS).
-- - Sem INSERT ou UPDATE diretos: criação passa pela RPC transacional com rate limit
--   e validação do relato pai; moderação passa exclusivamente por RPC administrativa.
REVOKE ALL ON TABLE public.beach_report_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beach_report_replies TO anon, authenticated;
GRANT DELETE ON TABLE public.beach_report_replies TO authenticated;

DROP POLICY IF EXISTS "beach_report_replies_select_visible_public"
  ON public.beach_report_replies;
CREATE POLICY "beach_report_replies_select_visible_public"
  ON public.beach_report_replies
  FOR SELECT
  TO anon, authenticated
  USING (
    moderation_status = 'visible'
    AND EXISTS (
      SELECT 1
      FROM public.beach_reports br
      WHERE br.id = beach_report_replies.report_id
        AND br.moderation_status = 'visible'
    )
  );

-- Autor vê a própria resposta ocultada apenas quando o relato pai continua visível;
-- relato ocultado não expõe conversa nem contagens públicas. Moderadores mantêm acesso
-- para revisão.
DROP POLICY IF EXISTS "beach_report_replies_select_own_or_moderator"
  ON public.beach_report_replies;
CREATE POLICY "beach_report_replies_select_own_or_moderator"
  ON public.beach_report_replies
  FOR SELECT
  TO authenticated
  USING (
    public.is_current_user_moderator()
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1
        FROM public.beach_reports br
        WHERE br.id = beach_report_replies.report_id
          AND br.moderation_status = 'visible'
      )
    )
  );

DROP POLICY IF EXISTS "beach_report_replies_delete_own"
  ON public.beach_report_replies;
CREATE POLICY "beach_report_replies_delete_own"
  ON public.beach_report_replies
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 2. RPC: PUBLICAR RESPOSTA (idempotência, visibilidade do pai e limite 10/10min)
-- ============================================================================
-- Justificativa de SECURITY DEFINER:
-- Impõe limite concorrente de 10 respostas em janela móvel de 10 minutos por usuário,
-- bloqueia novas respostas em relatos ocultados (inclusive para autor e moderador),
-- garante autoria via auth.uid() e impede definição manual de timestamps/moderação.
-- Limitação conhecida: o limite por conta autenticada não impede abuso por múltiplas contas.
CREATE OR REPLACE FUNCTION public.create_beach_report_reply(
  p_report_id uuid,
  p_body text,
  p_reply_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  report_id uuid,
  user_id uuid,
  body text,
  moderation_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_trimmed_body text := btrim(COALESCE(p_body, ''));
  v_target_reply_id uuid := COALESCE(p_reply_id, gen_random_uuid());
  v_report_status text;
  v_recent_count integer := 0;
  v_existing record;
  v_inserted_created_at timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Entre com sua conta Google para responder.'
      USING ERRCODE = '42501';
  END IF;

  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Relato inválido para resposta.'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_trimmed_body) < 1 OR char_length(v_trimmed_body) > 500 THEN
    RAISE EXCEPTION 'A resposta deve ter entre 1 e 500 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa publicações simultâneas da mesma conta para impor 10 respostas / 10 min
  PERFORM pg_advisory_xact_lock(hashtext('reply_rate_limit:' || v_actor_id::text));

  -- Suporte idempotente para reenvio após resposta de rede ambígua com o mesmo p_reply_id
  IF p_reply_id IS NOT NULL THEN
    SELECT
      r.id,
      r.report_id,
      r.user_id,
      r.body,
      r.moderation_status,
      r.created_at
      INTO v_existing
    FROM public.beach_report_replies r
    WHERE r.id = p_reply_id;

    IF FOUND THEN
      IF v_existing.user_id <> v_actor_id OR v_existing.report_id <> p_report_id THEN
        RAISE EXCEPTION 'Identificador de resposta inválido para esta solicitação.'
          USING ERRCODE = '42501';
      END IF;

      SELECT br.moderation_status
        INTO v_report_status
      FROM public.beach_reports br
      WHERE br.id = p_report_id;

      IF v_report_status IS NULL OR v_report_status <> 'visible' THEN
        RAISE EXCEPTION 'Este relato não está disponível para conversa.'
          USING ERRCODE = 'P0002';
      END IF;

      RETURN QUERY
      SELECT
        v_existing.id,
        v_existing.report_id,
        v_existing.user_id,
        v_existing.body,
        v_existing.moderation_status,
        v_existing.created_at;
      RETURN;
    END IF;
  END IF;

  -- Bloqueia o relato pai durante a transação para impedir corrida com ocultação/exclusão
  SELECT br.moderation_status
    INTO v_report_status
  FROM public.beach_reports br
  WHERE br.id = p_report_id
  FOR UPDATE;

  IF v_report_status IS NULL OR v_report_status <> 'visible' THEN
    RAISE EXCEPTION 'Este relato não está disponível para novas respostas.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_recent_count
  FROM public.beach_report_replies r
  WHERE r.user_id = v_actor_id
    AND r.created_at >= now() - interval '10 minutes';

  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'Você atingiu o limite inicial de 10 respostas a cada 10 minutos. Aguarde um instante antes de publicar novamente.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.beach_report_replies (
    id,
    report_id,
    user_id,
    body,
    moderation_status
  )
  VALUES (
    v_target_reply_id,
    p_report_id,
    v_actor_id,
    v_trimmed_body,
    'visible'
  )
  RETURNING public.beach_report_replies.created_at
    INTO v_inserted_created_at;

  RETURN QUERY
  SELECT
    v_target_reply_id,
    p_report_id,
    v_actor_id,
    v_trimmed_body,
    'visible'::text,
    v_inserted_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_beach_report_reply(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_beach_report_reply(uuid, text, uuid) TO authenticated;

-- ============================================================================
-- 3. RPC DE CONTAGEM PÚBLICA EM LOTE: public.get_beach_report_reply_summary
-- ============================================================================
-- Retorna apenas (report_id, reply_count) para relatos visíveis, contando apenas
-- respostas visíveis. Evita N+1 por cartão e respeita moderação de ambos os lados.
CREATE OR REPLACE FUNCTION public.get_beach_report_reply_summary(
  p_report_ids uuid[]
)
RETURNS TABLE (
  report_id uuid,
  reply_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_distinct_ids uuid[];
BEGIN
  IF p_report_ids IS NULL OR COALESCE(array_length(p_report_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF array_length(p_report_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Limite máximo de 50 relatos por consulta de respostas.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id_item), ARRAY[]::uuid[])
    INTO v_distinct_ids
  FROM unnest(p_report_ids) AS id_item
  WHERE id_item IS NOT NULL;

  IF COALESCE(array_length(v_distinct_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    br.id AS report_id,
    COUNT(rp.id)::integer AS reply_count
  FROM unnest(v_distinct_ids) AS requested(id)
  INNER JOIN public.beach_reports br
    ON br.id = requested.id
  LEFT JOIN public.beach_report_replies rp
    ON rp.report_id = br.id
   AND rp.moderation_status = 'visible'
  WHERE br.moderation_status = 'visible'
  GROUP BY br.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_beach_report_reply_summary(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beach_report_reply_summary(uuid[]) TO anon, authenticated;

-- ============================================================================
-- 4. DENÚNCIAS E LOGS DE MODERAÇÃO DE RESPOSTAS (chaves estrangeiras reais)
-- ============================================================================
-- Estrutura separada com FK real para beach_report_replies(id) ON DELETE CASCADE,
-- preservando integridade referencial sem alvo polimórfico e sem alterar 009.
CREATE TABLE IF NOT EXISTS public.beach_report_reply_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL REFERENCES public.beach_report_replies(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CONSTRAINT chk_beach_report_reply_flags_reason CHECK (
    reason IN (
      'spam',
      'harassment',
      'inappropriate_media',
      'personal_data',
      'misleading_or_dangerous',
      'other'
    )
  ),
  details text CONSTRAINT chk_beach_report_reply_flags_details_length CHECK (
    details IS NULL OR char_length(btrim(details)) <= 500
  ),
  status text NOT NULL DEFAULT 'pending' CONSTRAINT chk_beach_report_reply_flags_status CHECK (
    status IN ('pending', 'resolved_kept', 'resolved_hidden')
  ),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_beach_report_reply_flags_reply_reporter UNIQUE (reply_id, reporter_id),
  CONSTRAINT chk_beach_report_reply_flags_other_requires_details CHECK (
    reason <> 'other' OR (details IS NOT NULL AND char_length(btrim(details)) >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_beach_report_reply_flags_reply_status_created
  ON public.beach_report_reply_flags (reply_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beach_report_reply_flags_reporter_created
  ON public.beach_report_reply_flags (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beach_report_reply_flags_status_created
  ON public.beach_report_reply_flags (status, created_at DESC);

ALTER TABLE public.beach_report_reply_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beach_report_reply_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, reply_id, reporter_id, reason, details, status, created_at)
  ON TABLE public.beach_report_reply_flags TO authenticated;

DROP POLICY IF EXISTS "beach_report_reply_flags_select_own"
  ON public.beach_report_reply_flags;
CREATE POLICY "beach_report_reply_flags_select_own"
  ON public.beach_report_reply_flags
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE TABLE IF NOT EXISTS public.beach_report_reply_moderation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL REFERENCES public.beach_report_replies(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CONSTRAINT chk_reply_moderation_logs_action CHECK (
    action IN ('keep_visible', 'hide', 'restore')
  ),
  reason text CONSTRAINT chk_reply_moderation_logs_reason_length CHECK (
    reason IS NULL OR char_length(btrim(reason)) <= 500
  ),
  flags_resolved_count integer NOT NULL DEFAULT 0 CHECK (flags_resolved_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_reply_moderation_logs_reason_required CHECK (
    action = 'keep_visible' OR (reason IS NOT NULL AND char_length(btrim(reason)) >= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_beach_report_reply_moderation_logs_reply_created
  ON public.beach_report_reply_moderation_logs (reply_id, created_at DESC);

ALTER TABLE public.beach_report_reply_moderation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beach_report_reply_moderation_logs FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. RPC: DENUNCIAR RESPOSTA (validação, unicidade e rate limit compartilhado 5/hora)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_beach_report_reply_flag(
  p_reply_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS TABLE (
  flag_id uuid,
  reply_id uuid,
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
  v_reply_status text;
  v_report_status text;
  v_recent_report_flags integer := 0;
  v_recent_reply_flags integer := 0;
  v_inserted_id uuid;
  v_inserted_created_at timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Entre com sua conta Google para denunciar uma resposta.'
      USING ERRCODE = '42501';
  END IF;

  IF p_reply_id IS NULL THEN
    RAISE EXCEPTION 'Resposta inválida para denúncia.'
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

  -- Reutiliza a chave de trava do denunciante para impor o teto de 5 denúncias/hora
  PERFORM pg_advisory_xact_lock(hashtext('flag_rate_limit:' || v_actor_id::text));

  SELECT rp.user_id, rp.moderation_status, br.moderation_status
    INTO v_author_id, v_reply_status, v_report_status
  FROM public.beach_report_replies rp
  INNER JOIN public.beach_reports br
    ON br.id = rp.report_id
  WHERE rp.id = p_reply_id
  FOR UPDATE OF rp;

  IF v_author_id IS NULL OR v_reply_status <> 'visible' OR v_report_status <> 'visible' THEN
    RAISE EXCEPTION 'Esta resposta não está mais disponível para denúncia.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_author_id = v_actor_id THEN
    RAISE EXCEPTION 'Você não pode denunciar a própria resposta.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.beach_report_reply_flags f
    WHERE f.reply_id = p_reply_id
      AND f.reporter_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Você já denunciou esta resposta.'
      USING ERRCODE = '23505';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_recent_report_flags
  FROM public.beach_report_flags f
  WHERE f.reporter_id = v_actor_id
    AND f.created_at >= now() - interval '1 hour';

  SELECT COUNT(*)::integer
    INTO v_recent_reply_flags
  FROM public.beach_report_reply_flags f
  WHERE f.reporter_id = v_actor_id
    AND f.created_at >= now() - interval '1 hour';

  IF (v_recent_report_flags + v_recent_reply_flags) >= 5 THEN
    RAISE EXCEPTION 'Você atingiu o limite de 5 denúncias por hora. Tente novamente mais tarde.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.beach_report_reply_flags (
    reply_id,
    reporter_id,
    reason,
    details,
    status
  )
  VALUES (
    p_reply_id,
    v_actor_id,
    v_reason,
    v_details,
    'pending'
  )
  RETURNING id, public.beach_report_reply_flags.created_at
    INTO v_inserted_id, v_inserted_created_at;

  RETURN QUERY
  SELECT
    v_inserted_id,
    p_reply_id,
    v_reason,
    'pending'::text,
    v_inserted_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_beach_report_reply_flag(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_beach_report_reply_flag(uuid, text, text) TO authenticated;

-- ============================================================================
-- 6. RPC ADMINISTRATIVA: LISTAR RESPOSTAS NA MODERAÇÃO (agrupada e paginada)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_moderation_replies(
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
  v_pending_replies_count integer := 0;
  v_resolved_replies_count integer := 0;
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
    INTO v_pending_replies_count
  FROM public.beach_report_replies rp
  WHERE EXISTS (
    SELECT 1
    FROM public.beach_report_reply_flags f
    WHERE f.reply_id = rp.id
      AND f.status = 'pending'
  );

  SELECT COUNT(*)::integer
    INTO v_resolved_replies_count
  FROM public.beach_report_replies rp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.beach_report_reply_flags f
    WHERE f.reply_id = rp.id
      AND f.status = 'pending'
  )
  AND (
    rp.moderation_status = 'hidden'
    OR EXISTS (
      SELECT 1
      FROM public.beach_report_reply_flags f2
      WHERE f2.reply_id = rp.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.beach_report_reply_moderation_logs ml
      WHERE ml.reply_id = rp.id
    )
  );

  v_total_count := CASE
    WHEN v_filter = 'pending' THEN v_pending_replies_count
    ELSE v_resolved_replies_count
  END;

  WITH candidate_replies AS (
    SELECT
      rp.id AS reply_id,
      rp.report_id,
      br.beach_id,
      b.slug AS beach_slug,
      b.name AS beach_name,
      br.moderation_status AS report_moderation_status,
      COALESCE(br.comment, '') AS report_comment,
      COALESCE(NULLIF(btrim(rap.display_name), ''), 'Banhista') AS report_author_name,
      rp.user_id AS author_id,
      COALESCE(NULLIF(btrim(ap.display_name), ''), 'Banhista') AS author_name,
      ap.username AS author_username,
      ap.avatar_url AS author_avatar_url,
      ap.avatar_path AS author_avatar_path,
      rp.body,
      rp.created_at AS reply_created_at,
      rp.moderation_status,
      rp.moderated_at,
      (
        SELECT COUNT(*)::integer
        FROM public.beach_report_reply_flags fp
        WHERE fp.reply_id = rp.id
          AND fp.status = 'pending'
      ) AS pending_flags_count,
      (
        SELECT COUNT(*)::integer
        FROM public.beach_report_reply_flags fa
        WHERE fa.reply_id = rp.id
      ) AS total_flags_count,
      (
        SELECT MAX(fa.created_at)
        FROM public.beach_report_reply_flags fa
        WHERE fa.reply_id = rp.id
      ) AS latest_flag_at,
      (
        SELECT MAX(ml.created_at)
        FROM public.beach_report_reply_moderation_logs ml
        WHERE ml.reply_id = rp.id
      ) AS latest_log_at
    FROM public.beach_report_replies rp
    INNER JOIN public.beach_reports br
      ON br.id = rp.report_id
    INNER JOIN public.beaches b
      ON b.id = br.beach_id
    LEFT JOIN public.profiles ap
      ON ap.id = rp.user_id
    LEFT JOIN public.profiles rap
      ON rap.id = br.user_id
    WHERE (
      v_filter = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.beach_report_reply_flags f
        WHERE f.reply_id = rp.id
          AND f.status = 'pending'
      )
    ) OR (
      v_filter = 'resolved'
      AND NOT EXISTS (
        SELECT 1
        FROM public.beach_report_reply_flags f
        WHERE f.reply_id = rp.id
          AND f.status = 'pending'
      )
      AND (
        rp.moderation_status = 'hidden'
        OR EXISTS (
          SELECT 1
          FROM public.beach_report_reply_flags f2
          WHERE f2.reply_id = rp.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.beach_report_reply_moderation_logs ml
          WHERE ml.reply_id = rp.id
        )
      )
    )
  ),
  paged AS (
    SELECT
      *,
      CASE
        WHEN v_filter = 'pending' THEN COALESCE(latest_flag_at, reply_created_at)
        ELSE COALESCE(moderated_at, latest_log_at, latest_flag_at, reply_created_at)
      END AS sort_ts
    FROM candidate_replies
    ORDER BY
      CASE
        WHEN v_filter = 'pending' THEN COALESCE(latest_flag_at, reply_created_at)
        ELSE COALESCE(moderated_at, latest_log_at, latest_flag_at, reply_created_at)
      END DESC,
      reply_created_at DESC,
      reply_id DESC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'replyId', pd.reply_id,
        'reportId', pd.report_id,
        'beachId', pd.beach_id,
        'beachSlug', pd.beach_slug,
        'beachName', pd.beach_name,
        'reportModerationStatus', pd.report_moderation_status,
        'reportComment', pd.report_comment,
        'reportAuthorName', pd.report_author_name,
        'authorId', pd.author_id,
        'authorName', pd.author_name,
        'authorUsername', pd.author_username,
        'authorAvatarUrl', pd.author_avatar_url,
        'authorAvatarPath', pd.author_avatar_path,
        'body', pd.body,
        'replyCreatedAt', pd.reply_created_at,
        'moderationStatus', pd.moderation_status,
        'moderatedAt', pd.moderated_at,
        'pendingFlagsCount', pd.pending_flags_count,
        'totalFlagsCount', pd.total_flags_count,
        'latestFlagAt', pd.latest_flag_at,
        'reasonSummary', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('reason', rs.reason, 'count', rs.cnt)
            ORDER BY rs.cnt DESC, rs.reason ASC
          )
          FROM (
            SELECT f.reason, COUNT(*)::integer AS cnt
            FROM public.beach_report_reply_flags f
            WHERE f.reply_id = pd.reply_id
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
              'reporterName', COALESCE(NULLIF(btrim(rpp.display_name), ''), 'Banhista')
            )
            ORDER BY f.created_at DESC, f.id DESC
          )
          FROM public.beach_report_reply_flags f
          LEFT JOIN public.profiles rpp
            ON rpp.id = f.reporter_id
          WHERE f.reply_id = pd.reply_id
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
          FROM public.beach_report_reply_moderation_logs ml
          LEFT JOIN public.profiles mp
            ON mp.id = ml.moderator_id
          WHERE ml.reply_id = pd.reply_id
        ), '[]'::jsonb)
      )
      ORDER BY pd.sort_ts DESC, pd.reply_created_at DESC, pd.reply_id DESC
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
    'pendingRepliesCount', v_pending_replies_count,
    'resolvedRepliesCount', v_resolved_replies_count,
    'hasMore', (v_offset + jsonb_array_length(v_items)) < v_total_count,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_moderation_replies(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_moderation_replies(text, integer, integer) TO authenticated;

-- ============================================================================
-- 7. RPC ADMINISTRATIVA: DECISÃO TRANSACIONAL DE MODERAÇÃO DE RESPOSTA
-- ============================================================================
CREATE OR REPLACE FUNCTION public.moderate_beach_report_reply(
  p_reply_id uuid,
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

  IF p_reply_id IS NULL THEN
    RAISE EXCEPTION 'Resposta inválida para moderação.'
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
    RAISE EXCEPTION 'Informe uma justificativa para ocultar ou restaurar a resposta.'
      USING ERRCODE = '22023';
  END IF;

  SELECT rp.moderation_status
    INTO v_current_status
  FROM public.beach_report_replies rp
  WHERE rp.id = p_reply_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Resposta não encontrada ou já excluída pelo autor.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)::integer
    INTO v_pending_count
  FROM public.beach_report_reply_flags f
  WHERE f.reply_id = p_reply_id
    AND f.status = 'pending';

  IF p_expected_moderation_status IS NOT NULL
     AND v_current_status <> p_expected_moderation_status THEN
    RAISE EXCEPTION 'Esta resposta já foi moderada por outro responsável. Atualize a fila antes de tentar novamente.'
      USING ERRCODE = '40001';
  END IF;

  IF p_expected_pending_count IS NOT NULL
     AND v_pending_count <> p_expected_pending_count THEN
    RAISE EXCEPTION 'As denúncias pendentes desta resposta foram alteradas durante a revisão. Atualize a fila para conferir.'
      USING ERRCODE = '40001';
  END IF;

  IF v_action = 'keep_visible' THEN
    IF v_current_status <> 'visible' THEN
      RAISE EXCEPTION 'Esta resposta já está ocultada. Atualize a fila para vê-la nas resolvidas.'
        USING ERRCODE = '40001';
    END IF;
    IF v_pending_count <= 0 THEN
      RAISE EXCEPTION 'Não há denúncias pendentes para encerrar nesta resposta.'
        USING ERRCODE = '40001';
    END IF;
    v_next_status := 'visible';
    v_next_flag_status := 'resolved_kept';
  ELSIF v_action = 'hide' THEN
    IF v_current_status <> 'visible' THEN
      RAISE EXCEPTION 'Esta resposta já foi ocultada anteriormente.'
        USING ERRCODE = '40001';
    END IF;
    v_next_status := 'hidden';
    v_next_flag_status := 'resolved_hidden';
  ELSE
    -- restore
    IF v_current_status <> 'hidden' THEN
      RAISE EXCEPTION 'Esta resposta já está visível.'
        USING ERRCODE = '40001';
    END IF;
    v_next_status := 'visible';
    v_next_flag_status := 'resolved_kept';
  END IF;

  UPDATE public.beach_report_replies
  SET
    moderation_status = v_next_status,
    moderated_at = v_now
  WHERE id = p_reply_id;

  UPDATE public.beach_report_reply_flags
  SET
    status = v_next_flag_status,
    reviewed_by = v_actor_id,
    reviewed_at = v_now
  WHERE reply_id = p_reply_id
    AND status = 'pending';

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;

  INSERT INTO public.beach_report_reply_moderation_logs (
    reply_id,
    moderator_id,
    action,
    reason,
    flags_resolved_count,
    created_at
  )
  VALUES (
    p_reply_id,
    v_actor_id,
    v_action,
    v_reason,
    v_resolved_count,
    v_now
  );

  RETURN jsonb_build_object(
    'replyId', p_reply_id,
    'action', v_action,
    'moderationStatus', v_next_status,
    'moderatedAt', v_now,
    'flagsResolvedCount', v_resolved_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_beach_report_reply(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_beach_report_reply(uuid, text, text, text, integer) TO authenticated;

COMMIT;
