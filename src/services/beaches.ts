import { MOCK_BEACHES } from '../data/mockBeaches';
import { supabase } from '../lib/supabase';
import type { Beach, PraiouRegion } from '../types';

interface SupabaseBeachRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  neighborhood_note: string | null;
  latitude: number;
  longitude: number;
  sort_order: number;
  is_active: boolean;
}

const BEACHES_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedBeaches: { data: Beach[]; cachedAtMs: number } | null = null;
let inFlightBeaches: Promise<Beach[]> | null = null;

function getMockBeachesSorted(): Beach[] {
  return [...MOCK_BEACHES].sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapSupabaseBeach(row: SupabaseBeachRow): Beach {
  const region: PraiouRegion =
    row.region === 'Zona Oeste' ? 'Zona Oeste' : 'Zona Sul';

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region,
    neighborhoodNote: row.neighborhood_note ?? '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    sortOrder: row.sort_order,
  };
}

export async function getBeaches(): Promise<Beach[]> {
  if (cachedBeaches && Date.now() - cachedBeaches.cachedAtMs < BEACHES_CACHE_TTL_MS) {
    return cachedBeaches.data;
  }

  if (inFlightBeaches) {
    return inFlightBeaches;
  }

  if (!supabase) {
    const mocks = getMockBeachesSorted();
    cachedBeaches = { data: mocks, cachedAtMs: Date.now() };
    return mocks;
  }

  const client = supabase;

  inFlightBeaches = (async (): Promise<Beach[]> => {
    try {
      const { data, error } = await client
        .from('beaches')
        .select(
          'id, slug, name, region, neighborhood_note, latitude, longitude, sort_order, is_active'
        )
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error || !data || data.length === 0) {
        return getMockBeachesSorted();
      }

      const mapped = (data as SupabaseBeachRow[]).map(mapSupabaseBeach);
      cachedBeaches = { data: mapped, cachedAtMs: Date.now() };
      return mapped;
    } catch {
      return getMockBeachesSorted();
    } finally {
      inFlightBeaches = null;
    }
  })();

  return inFlightBeaches;
}

export async function getBeachBySlug(slug: string): Promise<Beach | null> {
  if (cachedBeaches && Date.now() - cachedBeaches.cachedAtMs < BEACHES_CACHE_TTL_MS) {
    const cachedHit = cachedBeaches.data.find((b) => b.slug === slug);
    if (cachedHit) return cachedHit;
  }

  if (!supabase) {
    return MOCK_BEACHES.find((beach) => beach.slug === slug) ?? null;
  }

  try {
    const { data, error } = await supabase
      .from('beaches')
      .select(
        'id, slug, name, region, neighborhood_note, latitude, longitude, sort_order, is_active'
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return MOCK_BEACHES.find((beach) => beach.slug === slug) ?? null;
    }

    return mapSupabaseBeach(data as SupabaseBeachRow);
  } catch {
    return MOCK_BEACHES.find((beach) => beach.slug === slug) ?? null;
  }
}
