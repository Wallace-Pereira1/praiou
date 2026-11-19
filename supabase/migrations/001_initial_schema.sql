-- 001_initial_schema.sql
-- Etapa 1 do banco de dados do Praiou?: catálogo de praias e snapshots de clima/mar.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigger reutilizável para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- TABELA: beaches
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  region text NOT NULL CHECK (region IN ('Zona Sul', 'Zona Oeste')),
  neighborhood_note text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_beaches_updated_at ON public.beaches;
CREATE TRIGGER trg_beaches_updated_at
  BEFORE UPDATE ON public.beaches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_beaches_active_sort
  ON public.beaches (is_active, sort_order);

-- ============================================================================
-- TABELA: beach_snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beach_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES public.beaches(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('praiou', 'talvez', 'nao_praiou')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  summary_reason text,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  condition text CHECK (condition IN ('sun', 'partly_cloudy', 'cloudy', 'rain')),
  temperature_c numeric,
  rain_prob integer CHECK (rain_prob BETWEEN 0 AND 100),
  rain_mm numeric,
  wind_kmh numeric,
  wind_dir_deg integer CHECK (wind_dir_deg BETWEEN 0 AND 360),
  cloud_cover integer CHECK (cloud_cover BETWEEN 0 AND 100),
  uv_index numeric,
  wave_height_m numeric,
  wave_period_s numeric,
  wave_dir_deg integer CHECK (wave_dir_deg BETWEEN 0 AND 360),
  sea_temp_c numeric,
  hourly_forecast jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_status text NOT NULL DEFAULT 'ok' CHECK (source_status IN ('ok', 'partial', 'stale')),
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_beach_snapshots_beach_fetched UNIQUE (beach_id, fetched_at)
);

DROP TRIGGER IF EXISTS trg_beach_snapshots_updated_at ON public.beach_snapshots;
CREATE TRIGGER trg_beach_snapshots_updated_at
  BEFORE UPDATE ON public.beach_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índice composto para buscar rapidamente o snapshot mais recente de cada praia
CREATE INDEX IF NOT EXISTS idx_beach_snapshots_beach_fetched_desc
  ON public.beach_snapshots (beach_id, fetched_at DESC);

-- ============================================================================
-- VIEW: latest_beach_snapshots
-- Retorna apenas a leitura mais recente (fetched_at mais novo) por praia.
-- security_invoker = true garante que as políticas RLS de beach_snapshots sejam respeitadas.
-- ============================================================================
CREATE OR REPLACE VIEW public.latest_beach_snapshots
WITH (security_invoker = true) AS
SELECT DISTINCT ON (beach_id) *
FROM public.beach_snapshots
ORDER BY beach_id, fetched_at DESC;
