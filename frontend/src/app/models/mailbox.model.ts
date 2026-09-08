export interface ContactDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  address?: string;
  company?: string;
  position?: string;
  linkedinUrl?: string;
  source?: string;
  notes?: string;
  avatarBase64?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactDto {
  name: string;
  email: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  address?: string;
  company?: string;
  position?: string;
  linkedinUrl?: string;
  notes?: string;
  isFavorite?: boolean;
  avatarBase64?: string;
}

export interface UpdateContactDto {
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  address?: string;
  company?: string;
  position?: string;
  linkedinUrl?: string;
  notes?: string;
  isFavorite?: boolean;
  avatarBase64?: string;
}

export interface ContactExtractResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ImportCsvDto {
  csvContent: string;
}

export interface ContactListResponse {
  items: ContactDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmailAttachmentInfo {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface EmailMessageDto {
  id: string;
  userId: string;
  contactId?: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  status: string;
  provider: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
  attachments?: EmailAttachmentInfo[];
}

export interface EmailAttachmentPayload {
  fileName: string;
  contentType: string;
  contentBase64: string;
}

export interface SendEmailDto {
  recipientIds: string[];
  subject: string;
  body: string;
  attachments?: EmailAttachmentPayload[];
  /** When set, the backend logs a SENT attempt on this application after sending. */
  applicationId?: string;
}

export interface LoggedAttemptInfo {
  applicationId: string;
  attemptId?: string;
  companyName?: string;
  positionTitle?: string;
  error?: string;
}

export interface SendEmailResult {
  sent: number;
  failed: number;
  total: number;
  loggedAttempt?: LoggedAttemptInfo | null;
}

export interface EmailHistoryResponse {
  items: EmailMessageDto[];
  total: number;
  sentCount: number;
  failedCount: number;
  draftCount: number;
}

export interface ContactHistoryResponse {
  contact: ContactDto;
  emails: EmailMessageDto[];
  totalEmails: number;
}

export interface ScheduleAttachmentRef {
  fileName: string;
  contentType?: string;
  objectKey: string;
  sizeBytes: number;
}

export interface EmailScheduleDto {
  id: string;
  userId: string;
  name: string;
  cronExpression: string;
  subject: string;
  body: string;
  recipientIds: string[];
  isActive: boolean;
  nextRunAt?: string;
  lastRunAt?: string | null;
  upcomingRuns?: string[] | null;
  applicationId?: string | null;
  cvVersionId?: string | null;
  templateSourceId?: string | null;
  attachments: ScheduleAttachmentRef[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleHistoryItem {
  id: string;
  toName: string;
  toEmail: string;
  status: string;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export interface ScheduleHistoryResponse {
  items: ScheduleHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateScheduleDto {
  name: string;
  cronExpression: string;
  subject: string;
  body: string;
  recipientIds: string[];
  applicationId?: string;
  cvVersionId?: string;
  templateSourceId?: string;
  attachments?: ScheduleAttachmentRef[];
}

export interface UpdateScheduleDto {
  name?: string;
  cronExpression?: string;
  subject?: string;
  body?: string;
  recipientIds?: string[];
  applicationId?: string;
  cvVersionId?: string;
  templateSourceId?: string;
  attachments?: ScheduleAttachmentRef[];
}

export interface MailboxStatsDto {
  emailsSent: number;
  scheduledEmails: number;
  contacts: number;
  successRate: number;
}
