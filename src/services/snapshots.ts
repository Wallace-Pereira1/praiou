import { MOCK_BEACHES } from '../data/mockBeaches';
import { MOCK_SNAPSHOTS } from '../data/mockSnapshots';
import { supabase } from '../lib/supabase';
import type {
  Beach,
  BeachSnapshot,
  HourlyForecastPoint,
  PraiouStatus,
  SnapshotSourceStatus,
  WeatherConditionType,
} from '../types';
import { getBeaches } from './beaches';
import { fetchLiveConditionsForBeach } from './weather';

const CACHE_TTL_MS = 10 * 60 * 1000; // Cache em memória: 10 minutos
const SUPABASE_FRESHNESS_MS = 30 * 60 * 1000; // Snapshot do Supabase válido se <= 30 min

interface CachedEntry {
  snapshot: BeachSnapshot;
  cachedAtMs: number;
}

interface SupabaseSnapshotRow {
  id: string;
  beach_id: string;
  status: string;
  score: number;
  summary_reason: string | null;
  reasons: unknown;
  condition: string | null;
  temperature_c: number | string | null;
  rain_prob: number | null;
  rain_mm: number | string | null;
  wind_kmh: number | string | null;
  wind_dir_deg: number | null;
  cloud_cover: number | null;
  uv_index: number | string | null;
  wave_height_m: number | string | null;
  wave_period_s: number | string | null;
  wave_dir_deg: number | null;
  sea_temp_c: number | string | null;
  hourly_forecast: unknown;
  source_status: string;
  fetched_at: string;
}

const mockByBeachId = new Map<string, BeachSnapshot>(
  MOCK_SNAPSHOTS.map((snap) => [snap.beachId, snap])
);

const mockBySlug = new Map<string, BeachSnapshot>();
for (const beach of MOCK_BEACHES) {
  const snap = mockByBeachId.get(beach.id);
  if (snap) mockBySlug.set(beach.slug, snap);
}

const snapshotCache = new Map<string, CachedEntry>();
const inFlightByBeach = new Map<string, Promise<BeachSnapshot | null>>();
let inFlightBatch: Promise<BeachSnapshot[]> | null = null;

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatFetchedTimeBRT(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  } catch {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(
      parsed.getMinutes()
    ).padStart(2, '0')}`;
  }
}

function normalizeStatus(raw: string): PraiouStatus {
  if (raw === 'praiou' || raw === 'talvez' || raw === 'nao_praiou') return raw;
  return 'talvez';
}

function normalizeSourceStatus(raw: string): SnapshotSourceStatus {
  if (raw === 'ok' || raw === 'partial' || raw === 'stale') return raw;
  return 'ok';
}

function normalizeCondition(raw: string | null): WeatherConditionType {
  if (
    raw === 'sun' ||
    raw === 'partly_cloudy' ||
    raw === 'cloudy' ||
    raw === 'rain'
  ) {
    return raw;
  }
  return 'partly_cloudy';
}

function mapSupabaseSnapshot(row: SupabaseSnapshotRow): BeachSnapshot {
  const reasons = Array.isArray(row.reasons)
    ? row.reasons.filter((item): item is string => typeof item === 'string')
    : [];

  const hourlyForecast: HourlyForecastPoint[] = Array.isArray(row.hourly_forecast)
    ? (row.hourly_forecast as HourlyForecastPoint[])
    : [];

  return {
    id: row.id,
    beachId: row.beach_id,
    status: normalizeStatus(row.status),
    score: Number(row.score),
    summaryReason: row.summary_reason ?? 'Condições registradas para esta praia',
    reasons: reasons.slice(0, 3),
    condition: normalizeCondition(row.condition),
    temperatureC: toNumberOrNull(row.temperature_c),
    rainProb: toNumberOrNull(row.rain_prob),
    rainMm: toNumberOrNull(row.rain_mm),
    windKmh: toNumberOrNull(row.wind_kmh),
    windDirDeg: toNumberOrNull(row.wind_dir_deg),
    cloudCover: toNumberOrNull(row.cloud_cover),
    uvIndex: toNumberOrNull(row.uv_index),
    waveHeightM: toNumberOrNull(row.wave_height_m),
    wavePeriodS: toNumberOrNull(row.wave_period_s),
    waveDirDeg: toNumberOrNull(row.wave_dir_deg),
    seaTempC: toNumberOrNull(row.sea_temp_c),
    hourlyForecast,
    sourceStatus: normalizeSourceStatus(row.source_status),
    updatedAtLabel: formatFetchedTimeBRT(row.fetched_at),
  };
}

function isRowFreshEnough(fetchedAtIso: string): boolean {
  const fetchedMs = Date.parse(fetchedAtIso);
  if (Number.isNaN(fetchedMs)) return false;
  return Date.now() - fetchedMs <= SUPABASE_FRESHNESS_MS;
}

function getFallbackForBeach(beach: Beach): BeachSnapshot | undefined {
  const cached = snapshotCache.get(beach.id)?.snapshot;
  if (cached) return cached;

  const byId = mockByBeachId.get(beach.id);
  if (byId) return byId;

  const bySlug = mockBySlug.get(beach.slug);
  if (!bySlug) return undefined;

  return {
    ...bySlug,
    beachId: beach.id,
  };
}

async function resolveBeachSnapshot(
  beach: Beach,
  supabaseRow: SupabaseSnapshotRow | null
): Promise<BeachSnapshot | null> {
  const supabaseSnapshot = supabaseRow ? mapSupabaseSnapshot(supabaseRow) : undefined;

  // 1. Se houver snapshot no Supabase dentro da janela de 30 minutos, usa ele primeiro
  if (supabaseRow && supabaseSnapshot && isRowFreshEnough(supabaseRow.fetched_at)) {
    snapshotCache.set(beach.id, {
      snapshot: supabaseSnapshot,
      cachedAtMs: Date.now(),
    });
    return supabaseSnapshot;
  }

  // 2. Caso não exista no Supabase ou tenha mais de 30 min, tenta atualizar com Open-Meteo
  const previousValid = supabaseSnapshot ?? getFallbackForBeach(beach);

  try {
    const liveSnapshot = await fetchLiveConditionsForBeach(beach, previousValid);
    snapshotCache.set(beach.id, {
      snapshot: liveSnapshot,
      cachedAtMs: Date.now(),
    });
    return liveSnapshot;
  } catch {
    // 3. Se a Open-Meteo falhar, preserva o último snapshot válido marcando como 'stale'
    if (!previousValid) return null;

    const staleSnapshot: BeachSnapshot = {
      ...previousValid,
      beachId: beach.id,
      sourceStatus: 'stale',
    };

    snapshotCache.set(beach.id, {
      snapshot: staleSnapshot,
      cachedAtMs: Date.now(),
    });
    return staleSnapshot;
  }
}

async function fetchSupabaseLatestMap(): Promise<Map<string, SupabaseSnapshotRow>> {
  const map = new Map<string, SupabaseSnapshotRow>();
  if (!supabase) return map;

  try {
    const { data, error } = await supabase
      .from('latest_beach_snapshots')
      .select('*');

    if (error || !data) return map;

    for (const row of data as SupabaseSnapshotRow[]) {
      map.set(row.beach_id, row);
    }
  } catch {
    // Fallback silencioso para Open-Meteo / cache / mocks
  }

  return map;
}

export async function getLatestSnapshotByBeach(
  beachId: string,
  forceRefresh = false
): Promise<BeachSnapshot | null> {
  const cached = snapshotCache.get(beachId);
  if (!forceRefresh && cached && Date.now() - cached.cachedAtMs < CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const existing = inFlightByBeach.get(beachId);
  if (existing) {
    return existing;
  }

  const requestPromise = (async (): Promise<BeachSnapshot | null> => {
    const beaches = await getBeaches();
    const beach = beaches.find((b) => b.id === beachId);
    if (!beach) return null;

    let supabaseRow: SupabaseSnapshotRow | null = null;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('latest_beach_snapshots')
          .select('*')
          .eq('beach_id', beachId)
          .maybeSingle();

        if (!error && data) {
          supabaseRow = data as SupabaseSnapshotRow;
        }
      } catch {
        // Fallback segue para Open-Meteo / último válido
      }
    }

    return resolveBeachSnapshot(beach, supabaseRow);
  })().finally(() => {
    inFlightByBeach.delete(beachId);
  });

  inFlightByBeach.set(beachId, requestPromise);
  return requestPromise;
}

export async function getLatestSnapshots(
  forceRefresh = false
): Promise<BeachSnapshot[]> {
  if (!forceRefresh && inFlightBatch) {
    return inFlightBatch;
  }

  const batchPromise = (async (): Promise<BeachSnapshot[]> => {
    const beaches = await getBeaches();

    if (!forceRefresh) {
      const allFreshInMemory = beaches.every((beach) => {
        const entry = snapshotCache.get(beach.id);
        return entry && Date.now() - entry.cachedAtMs < CACHE_TTL_MS;
      });

      if (allFreshInMemory) {
        return beaches
          .map((b) => snapshotCache.get(b.id)?.snapshot)
          .filter((s): s is BeachSnapshot => Boolean(s));
      }
    }

    const supabaseRowsByBeach = await fetchSupabaseLatestMap();

    const resolved = await Promise.all(
      beaches.map(async (beach) => {
        const existing = inFlightByBeach.get(beach.id);
        if (existing) return existing;

        const p = resolveBeachSnapshot(
          beach,
          supabaseRowsByBeach.get(beach.id) ?? null
        ).finally(() => {
          inFlightByBeach.delete(beach.id);
        });
        inFlightByBeach.set(beach.id, p);
        return p;
      })
    );

    return resolved.filter((snap): snap is BeachSnapshot => snap !== null);
  })().finally(() => {
    inFlightBatch = null;
  });

  inFlightBatch = batchPromise;
  return batchPromise;
}

export async function getHourlyForecast(
  beachId: string,
  forceRefresh = false
): Promise<HourlyForecastPoint[]> {
  const snapshot = await getLatestSnapshotByBeach(beachId, forceRefresh);
  return snapshot ? [...snapshot.hourlyForecast] : [];
}
