export type ApplicationStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'SCREENING'
  | 'ASSESSMENT'
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
  | 'OTHER'
  | 'LINKEDIN_APPLY';

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
  coverLetterVersionId?: string | null;
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
  linkedEmailMessageId?: string | null;
  history?: StatusHistoryDto[];
  attempts?: AttemptResponseDto[];
  contactId?: string;
  recipientName?: string;
  recipientContact?: string;
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
  contactId?: string;
  recipientName?: string;
  recipientContact?: string;
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
  cvVersionId?: string | null;
  contactId?: string | null;
  recipientName?: string;
  recipientContact?: string;
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
  assessment: number;
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
  assessment: number;
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
  assessment: number;
  interview: number;
  offer: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
}

export interface DailyTrendDto {
  date: string;
  saved: number;
  applied: number;
  screening: number;
  assessment: number;
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
  dailyTrends: DailyTrendDto[];
  priorityCounts: Record<string, number>;
  originCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  funnel: FunnelStageDto[];
  topCompanies: TopCompanyDto[];
  email: EmailStatsDto;
  cvPerformance?: CvPerformanceDto[];
  contactCoverage: ContactCoverageDto;
  companyDistribution: CompanyDistributionDto;
  careerInventory: CareerInventoryDto;
  toolingUsage: ToolingUsageDto;
  responseTimeHistogram: ResponseTimeBucketDto[];
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

export interface ContactCoverageDto {
  total: number;
  withEmail: number;
  withPhone: number;
  withLinkedin: number;
  withMobile: number;
  withFax: number;
  emailPct: number;
  phonePct: number;
  linkedinPct: number;
  mobilePct: number;
  faxPct: number;
}

export interface CompanyDistributionDto {
  total: number;
  withWebsite: number;
  withCountry: number;
  cityCounts: Record<string, number>;
  countryCounts: Record<string, number>;
  sectorCounts: Record<string, number>;
  locations: CountryLocationDto[];
}

export interface CountryLocationDto {
  country: string;
  count: number;
  cities: Record<string, number>;
  withoutCity: number;
}

export interface CareerInventoryDto {
  experiences: number;
  projects: number;
  skills: number;
  educations: number;
  certifications: number;
  hackathons: number;
  languages: number;
  interests: number;
  academicActivities: number;
  distinctTags: number;
}

export interface ToolingUsageDto {
  jobExtractions: number;
  templateRenders: number;
  cvGenerations: number;
  savedToolItems: number;
  cvs: number;
  cvVersions: number;
  cvTemplates: number;
  coverLetters: number;
  coverLetterVersions: number;
  userImages: number;
  schedulesActive: number;
  schedulesTotal: number;
}

export interface ResponseTimeBucketDto {
  bucket: string;
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
  'ASSESSMENT',
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
  ASSESSMENT: 'Assessment',
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
  ASSESSMENT: 'oklch(0.58 0.14 180)',
  INTERVIEW: 'oklch(0.55 0.16 160)',
  OFFER: 'oklch(0.55 0.13 130)',
  ACCEPTED: 'oklch(0.62 0.15 155)',
  REJECTED: 'oklch(0.62 0.18 25)',
  WITHDRAWN: 'oklch(0.55 0.02 60)',
};

/** Allowed forward transitions used by status pickers. */
export const NEXT_STATUSES: Record<ApplicationStatus, ApplicationStatus[]> = {
  SAVED: ['APPLIED', 'WITHDRAWN'],
  APPLIED: ['SCREENING', 'ASSESSMENT', 'INTERVIEW', 'REJECTED', 'SAVED', 'WITHDRAWN'],
  SCREENING: ['ASSESSMENT', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  ASSESSMENT: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
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

// ── Origin metadata ──────────────────────────────────────────────────────────

export const ORIGIN_ORDER: readonly ApplicationOrigin[] =
  ['MANUAL', 'FROM_JOB_OFFER', 'AI_AGENT_AUTO_APPLY', 'IMPORT'] as const;

export const ORIGIN_LABELS: Record<ApplicationOrigin, string> = {
  MANUAL: 'Manual',
  FROM_JOB_OFFER: 'From a job offer',
  AI_AGENT_AUTO_APPLY: 'AI auto-apply',
  IMPORT: 'Imported',
};

export const ORIGIN_COLORS: Record<ApplicationOrigin, string> = {
  MANUAL: 'oklch(0.6 0.1 250)',
  FROM_JOB_OFFER: 'oklch(0.62 0.15 200)',
  AI_AGENT_AUTO_APPLY: 'oklch(0.62 0.16 155)',
  IMPORT: 'oklch(0.6 0.1 80)',
};

// ── Channel metadata ────────────────────────────────────────────────────────

export const ATTEMPT_CHANNEL_LABELS: Record<AttemptChannel, string> = {
  EMAIL_GMAIL: 'Gmail',
  EMAIL_SMTP: 'Email (SMTP)',
  WHATSAPP: 'WhatsApp',
  LINKEDIN_MESSAGE: 'LinkedIn message',
  LINKEDIN_CONNECTION: 'LinkedIn connection',
  LINKEDIN_APPLY: 'LinkedIn apply',
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

export interface AttemptChannelFields {
  subject: boolean;
  message: boolean;
  messageLabel: string;
  messagePlaceholder: string;
  recipientName: boolean;
  recipientContact: boolean;
  recipientContactLabel: string;
  recipientContactPlaceholder: string;
}

/** Which attempt fields apply per channel (email gets subject, web form gets the URL, …).
 *  Shared by the create-application page and the detail-page log-attempt modal. */
export function attemptChannelFields(channel: AttemptChannel): AttemptChannelFields {
  switch (channel) {
    case 'EMAIL_GMAIL':
    case 'EMAIL_SMTP':
      return {
        subject: true, message: true, messageLabel: 'Message',
        messagePlaceholder: 'What did you send? Paste the message here…',
        recipientName: true, recipientContact: true,
        recipientContactLabel: 'Recipient email', recipientContactPlaceholder: 'name@email.com',
      };
    case 'WHATSAPP':
      return {
        subject: false, message: true, messageLabel: 'WhatsApp message',
        messagePlaceholder: 'Paste the text you sent…',
        recipientName: false, recipientContact: true,
        recipientContactLabel: 'Recipient phone', recipientContactPlaceholder: '+212 6 00 00 00 00',
      };
    case 'LINKEDIN_MESSAGE':
      return {
        subject: false, message: true, messageLabel: 'Message',
        messagePlaceholder: 'Paste the message you sent…',
        recipientName: false, recipientContact: true,
        recipientContactLabel: 'Recipient profile URL', recipientContactPlaceholder: 'linkedin.com/in/…',
      };
    case 'LINKEDIN_CONNECTION':
      return {
        subject: false, message: true, messageLabel: 'Connection note',
        messagePlaceholder: 'Short note accompanying the connection request…',
        recipientName: false, recipientContact: true,
        recipientContactLabel: 'Recipient profile URL', recipientContactPlaceholder: 'linkedin.com/in/…',
      };
    case 'LINKEDIN_APPLY':
      return {
        subject: false, message: false, messageLabel: '',
        messagePlaceholder: '',
        recipientName: false, recipientContact: true,
        recipientContactLabel: 'Job posting URL', recipientContactPlaceholder: 'https://www.linkedin.com/jobs/view/…',
      };
    case 'WEB_FORM':
      return {
        subject: false, message: false, messageLabel: '',
        messagePlaceholder: '',
        recipientName: false, recipientContact: true,
        recipientContactLabel: 'Form URL', recipientContactPlaceholder: 'https://jobs.company.com/apply…',
      };
    case 'IN_PERSON':
      return {
        subject: false, message: true, messageLabel: 'Notes',
        messagePlaceholder: 'Where and when did you apply? What was discussed?',
        recipientName: false, recipientContact: false,
        recipientContactLabel: '', recipientContactPlaceholder: '',
      };
    case 'OTHER':
    default:
      return {
        subject: false, message: true, messageLabel: 'Notes',
        messagePlaceholder: 'Anything worth remembering about this application…',
        recipientName: false, recipientContact: false,
        recipientContactLabel: '', recipientContactPlaceholder: '',
      };
  }
}
