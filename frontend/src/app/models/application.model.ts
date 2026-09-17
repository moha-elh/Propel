export type ApplicationStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'OFFER'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type ApplicationOrigin = 'MANUAL' | 'FROM_JOB_OFFER' | 'AI_AGENT_AUTO_APPLY' | 'IMPORT';

export type ApplicationPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type AttemptChannel =
  | 'EMAIL_GMAIL'
  | 'EMAIL_SMTP'
  | 'WHATSAPP'
  | 'LINKEDIN_MESSAGE'
  | 'LINKEDIN_CONNECTION'
  | 'WEB_FORM'
  | 'IN_PERSON'
  | 'OTHER';

export type AttemptInitiatedBy = 'USER' | 'AI_AGENT' | 'SCHEDULE';

export type AttemptStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'FAILED';

export interface StatusHistoryDto {
  id: string;
  oldStatus?: string;
  newStatus: string;
  changedAt: string;
  changedBy?: string;
  comment?: string;
}

export interface AttemptResponseDto {
  id: string;
  applicationId: string;
  attemptNumber: number;
  channel: AttemptChannel;
  initiatedBy: AttemptInitiatedBy;
  status: AttemptStatus;
  subject?: string;
  body?: string;
  recipientName?: string;
  recipientContact?: string;
  contactId?: string;
  contact?: ContactSummaryDto;
  channelMetadataJson?: string;
  cvVersionId?: string;
  sentAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight contact projection attached to attempts / used in pickers. */
export interface ContactSummaryDto {
  id: string;
  name: string;
  email: string;
  company?: string;
  position?: string;
  isFavorite: boolean;
}

export interface CreateAttemptDto {
  channel: AttemptChannel;
  initiatedBy?: AttemptInitiatedBy;
  status?: AttemptStatus;
  subject?: string;
  body?: string;
  recipientName?: string;
  recipientContact?: string;
  contactId?: string;
  channelMetadataJson?: string;
  cvVersionId?: string;
  sentAt?: string;
  failureReason?: string;
}

export interface UpdateAttemptDto {
  status?: AttemptStatus;
  subject?: string;
  body?: string;
  recipientName?: string;
  recipientContact?: string;
  contactId?: string;
  channelMetadataJson?: string;
  cvVersionId?: string;
  sentAt?: string;
  failureReason?: string;
}

export interface ApplicationResponseDto {
  id: string;
  candidateId: string;
  cvVersionId?: string;
  jobOfferId?: string;
  companyName: string;
  positionTitle: string;
  offerSource?: string;
  origin: ApplicationOrigin;
  status: ApplicationStatus;
  appliedAt?: string;
  updatedAt: string;
  notes?: string;
  internshipType?: string;
  priority: ApplicationPriority;
  history?: StatusHistoryDto[];
  attempts?: AttemptResponseDto[];
}

export interface CreateApplicationDto {
  candidateId: string;
  cvVersionId?: string;
  jobOfferId?: string;
  companyName: string;
  positionTitle: string;
  offerSource?: string;
  notes?: string;
  origin?: ApplicationOrigin;
  status?: ApplicationStatus;
  allowDuplicate?: boolean;
  internshipType?: string;
  priority?: ApplicationPriority;
  appliedAt?: string;
}

export interface UpdateStatusDto {
  status: ApplicationStatus;
  comment?: string;
}

export interface UpdateApplicationDto {
  companyName?: string;
  positionTitle?: string;
  offerSource?: string;
  notes?: string;
  internshipType?: string;
  priority?: ApplicationPriority;
}

export interface DuplicateCheckRequestDto {
  companyName: string;
  positionTitle: string;
  jobOfferId?: string;
  excludeApplicationId?: string;
}

export interface DuplicateMatchDto {
  id: string;
  companyName: string;
  positionTitle: string;
  status: ApplicationStatus;
  appliedAt?: string;
  updatedAt: string;
  sameJobOffer: boolean;
}

export interface DuplicateCheckResponseDto {
  hasDuplicates: boolean;
  matches: DuplicateMatchDto[];
}

export interface ApplicationStatisticsDto {
  total: number;
  saved: number;
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
}

export interface MonthlyTrendDto {
  year: number;
  month: number;
  saved: number;
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
}

export interface WeeklyTrendDto {
  year: number;
  week: number;
  saved: number;
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
}

export interface StatisticsTrendsDto {
  current: ApplicationStatisticsDto;
  monthlyTrends: MonthlyTrendDto[];
  averageResponseTimeDays: number | null;
}

export interface AnalyticsSummaryDto {
  statistics: ApplicationStatisticsDto;
  averageResponseTimeDays: number | null;
  distinctCompanies: number;
  monthlyTrends: MonthlyTrendDto[];
  weeklyTrends?: WeeklyTrendDto[];
  priorityCounts: Record<string, number>;
  originCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  funnel: FunnelStageDto[];
  topCompanies: TopCompanyDto[];
  email: EmailStatsDto;
  cvPerformance?: CvPerformanceDto[];
}

export interface CvPerformanceDto {
  cvTitle: string;
  versionNumber: number;
  versionLabel?: string;
  versionId: string;
  tags: string[];
  sentCount: number;
  linkedApplications: number;
  interviewCount: number;
  offerCount: number;
}

export interface FunnelStageDto {
  stage: string;
  count: number;
}

export interface TopCompanyDto {
  name: string;
  count: number;
  lastAppliedAt: string | null;
}

export interface EmailStatsDto {
  emailsSent: number;
  emailsFailed: number;
  successRate: number;
  activeSchedules: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

export interface ActivityItemDto {
  applicationId: string;
  companyName: string;
  positionTitle: string;
  oldStatus?: string;
  newStatus: string;
  changedAt: string;
  comment?: string;
  isDeleted?: boolean;
}

export interface ActivityFeedDto {
  items: ActivityItemDto[];
  total: number;
}

export interface ApplicationListDto {
  items: ApplicationResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Centralized status metadata — import from here, never hardcode ──────────

export const STATUS_ORDER: readonly ApplicationStatus[] = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  SCREENING: 'Seen',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

/** CSS color values for status dots/badges (oklch). */
export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  SAVED: 'oklch(0.65 0.01 80)',
  APPLIED: 'oklch(0.6 0.16 250)',
  SCREENING: 'oklch(0.6 0.13 200)',
  INTERVIEW: 'oklch(0.55 0.16 160)',
  OFFER: 'oklch(0.55 0.13 130)',
  ACCEPTED: 'oklch(0.62 0.15 155)',
  REJECTED: 'oklch(0.62 0.18 25)',
  WITHDRAWN: 'oklch(0.55 0.02 60)',
};

/** Allowed forward transitions used by status pickers. */
export const NEXT_STATUSES: Record<ApplicationStatus, ApplicationStatus[]> = {
  SAVED: ['APPLIED', 'WITHDRAWN'],
  APPLIED: ['SCREENING', 'INTERVIEW', 'REJECTED', 'SAVED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: ['APPLIED'],
  WITHDRAWN: ['SAVED', 'APPLIED'],
};

// ── Priority metadata ───────────────────────────────────────────────────────

export const PRIORITY_ORDER: readonly ApplicationPriority[] = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const PRIORITY_LABELS: Record<ApplicationPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const PRIORITY_COLORS: Record<ApplicationPriority, string> = {
  LOW: 'oklch(0.6 0.1 250)',
  MEDIUM: 'oklch(0.72 0.14 80)',
  HIGH: 'oklch(0.62 0.19 25)',
};

// ── Channel metadata ────────────────────────────────────────────────────────

export const ATTEMPT_CHANNEL_LABELS: Record<AttemptChannel, string> = {
  EMAIL_GMAIL: 'Gmail',
  EMAIL_SMTP: 'Email (SMTP)',
  WHATSAPP: 'WhatsApp',
  LINKEDIN_MESSAGE: 'LinkedIn message',
  LINKEDIN_CONNECTION: 'LinkedIn connection',
  WEB_FORM: 'Web form',
  IN_PERSON: 'In person',
  OTHER: 'Other',
};

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  SENT: 'Sent',
  FAILED: 'Failed',
};
