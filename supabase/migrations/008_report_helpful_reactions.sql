-- 008_report_helpful_reactions.sql
-- Etapa 6 do banco de dados do Praiou?: reação "Foi útil" nos relatos (public.beach_reports).
-- Execução transacional e não destrutiva; não altera 001, 002, 003, 004, 005, 006 ou 007.

BEGIN;

-- ============================================================================
-- TABELA: public.beach_report_helpful_reactions
-- ============================================================================
-- Armazena uma única marcação positiva ("Foi útil") por usuário em cada relato.
-- A chave primária composta (report_id, user_id) impede duplicidade no banco
-- mesmo sob requisições simultâneas.
-- ON DELETE CASCADE remove automaticamente as reações quando o relato ou o
-- perfil/usuário correspondente for excluído.

CREATE TABLE IF NOT EXISTS public.beach_report_helpful_reactions (
  report_id uuid NOT NULL REFERENCES public.beach_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_beach_report_helpful_reactions_user_report
  ON public.beach_report_helpful_reactions (user_id, report_id);

-- Reforço em trigger contra autorreação (defesa em profundidade além da RLS)
CREATE OR REPLACE FUNCTION public.prevent_self_report_helpful_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT br.user_id
    INTO v_author_id
  FROM public.beach_reports br
  WHERE br.id = NEW.report_id;

  IF v_author_id IS NOT NULL AND v_author_id = NEW.user_id THEN
    RAISE EXCEPTION 'Você não pode marcar o próprio relato como útil.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_self_report_helpful_reaction() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_prevent_self_report_helpful_reaction
  ON public.beach_report_helpful_reactions;
CREATE TRIGGER trg_prevent_self_report_helpful_reaction
  BEFORE INSERT ON public.beach_report_helpful_reactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_report_helpful_reaction();

-- RLS e grants mínimos na tabela base:
-- - anon não tem acesso direto à tabela (não expõe pares report_id/user_id).
-- - authenticated só lê, insere e remove as próprias marcações.
-- - UPDATE bloqueado (sem grant nem política).
ALTER TABLE public.beach_report_helpful_reactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beach_report_helpful_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.beach_report_helpful_reactions TO authenticated;
GRANT INSERT (report_id, user_id) ON TABLE public.beach_report_helpful_reactions TO authenticated;
GRANT DELETE ON TABLE public.beach_report_helpful_reactions TO authenticated;

DROP POLICY IF EXISTS "helpful_reactions_select_own" ON public.beach_report_helpful_reactions;
CREATE POLICY "helpful_reactions_select_own"
  ON public.beach_report_helpful_reactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "helpful_reactions_insert_own_other_author" ON public.beach_report_helpful_reactions;
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
    )
  );

DROP POLICY IF EXISTS "helpful_reactions_delete_own" ON public.beach_report_helpful_reactions;
CREATE POLICY "helpful_reactions_delete_own"
  ON public.beach_report_helpful_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- RPC DE AGREGAÇÃO SEGURA: public.get_beach_report_helpful_summary(uuid[])
-- ============================================================================
-- Justificativa de SECURITY DEFINER:
-- A tabela base restringe SELECT ao próprio auth.uid() (e bloqueia anon) para
-- impedir exposição da lista individual de quem reagiu. Uma função SECURITY INVOKER
-- não teria visibilidade das marcações de outros usuários para calcular o total público.
-- Esta RPC retorna apenas (report_id, helpful_count, viewer_has_reacted) usando
-- auth.uid() internamente, com limite máximo de 50 IDs por chamada.

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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
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
  GROUP BY br.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_beach_report_helpful_summary(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beach_report_helpful_summary(uuid[]) TO anon, authenticated;

COMMIT;
