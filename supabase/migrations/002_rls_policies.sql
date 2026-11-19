-- 002_rls_policies.sql
-- Políticas de Row Level Security (RLS) para a Etapa 1 (beaches e beach_snapshots).
--
-- IMPORTANTE:
-- Enquanto não houver Cloudflare Worker, qualquer snapshot inserido no banco
-- deve ser gravado manualmente pelo SQL Editor do Supabase ou por script administrativo.
-- Quando o Cloudflare Worker entrar em produção, ele usará a chave secreta
-- SUPABASE_SERVICE_ROLE_KEY (que ignora RLS por padrão) para gravar snapshots.
-- Por isso, usuários anon e authenticated têm APENAS permissão de leitura (SELECT).

ALTER TABLE public.beaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beach_snapshots ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas caso o script seja reexecutado
DROP POLICY IF EXISTS "beaches_select_public" ON public.beaches;
DROP POLICY IF EXISTS "beach_snapshots_select_public" ON public.beach_snapshots;

-- Leitura pública de praias ativas para visitantes anônimos e autenticados
CREATE POLICY "beaches_select_public"
  ON public.beaches
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Leitura pública de snapshots para visitantes anônimos e autenticados
CREATE POLICY "beach_snapshots_select_public"
  ON public.beach_snapshots
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Não criamos políticas de INSERT, UPDATE ou DELETE para anon/authenticated.
-- Sem política permissiva, qualquer escrita pelo frontend usando anon_key é bloqueada.
