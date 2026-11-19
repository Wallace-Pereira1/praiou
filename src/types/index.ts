export type PraiouStatus = 'praiou' | 'talvez' | 'nao_praiou';

export type PraiouRegion = 'Zona Sul' | 'Zona Oeste';

export type SnapshotSourceStatus = 'ok' | 'partial' | 'stale';

export type WeatherConditionType = 'sun' | 'partly_cloudy' | 'cloudy' | 'rain';

export interface Beach {
  id: string;
  slug: string;
  name: string;
  region: PraiouRegion;
  neighborhoodNote: string;
  latitude: number;
  longitude: number;
  sortOrder: number;
}

export interface HourlyForecastPoint {
  timeLabel: string; // Ex.: "14:00"
  condition: WeatherConditionType;
  temperatureC: number | null;
  rainProb: number | null;
  waveHeightM: number | null;
}

export interface BeachSnapshot {
  id: string;
  beachId: string;
  status: PraiouStatus;
  score: number | null; // 0 a 100 (null quando ausente)
  summaryReason: string;
  reasons: string[]; // Até 3 motivos curtos
  condition: WeatherConditionType;
  temperatureC: number | null;
  rainProb: number | null;
  rainMm: number | null;
  windKmh: number | null;
  windDirDeg: number | null;
  cloudCover: number | null;
  uvIndex: number | null;
  waveHeightM: number | null;
  wavePeriodS: number | null;
  waveDirDeg: number | null;
  seaTempC: number | null;
  hourlyForecast: HourlyForecastPoint[];
  sourceStatus: SnapshotSourceStatus;
  updatedAtLabel: string; // Ex.: "13:45"
  fetchedAt?: string; // ISO timestamp da leitura para checagem de atualidade
}

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  externalAvatarUrl?: string;
  avatarPath?: string;
  bannerPath?: string;
  bannerUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BeachReport {
  id: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  photoPath?: string;
  photoUrl?: string;
  photoAlt?: string;
  createdAt: string;
  helpfulCount?: number | null;
  viewerHasReacted?: boolean;
  helpfulLoadError?: boolean;
  flagsCount?: number;
}

export interface CreateReportFallbackDisplay {
  beachSlug: string;
  beachName: string;
  userName: string;
  userAvatarUrl?: string;
}

export interface CreateReportPayload {
  beachId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  reportId?: string;
  photoBlob?: Blob | null;
  existingPhotoPath?: string | null;
  isRetryAfterAmbiguousError?: boolean;
  fallbackDisplay?: CreateReportFallbackDisplay;
}

export interface PaginatedReportsResult {
  items: BeachReport[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  provider: 'google' | 'email';
  avatarUrl?: string;
  hasCustomAvatar?: boolean;
  bannerUrl?: string;
  hasCustomBanner?: boolean;
}

export type User = AppUser;
