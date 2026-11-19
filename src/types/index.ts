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
  username: string;
  avatarUrl?: string;
  externalAvatarUrl?: string;
  avatarPath?: string;
  bannerPath?: string;
  bannerUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

export interface PublicProfileStats {
  visibleReportsCount: number;
  evaluatedBeachesCount: number;
}

export type ReportModerationStatus = 'visible' | 'hidden';

export type ReportFlagReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate_media'
  | 'personal_data'
  | 'misleading_or_dangerous'
  | 'other';

export type ReportFlagStatus = 'pending' | 'resolved_kept' | 'resolved_hidden';

export type ModerationAction = 'keep_visible' | 'hide' | 'restore';

export type ModerationQueueFilter = 'pending' | 'resolved';

export interface BeachReport {
  id: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  userId: string;
  userName: string;
  userUsername?: string;
  userAvatarUrl?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  photoPath?: string;
  photoUrl?: string;
  photoAlt?: string;
  createdAt: string;
  moderationStatus?: ReportModerationStatus;
  moderatedAt?: string;
  helpfulCount?: number | null;
  viewerHasReacted?: boolean;
  helpfulLoadError?: boolean;
  replyCount?: number | null;
  replyLoadError?: boolean;
  viewerHasFlagged?: boolean;
  flagsCount?: number;
}

export interface BeachReportReply {
  id: string;
  reportId: string;
  userId: string;
  userName: string;
  userUsername?: string;
  userAvatarUrl?: string;
  body: string;
  moderationStatus: ReportModerationStatus;
  createdAt: string;
  viewerHasFlagged?: boolean;
  likeCount?: number | null;
  likedByMe?: boolean;
  likeLoadError?: boolean;
}

export interface ReplyLikeSummary {
  replyId: string;
  likeCount: number;
  likedByMe: boolean;
}

export interface PaginatedRepliesResult {
  items: BeachReportReply[];
  totalCount: number;
  visibleCount: number;
  hasMore: boolean;
  nextOffset: number;
}

export interface CreateReplyFallbackAuthor {
  userName: string;
  userUsername?: string;
  userAvatarUrl?: string;
}

export interface CreateReplyPayload {
  reportId: string;
  body: string;
  replyId?: string;
  fallbackAuthor?: CreateReplyFallbackAuthor;
}

export type ModerationTargetKind = 'report' | 'reply';

export interface ModerationReasonCount {
  reason: ReportFlagReason;
  count: number;
}

export interface ModerationFlagItem {
  id: string;
  reason: ReportFlagReason;
  details?: string;
  status: ReportFlagStatus;
  createdAt: string;
  reporterName: string;
}

export interface ModerationLogItem {
  id: string;
  action: ModerationAction;
  reason?: string;
  flagsResolvedCount: number;
  createdAt: string;
  moderatorName: string;
}

export interface ModerationReportItem {
  reportId: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  photoPath?: string;
  photoUrl?: string;
  reportCreatedAt: string;
  moderationStatus: ReportModerationStatus;
  moderatedAt?: string;
  pendingFlagsCount: number;
  totalFlagsCount: number;
  latestFlagAt?: string;
  helpfulCount: number;
  reasonSummary: ModerationReasonCount[];
  flags: ModerationFlagItem[];
  logs: ModerationLogItem[];
}

export interface ModerationQueueResult {
  filter: ModerationQueueFilter;
  page: number;
  pageSize: number;
  totalCount: number;
  pendingReportsCount: number;
  resolvedReportsCount: number;
  hasMore: boolean;
  items: ModerationReportItem[];
}

export interface ModerationReplyItem {
  replyId: string;
  reportId: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  reportModerationStatus: ReportModerationStatus;
  reportComment: string;
  reportAuthorName: string;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  body: string;
  replyCreatedAt: string;
  moderationStatus: ReportModerationStatus;
  moderatedAt?: string;
  pendingFlagsCount: number;
  totalFlagsCount: number;
  latestFlagAt?: string;
  reasonSummary: ModerationReasonCount[];
  flags: ModerationFlagItem[];
  logs: ModerationLogItem[];
}

export interface ModerationRepliesQueueResult {
  filter: ModerationQueueFilter;
  page: number;
  pageSize: number;
  totalCount: number;
  pendingRepliesCount: number;
  resolvedRepliesCount: number;
  hasMore: boolean;
  items: ModerationReplyItem[];
}

export interface CreateReportFallbackDisplay {
  beachSlug: string;
  beachName: string;
  userName: string;
  userUsername?: string;
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
  username?: string;
  provider: 'google';
  avatarUrl?: string;
  hasCustomAvatar?: boolean;
  bannerUrl?: string;
  hasCustomBanner?: boolean;
}

export type User = AppUser;
