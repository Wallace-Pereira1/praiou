-- 012_reply_likes.sql
-- Etapa 10 do banco de dados do Praiou?: curtidas em respostas textuais aos relatos.
-- Execução transacional e não destrutiva; não altera migrations 001..011.

BEGIN;

-- ============================================================================
-- 1. TABELA DE CURTIDAS EM RESPOSTAS: public.beach_report_reply_likes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_report_reply_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL REFERENCES public.beach_report_replies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_beach_report_reply_likes_reply_user UNIQUE (reply_id, user_id)
);

-- Índice para contagem por reply_id e índice para buscar curtidas do usuário atual em lote
CREATE INDEX IF NOT EXISTS idx_beach_report_reply_likes_reply_id
  ON public.beach_report_reply_likes (reply_id);

CREATE INDEX IF NOT EXISTS idx_beach_report_reply_likes_user_reply
  ON public.beach_report_reply_likes (user_id, reply_id);

-- RLS habilitada e nenhum acesso direto de leitura/escrita pela API na tabela base.
-- Isso garante que pares (reply_id, user_id) de outras contas nunca sejam expostos
-- e que toda mutação passe exclusivamente pela RPC transacional.
ALTER TABLE public.beach_report_reply_likes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beach_report_reply_likes FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. RPC: ALTERNAR CURTIDA EM RESPOSTA (idempotente e concorrente-segura)
-- ============================================================================
-- Justificativa de SECURITY DEFINER:
-- A tabela base public.beach_report_reply_likes possui REVOKE ALL para PUBLIC, anon e
-- authenticated, impedindo INSERT/UPDATE/DELETE/SELECT diretos pela Data API para não
-- expor quem curtiu e para garantir validação atômica da visibilidade da resposta e do
-- relato pai. Por isso a RPC precisa de SECURITY DEFINER com search_path = '' e nomes
-- totalmente qualificados, usando auth.uid() internamente e retornando apenas
-- (reply_id, liked, like_count).
CREATE OR REPLACE FUNCTION public.toggle_beach_report_reply_like(
  p_reply_id uuid
)
RETURNS TABLE (
  reply_id uuid,
  liked boolean,
  like_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_reply_status text;
  v_report_status text;
  v_liked boolean := false;
  v_like_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Entre com sua conta Google para curtir respostas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_reply_id IS NULL THEN
    RAISE EXCEPTION 'Resposta inválida para curtida.'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa cliques simultâneos do mesmo usuário na mesma resposta para evitar corrida
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('reply_like:' || p_reply_id::text || ':' || v_actor_id::text)
  );

  -- Bloqueia em compartilhamento a resposta e o relato pai contra ocultação/exclusão concorrente.
  -- Não permite contorno por autor nem por moderador quando ocultos.
  SELECT rp.moderation_status, br.moderation_status
    INTO v_reply_status, v_report_status
  FROM public.beach_report_replies rp
  INNER JOIN public.beach_reports br
    ON br.id = rp.report_id
  WHERE rp.id = p_reply_id
  FOR SHARE OF rp, br;

  IF v_reply_status IS NULL
     OR v_reply_status <> 'visible'
     OR v_report_status <> 'visible' THEN
    RAISE EXCEPTION 'Esta resposta não está disponível para curtidas.'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.beach_report_reply_likes lk
  WHERE lk.reply_id = p_reply_id
    AND lk.user_id = v_actor_id;

  IF FOUND THEN
    v_liked := false;
  ELSE
    INSERT INTO public.beach_report_reply_likes (reply_id, user_id)
    VALUES (p_reply_id, v_actor_id)
    ON CONFLICT ON CONSTRAINT uq_beach_report_reply_likes_reply_user DO NOTHING;
    v_liked := true;
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_like_count
  FROM public.beach_report_reply_likes lk
  WHERE lk.reply_id = p_reply_id;

  RETURN QUERY
  SELECT
    p_reply_id,
    v_liked,
    GREATEST(0, COALESCE(v_like_count, 0))::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_beach_report_reply_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_beach_report_reply_like(uuid) TO authenticated;

-- ============================================================================
-- 3. RPC DE LEITURA E CONTAGEM EM LOTE: public.get_beach_report_reply_like_summary
-- ============================================================================
-- Justificativa de SECURITY DEFINER:
-- Como public.beach_report_reply_likes não possui permissão de leitura direta (para
-- proteger os user_ids de quem curtiu), uma função SECURITY INVOKER não conseguiria
-- agregar o total público de curtidas. Esta função usa search_path = '' e nomes
-- totalmente qualificados, aceita até 50 reply_ids, retorna somente
-- (reply_id, like_count, liked_by_me) e omite respostas/relatos ocultos.
CREATE OR REPLACE FUNCTION public.get_beach_report_reply_like_summary(
  p_reply_ids uuid[]
)
RETURNS TABLE (
  reply_id uuid,
  like_count integer,
  liked_by_me boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_distinct_ids uuid[];
BEGIN
  IF p_reply_ids IS NULL OR COALESCE(pg_catalog.array_length(p_reply_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.array_length(p_reply_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Limite máximo de 50 respostas por consulta de curtidas.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT id_item), ARRAY[]::uuid[])
    INTO v_distinct_ids
  FROM pg_catalog.unnest(p_reply_ids) AS id_item
  WHERE id_item IS NOT NULL;

  IF COALESCE(pg_catalog.array_length(v_distinct_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    rp.id AS reply_id,
    GREATEST(0, pg_catalog.count(lk.user_id))::integer AS like_count,
    CASE
      WHEN v_viewer_id IS NULL THEN false
      ELSE COALESCE(pg_catalog.bool_or(lk.user_id = v_viewer_id), false)
    END AS liked_by_me
  FROM pg_catalog.unnest(v_distinct_ids) AS requested(id)
  INNER JOIN public.beach_report_replies rp
    ON rp.id = requested.id
  INNER JOIN public.beach_reports br
    ON br.id = rp.report_id
  LEFT JOIN public.beach_report_reply_likes lk
    ON lk.reply_id = rp.id
  WHERE rp.moderation_status = 'visible'
    AND br.moderation_status = 'visible'
  GROUP BY rp.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_beach_report_reply_like_summary(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beach_report_reply_like_summary(uuid[]) TO anon, authenticated;

COMMIT;
