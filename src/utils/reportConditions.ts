import type {
  BeachPostOption,
  ReportCrowdLevel,
  ReportSeaCondition,
  ReportSkyCondition,
} from '../types';

function makePost(num: number): BeachPostOption {
  return {
    code: `posto-${num}`,
    label: `Posto ${num}`,
    sortOrder: num,
  };
}

export const BEACH_POSTS_BY_SLUG: Readonly<Record<string, readonly BeachPostOption[]>> = {
  leme: [makePost(1)],
  copacabana: [makePost(2), makePost(3), makePost(4), makePost(5), makePost(6)],
  arpoador: [makePost(7)],
  ipanema: [makePost(8), makePost(9), makePost(10)],
  leblon: [makePost(11), makePost(12)],
  'sao-conrado': [makePost(13)],
  'barra-da-tijuca': [
    makePost(1),
    makePost(2),
    makePost(3),
    makePost(4),
    makePost(5),
    makePost(6),
    makePost(7),
    makePost(8),
  ],
  recreio: [makePost(9), makePost(10), makePost(11), makePost(12)],
};

export interface ConditionOption<T extends string> {
  value: T;
  label: string;
  summaryLabel: string;
}

export const SKY_CONDITION_OPTIONS: ReadonlyArray<ConditionOption<ReportSkyCondition>> = [
  { value: 'clear', label: 'Limpo', summaryLabel: 'Céu limpo' },
  {
    value: 'partly_cloudy',
    label: 'Parcialmente nublado',
    summaryLabel: 'Céu parcialmente nublado',
  },
  { value: 'overcast', label: 'Encoberto', summaryLabel: 'Céu encoberto' },
];

export const SEA_CONDITION_OPTIONS: ReadonlyArray<ConditionOption<ReportSeaCondition>> = [
  { value: 'calm', label: 'Calmo', summaryLabel: 'Mar calmo' },
  { value: 'moderate', label: 'Moderado', summaryLabel: 'Mar moderado' },
  { value: 'rough', label: 'Agitado', summaryLabel: 'Mar agitado' },
];

export const CROWD_LEVEL_OPTIONS: ReadonlyArray<ConditionOption<ReportCrowdLevel>> = [
  { value: 'empty', label: 'Vazia', summaryLabel: 'Lotação vazia' },
  { value: 'moderate', label: 'Moderada', summaryLabel: 'Lotação moderada' },
  { value: 'crowded', label: 'Cheia', summaryLabel: 'Lotação cheia' },
];

const SKY_SUMMARY_MAP: Record<ReportSkyCondition, string> = {
  clear: 'Céu limpo',
  partly_cloudy: 'Céu parcialmente nublado',
  overcast: 'Céu encoberto',
};

const SEA_SUMMARY_MAP: Record<ReportSeaCondition, string> = {
  calm: 'Mar calmo',
  moderate: 'Mar moderado',
  rough: 'Mar agitado',
};

const CROWD_SUMMARY_MAP: Record<ReportCrowdLevel, string> = {
  empty: 'Lotação vazia',
  moderate: 'Lotação moderada',
  crowded: 'Lotação cheia',
};

const POST_CODE_REGEX = /^posto-([1-9][0-9]*)$/;

export function getDefaultPostsForBeachSlug(
  slug?: string | null
): BeachPostOption[] {
  const normalizedSlug = slug?.trim().toLowerCase() ?? '';
  const list = BEACH_POSTS_BY_SLUG[normalizedSlug];
  return list ? [...list] : [];
}

export function normalizePostCode(raw?: string | null): string | undefined {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return undefined;
  return POST_CODE_REGEX.test(trimmed) ? trimmed : undefined;
}

export function normalizeSkyCondition(
  raw?: string | null
): ReportSkyCondition | undefined {
  if (raw === 'clear' || raw === 'partly_cloudy' || raw === 'overcast') {
    return raw;
  }
  return undefined;
}

export function normalizeSeaCondition(
  raw?: string | null
): ReportSeaCondition | undefined {
  if (raw === 'calm' || raw === 'moderate' || raw === 'rough') {
    return raw;
  }
  return undefined;
}

export function normalizeCrowdLevel(
  raw?: string | null
): ReportCrowdLevel | undefined {
  if (raw === 'empty' || raw === 'moderate' || raw === 'crowded') {
    return raw;
  }
  return undefined;
}

export function isValidPostForBeachPosts(
  postCode: string | null | undefined,
  availablePosts: readonly BeachPostOption[]
): boolean {
  if (!postCode) return true;
  const normalized = normalizePostCode(postCode);
  if (!normalized) return false;
  return availablePosts.some((post) => post.code === normalized);
}

export function isValidPostForBeachSlug(
  beachSlug: string | null | undefined,
  postCode: string | null | undefined
): boolean {
  if (!postCode) return true;
  const posts = getDefaultPostsForBeachSlug(beachSlug);
  return isValidPostForBeachPosts(postCode, posts);
}

export function formatPostCodeLabel(postCode?: string | null): string | null {
  const normalized = normalizePostCode(postCode);
  if (!normalized) return null;
  const match = POST_CODE_REGEX.exec(normalized);
  if (!match) return null;
  return `Posto ${match[1]}`;
}

export interface ReportConditionsInput {
  postCode?: string | null;
  skyCondition?: ReportSkyCondition | null;
  seaCondition?: ReportSeaCondition | null;
  crowdLevel?: ReportCrowdLevel | null;
}

export function formatReportConditionsParts(
  input: ReportConditionsInput
): string[] {
  const parts: string[] = [];

  const postLabel = formatPostCodeLabel(input.postCode);
  if (postLabel) {
    parts.push(postLabel);
  }

  const sky = normalizeSkyCondition(input.skyCondition);
  if (sky) {
    parts.push(SKY_SUMMARY_MAP[sky]);
  }

  const sea = normalizeSeaCondition(input.seaCondition);
  if (sea) {
    parts.push(SEA_SUMMARY_MAP[sea]);
  }

  const crowd = normalizeCrowdLevel(input.crowdLevel);
  if (crowd) {
    parts.push(CROWD_SUMMARY_MAP[crowd]);
  }

  return parts;
}

export function formatReportConditionsSummary(
  input: ReportConditionsInput
): string | null {
  const parts = formatReportConditionsParts(input);
  return parts.length > 0 ? parts.join(' · ') : null;
}
