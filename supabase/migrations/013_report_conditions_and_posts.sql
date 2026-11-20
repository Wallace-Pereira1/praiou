-- 013_report_conditions_and_posts.sql
-- Etapa 10 do banco de dados do Praiou?:
-- 1) Cadastro de postos reais por praia (public.beach_posts).
-- 2) Campos opcionais de condição no relato (post_code, sky_condition, sea_condition, crowd_level).
-- 3) Substituição do fluxo obrigatório de "Sóis": torna rating opcional/legado (DROP NOT NULL),
--    preservando registros históricos com rating preenchido e todas as políticas/permissões existentes.
-- Execução transacional e não destrutiva; não altera 001 a 012.

BEGIN;

-- ============================================================================
-- 1. TABELA DE REFERÊNCIA: public.beach_posts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES public.beaches(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  sort_order smallint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_beach_posts_code_format
    CHECK (code ~ '^posto-[1-9][0-9]*$'),
  CONSTRAINT chk_beach_posts_label_length
    CHECK (char_length(btrim(label)) BETWEEN 2 AND 40),
  CONSTRAINT uq_beach_posts_beach_code
    UNIQUE (beach_id, code),
  CONSTRAINT uq_beach_posts_beach_sort
    UNIQUE (beach_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_beach_posts_beach_active_sort
  ON public.beach_posts (beach_id, is_active, sort_order);

ALTER TABLE public.beach_posts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beach_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beach_posts TO anon, authenticated;

DROP POLICY IF EXISTS "beach_posts_select_public" ON public.beach_posts;
CREATE POLICY "beach_posts_select_public"
  ON public.beach_posts
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Popula os postos reais correspondentes a cada praia cadastrada em public.beaches.
WITH seed_posts(beach_slug, code, label, sort_order) AS (
  VALUES
    -- Leme (posto único)
    ('leme', 'posto-1', 'Posto 1', 1),

    -- Copacabana (Postos 2 ao 6)
    ('copacabana', 'posto-2', 'Posto 2', 2),
    ('copacabana', 'posto-3', 'Posto 3', 3),
    ('copacabana', 'posto-4', 'Posto 4', 4),
    ('copacabana', 'posto-5', 'Posto 5', 5),
    ('copacabana', 'posto-6', 'Posto 6', 6),

    -- Arpoador (posto único)
    ('arpoador', 'posto-7', 'Posto 7', 7),

    -- Ipanema (Postos 8 ao 10)
    ('ipanema', 'posto-8', 'Posto 8', 8),
    ('ipanema', 'posto-9', 'Posto 9', 9),
    ('ipanema', 'posto-10', 'Posto 10', 10),

    -- Leblon (Postos 11 e 12)
    ('leblon', 'posto-11', 'Posto 11', 11),
    ('leblon', 'posto-12', 'Posto 12', 12),

    -- São Conrado (posto único)
    ('sao-conrado', 'posto-13', 'Posto 13', 13),

    -- Barra da Tijuca (Postos 1 ao 8)
    ('barra-da-tijuca', 'posto-1', 'Posto 1', 1),
    ('barra-da-tijuca', 'posto-2', 'Posto 2', 2),
    ('barra-da-tijuca', 'posto-3', 'Posto 3', 3),
    ('barra-da-tijuca', 'posto-4', 'Posto 4', 4),
    ('barra-da-tijuca', 'posto-5', 'Posto 5', 5),
    ('barra-da-tijuca', 'posto-6', 'Posto 6', 6),
    ('barra-da-tijuca', 'posto-7', 'Posto 7', 7),
    ('barra-da-tijuca', 'posto-8', 'Posto 8', 8),

    -- Recreio dos Bandeirantes (Postos 9 ao 12)
    ('recreio', 'posto-9', 'Posto 9', 9),
    ('recreio', 'posto-10', 'Posto 10', 10),
    ('recreio', 'posto-11', 'Posto 11', 11),
    ('recreio', 'posto-12', 'Posto 12', 12)
)
INSERT INTO public.beach_posts (beach_id, code, label, sort_order, is_active)
SELECT
  b.id,
  sp.code,
  sp.label,
  sp.sort_order,
  true
FROM seed_posts sp
INNER JOIN public.beaches b
  ON b.slug = sp.beach_slug
ON CONFLICT (beach_id, code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- 2. ATUALIZAÇÃO DE public.beach_reports: rating OPCIONAL + CONDIÇÕES OPCIONAIS
-- ============================================================================
-- Mantém registros antigos com rating válido (1..5), mas permite novos relatos sem rating.
ALTER TABLE public.beach_reports
  ALTER COLUMN rating DROP NOT NULL;

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_rating;

ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_rating
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- Colunas opcionais de posto e condições observadas na praia
ALTER TABLE public.beach_reports
  ADD COLUMN IF NOT EXISTS post_code text,
  ADD COLUMN IF NOT EXISTS sky_condition text,
  ADD COLUMN IF NOT EXISTS sea_condition text,
  ADD COLUMN IF NOT EXISTS crowd_level text;

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_post_code_format;
ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_post_code_format
  CHECK (post_code IS NULL OR post_code ~ '^posto-[1-9][0-9]*$');

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_sky_condition;
ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_sky_condition
  CHECK (sky_condition IS NULL OR sky_condition IN ('clear', 'partly_cloudy', 'overcast'));

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_sea_condition;
ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_sea_condition
  CHECK (sea_condition IS NULL OR sea_condition IN ('calm', 'moderate', 'rough'));

ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS chk_beach_reports_crowd_level;
ALTER TABLE public.beach_reports
  ADD CONSTRAINT chk_beach_reports_crowd_level
  CHECK (crowd_level IS NULL OR crowd_level IN ('empty', 'moderate', 'crowded'));

-- Chave estrangeira composta garante que, quando post_code for informado,
-- ele obrigatoriamente pertence ao beach_id do relato (MATCH SIMPLE permite post_code IS NULL).
ALTER TABLE public.beach_reports
  DROP CONSTRAINT IF EXISTS fk_beach_reports_beach_post;
ALTER TABLE public.beach_reports
  ADD CONSTRAINT fk_beach_reports_beach_post
  FOREIGN KEY (beach_id, post_code)
  REFERENCES public.beach_posts (beach_id, code)
  ON DELETE RESTRICT;

-- Concede INSERT apenas nas novas colunas opcionais para authenticated (sem liberar UPDATE).
GRANT INSERT (post_code, sky_condition, sea_condition, crowd_level)
  ON TABLE public.beach_reports TO authenticated;

-- Atualiza política de INSERT para validar que, se houver post_code, o posto está ativo na praia informada.
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
    AND (
      beach_reports.post_code IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.beach_posts bp
        WHERE bp.beach_id = beach_reports.beach_id
          AND bp.code = beach_reports.post_code
          AND bp.is_active = true
      )
    )
  );

-- ============================================================================
-- 3. ATUALIZAÇÃO DA RPC DE MODERAÇÃO PARA INCLUIR CONDIÇÕES OPCIONAIS
-- ============================================================================
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
      br.post_code,
      br.sky_condition,
      br.sea_condition,
      br.crowd_level,
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
        'postCode', pd.post_code,
        'skyCondition', pd.sky_condition,
        'seaCondition', pd.sea_condition,
        'crowdLevel', pd.crowd_level,
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

COMMIT;
