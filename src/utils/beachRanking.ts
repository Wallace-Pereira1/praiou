import type { Beach, BeachSnapshot } from '../types';

export const WORKER_CRON_CADENCE_MINUTES = 30;
// 1,5x a cadência de 30 min do Worker (tolerância a atraso de execução/rede antes de marcar como desatualizada)
export const SNAPSHOT_STALE_THRESHOLD_MS = 45 * 60 * 1000;

export type BeachSortMode = 'melhor-agora' | 'ordem-original' | 'nome';
export type BeachRegionFilter = 'todas' | 'zona-sul' | 'zona-oeste';
export type SnapshotAvailability = 'current' | 'stale' | 'missing';

export interface RankedBeachEntry {
  beach: Beach;
  snapshot: BeachSnapshot | null;
  availability: SnapshotAvailability;
  validScore: number | null;
  rank: number | null;
  isTied: boolean;
  isPartial: boolean;
}

export interface BeachRankingSummary {
  entries: RankedBeachEntry[];
  currentCount: number;
  currentFavorableCount: number;
  staleCount: number;
  missingCount: number;
  hasNoFavorableCurrentBeaches: boolean;
}

const AVAILABILITY_ORDER: Record<SnapshotAvailability, number> = {
  current: 0,
  stale: 1,
  missing: 2,
};

export function getRioHour(nowMs = Date.now()): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date(nowMs));
    const parsed = Number.parseInt(formatted, 10);
    if (Number.isFinite(parsed)) {
      return parsed % 24;
    }
  } catch {
    // Fallback local
  }
  return new Date(nowMs).getHours();
}

export function isRioNighttime(nowMs = Date.now()): boolean {
  const hour = getRioHour(nowMs);
  return hour >= 18 || hour < 6;
}

export function getValidSnapshotScore(
  snapshot: BeachSnapshot | null | undefined
): number | null {
  if (!snapshot || typeof snapshot.score !== 'number') {
    return null;
  }
  if (!Number.isFinite(snapshot.score)) {
    return null;
  }
  if (snapshot.score < 0 || snapshot.score > 100) {
    return null;
  }
  return snapshot.score;
}

export function getSnapshotAvailability(
  snapshot: BeachSnapshot | null | undefined,
  nowMs = Date.now()
): SnapshotAvailability {
  const validScore = getValidSnapshotScore(snapshot);
  if (!snapshot || validScore === null) {
    return 'missing';
  }

  if (snapshot.sourceStatus === 'stale') {
    return 'stale';
  }

  if (snapshot.fetchedAt) {
    const fetchedMs = Date.parse(snapshot.fetchedAt);
    if (Number.isFinite(fetchedMs) && nowMs - fetchedMs > SNAPSHOT_STALE_THRESHOLD_MS) {
      return 'stale';
    }
  }

  return 'current';
}

export function compareBeachesDeterministic(a: Beach, b: Beach): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.id.localeCompare(b.id);
}

export function rankAndFilterBeaches(params: {
  beaches: readonly Beach[];
  getSnapshotByBeachId: (beachId: string) => BeachSnapshot | undefined;
  regionFilter: BeachRegionFilter;
  searchQuery: string;
  sortMode: BeachSortMode;
  nowMs?: number;
}): BeachRankingSummary {
  const {
    beaches,
    getSnapshotByBeachId,
    regionFilter,
    searchQuery,
    sortMode,
    nowMs = Date.now(),
  } = params;

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filtered = beaches
    .filter((beach) => {
      if (regionFilter === 'zona-sul' && beach.region !== 'Zona Sul') {
        return false;
      }
      if (regionFilter === 'zona-oeste' && beach.region !== 'Zona Oeste') {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return (
        beach.name.toLowerCase().includes(normalizedSearch) ||
        beach.region.toLowerCase().includes(normalizedSearch)
      );
    })
    .map((beach): RankedBeachEntry => {
      const snapshot = getSnapshotByBeachId(beach.id) ?? null;
      const validScore = getValidSnapshotScore(snapshot);
      const availability = getSnapshotAvailability(snapshot, nowMs);

      return {
        beach,
        snapshot,
        availability,
        validScore,
        rank: null,
        isTied: false,
        isPartial:
          availability !== 'missing' && snapshot?.sourceStatus === 'partial',
      };
    });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'ordem-original') {
      return compareBeachesDeterministic(a.beach, b.beach);
    }

    if (sortMode === 'nome') {
      const byName = a.beach.name.localeCompare(b.beach.name, 'pt-BR', {
        sensitivity: 'base',
      });
      if (byName !== 0) return byName;
      return compareBeachesDeterministic(a.beach, b.beach);
    }

    // Modo ranking ('melhor-agora'): atuais primeiro, depois desatualizados, depois sem dados
    const groupDiff =
      AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability];
    if (groupDiff !== 0) {
      return groupDiff;
    }

    if (a.validScore !== null && b.validScore !== null && b.validScore !== a.validScore) {
      return b.validScore - a.validScore;
    }

    return compareBeachesDeterministic(a.beach, b.beach);
  });

  if (sortMode === 'melhor-agora') {
    let currentSeen = 0;
    let lastCurrentScore: number | null = null;
    let lastCurrentRank = 0;
    let lastCurrentEntry: RankedBeachEntry | null = null;

    for (const entry of sorted) {
      if (entry.availability !== 'current' || entry.validScore === null) {
        continue;
      }

      currentSeen += 1;
      if (lastCurrentScore !== null && entry.validScore === lastCurrentScore) {
        entry.rank = lastCurrentRank;
        entry.isTied = true;
        if (lastCurrentEntry) {
          lastCurrentEntry.isTied = true;
        }
      } else {
        lastCurrentRank = currentSeen;
        entry.rank = lastCurrentRank;
        lastCurrentScore = entry.validScore;
      }
      lastCurrentEntry = entry;
    }
  }

  let currentCount = 0;
  let currentFavorableCount = 0;
  let staleCount = 0;
  let missingCount = 0;

  for (const entry of sorted) {
    if (entry.availability === 'current') {
      currentCount += 1;
      if (
        entry.snapshot?.status === 'praiou' &&
        entry.validScore !== null &&
        entry.validScore >= 70
      ) {
        currentFavorableCount += 1;
      }
    } else if (entry.availability === 'stale') {
      staleCount += 1;
    } else {
      missingCount += 1;
    }
  }

  return {
    entries: sorted,
    currentCount,
    currentFavorableCount,
    staleCount,
    missingCount,
    hasNoFavorableCurrentBeaches:
      currentCount > 0 && currentFavorableCount === 0,
  };
}

function sanitizeSafetyAndHeatText(
  text: string,
  temperatureC: number | null
): string {
  let clean = text.trim();
  if (!clean) return '';

  // Não apresentar calor extremo como benefício/agradável
  if (temperatureC !== null && temperatureC >= 34 && /agrad[aá]vel/i.test(clean)) {
    const heatLabel =
      temperatureC >= 35
        ? `calor intenso (${Math.round(temperatureC)}°C)`
        : `calor de ${Math.round(temperatureC)}°C`;
    clean = clean.replace(/temperatura agrad[aá]vel(\s*\([^)]*\))?/gi, heatLabel);
    clean = clean.replace(/\bagrad[aá]vel\b/gi, heatLabel);
  }

  // Não afirmar segurança para banho, água própria ou ausência de correntes com base no score
  clean = clean
    .replace(/,\s*boas para entrar na [aá]gua/gi, ' na estimativa')
    .replace(/\bboas para entrar na [aá]gua\b/gi, 'na estimativa')
    .replace(/\bBom para banho e pegar sol\b/gi, 'Condições favoráveis na estimativa')
    .replace(/\bBom para banho\b/gi, 'Condições favoráveis na estimativa')
    .replace(/\bsegura para nadar\b/gi, 'ondas mais baixas na estimativa')
    .replace(/\bbanho liberado\b/gi, 'condição estimada favorável')
    .replace(/\b[aá]gua pr[oó]pria\b/gi, 'clima e mar estimados')
    .replace(/\bsem correntes\b/gi, 'ondas menores na estimativa');

  return clean;
}

const DIURNAL_SOLAR_REGEX = /\b(sol|solar|pegar sol|abertura de sol)\b/i;
const UV_ONLY_REGEX = /\b(uv|protetor solar)\b/i;

export function getBeachDisplayCopy(
  snapshot: BeachSnapshot,
  isNight: boolean
): { summaryReason: string; reasons: string[] } {
  let summaryReason = sanitizeSafetyAndHeatText(
    snapshot.summaryReason,
    snapshot.temperatureC
  );

  if (isNight && DIURNAL_SOLAR_REGEX.test(summaryReason)) {
    if (snapshot.status === 'praiou') {
      summaryReason =
        snapshot.cloudCover !== null && snapshot.cloudCover <= 35
          ? 'Noite de céu aberto e ondas previstas mais baixas'
          : 'Noite estável e mar mais calmo na estimativa';
    } else if (snapshot.status === 'talvez') {
      summaryReason = 'Condições moderadas à noite — acompanhe a previsão';
    } else {
      summaryReason = 'Condições desfavoráveis à noite na estimativa atual';
    }
  }

  if (!summaryReason) {
    summaryReason = isNight
      ? 'Condições noturnas estimadas para esta praia'
      : 'Condições estimadas para esta praia';
  }

  const adaptedReasons: string[] = [];

  for (const rawReason of snapshot.reasons) {
    let text = sanitizeSafetyAndHeatText(rawReason, snapshot.temperatureC);
    if (!text) continue;

    if (isNight) {
      if (UV_ONLY_REGEX.test(text)) {
        continue;
      }

      if (DIURNAL_SOLAR_REGEX.test(text)) {
        if (snapshot.cloudCover !== null && snapshot.cloudCover >= 70) {
          text = 'Céu mais encoberto à noite na estimativa';
        } else if (snapshot.temperatureC !== null) {
          const tempRounded = Math.round(snapshot.temperatureC);
          const tempNote =
            tempRounded >= 35
              ? `calor intenso (${tempRounded}°C)`
              : `${tempRounded}°C`;
          text = `Céu pouco nublado à noite (${tempNote})`;
        } else {
          text = 'Céu pouco nublado à noite na estimativa';
        }
      }
    }

    if (!adaptedReasons.includes(text)) {
      adaptedReasons.push(text);
    }

    if (adaptedReasons.length === 2) {
      break;
    }
  }

  return {
    summaryReason,
    reasons: adaptedReasons,
  };
}
