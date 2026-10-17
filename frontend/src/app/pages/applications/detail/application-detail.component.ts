import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { ContactService } from '@app/services/contact.service';
import { ToastService } from '@app/services/toast.service';
import {
  ApplicationResponseDto,
  ApplicationStatus,
  ApplicationPriority,
  AttemptResponseDto,
  AttemptChannel,
  AttemptInitiatedBy,
  AttemptStatus,
  ContactSummaryDto,
  STATUS_LABELS,
  STATUS_COLORS,
  NEXT_STATUSES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  priorityColor,
  attemptChannelFields,
  ATTEMPT_CHANNEL_LABELS,
  ATTEMPT_STATUS_LABELS,
  daysQuiet,
} from '@app/models/application.model';
import { ContactDto, EmailMessageDto, ScheduleAttachmentRef } from '@app/models/mailbox.model';
import { MailboxService } from '@app/services/mailbox.service';
import { CoverLetterDto, CoverLetterVersionDto, CvDocumentDto, CvVersionDto } from '@app/models/document.model';
import { DocumentsService } from '@app/services/documents.service';
import { CompanyService, CompanyDto } from '@app/services/company.service';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';
import { COUNTRIES } from '@app/shared/data/geo-data';
import { flagUrl } from '@app/shared/data/flags';

/** Default login used to sign into an external web application portal. */
const DEFAULT_LOGIN_EMAIL = 'mouhssineelhaouary@gmail.com';
const DEFAULT_LOGIN_PASSWORD = 'Stage2027';

/** Channel-specific metadata persisted on an attempt (form URL + account used). */
export interface AttemptMetadata {
  formUrl?: string;
  accountEmail?: string;
  accountPassword?: string;
}

type AttemptForm = {
  channel: AttemptChannel;
  initiatedBy: AttemptInitiatedBy;
  subject: string;
  body: string;
  recipientName: string;
  recipientContact: string;
  coverLetterVersionId: string | null;
};

@Component({
  selector: 'app-application-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink, CompanyLogoComponent],
  templateUrl: './application-detail.component.html',
  styleUrl: './application-detail.component.scss',
})
export class ApplicationDetailComponent implements OnInit {
  private appService = inject(ApplicationService);
  private contactApi = inject(ContactService);
  private docsApi = inject(DocumentsService);
  private companyApi = inject(CompanyService);
  private toast = inject(ToastService);
  private documents = inject(DocumentsService);
  private mailbox = inject(MailboxService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  application = signal<ApplicationResponseDto | null>(null);
  attempts = signal<AttemptResponseDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  showEditModal = signal(false);
  showAttemptModal = signal(false);

  editCompanyName = signal('');
  editPositionTitle = signal('');
  editOfferSource = signal('');
  editNotes = signal('');
  editInternshipType = signal('');
  editPriority = signal<ApplicationPriority>('MEDIUM');
  editCountry = signal('');
  editCity = signal('');

  attemptForm = signal<AttemptForm>({
    channel: 'EMAIL_GMAIL',
    initiatedBy: 'USER',
    subject: '',
    body: '',
    recipientName: '',
    recipientContact: '',
    coverLetterVersionId: null,
  });
  attemptError = signal<string | null>(null);

  // Account used when logging an apply attempt (any channel, toggleable).
  attemptAccountEnabled = signal(false);
  attemptAccountEmail = signal(DEFAULT_LOGIN_EMAIL);
  attemptAccountPassword = signal(DEFAULT_LOGIN_PASSWORD);
  showAttemptAccountPassword = signal(false);
  /** Reveal state for saved passwords, keyed by attempt id. */
  revealedPass = signal<Record<string, boolean>>({});
  // Cover letter picker (attempt modal)
  coverLetters = signal<CoverLetterDto[]>([]);
  coverLetterOptions = computed(() =>
    this.coverLetters().flatMap(l =>
      l.versions.map(v => ({
        versionId: v.id,
        label: `${l.title} — v${v.versionNumber}`,
        company: l.companyName || 'General',
      })),
    ),
  );

  // Contact picker (attempt modal)
  suggestedContacts = signal<ContactSummaryDto[]>([]);
  selectedContactId = signal<string | null>(null);
  contactSearch = signal('');
  searchResults = signal<ContactSummaryDto[]>([]);
  searching = signal(false);
  showInlineCreate = signal(false);
  inlineName = signal('');
  inlineEmail = signal('');
  inlineCompany = signal('');
  inlineError = signal<string | null>(null);

  // Contact side panel
  panelOpen = signal(false);
  panelLoading = signal(false);
  panelContact = signal<ContactDto | null>(null);
  panelEmails = signal<EmailMessageDto[]>([]);
  panelApplications = signal<ApplicationResponseDto[]>([]);

  // "Reach out" card — company contact + quick links to get in touch (any status).
  reachLoading = signal(false);
  reachContact = signal<ContactSummaryDto | null>(null);
  reachCompany = signal<CompanyDto | null>(null);

  // Linked-CV support (which CV version was used in the attachments)
  cvDocs = signal<CvDocumentDto[]>([]);
  cvLoading = signal(false);
  editCvVersionId = signal<string>('');

  cvOptions = computed(() => {
    const opts: { id: string; label: string }[] = [];
    for (const cv of this.cvDocs()) {
      for (const v of cv.versions) {
        if (!v.pdfUrl && !v.fileUrl) continue;
        const tags = cv.tags?.length ? ` — ${cv.tags.join(', ')}` : '';
        opts.push({ id: v.id, label: `${cv.title} — ${this.cvVersionLabel(v)}${tags}` });
      }
    }
    return opts;
  });

  availableStatuses = computed(() => NEXT_STATUSES[this.application()?.status || 'SAVED'] || []);

  // Application attachments (right-column card)
  appAttachments = computed<ScheduleAttachmentRef[]>(() => this.application()?.attachments ?? []);
  attachmentsUploading = signal(false);
  attachmentError = signal<string | null>(null);

  // CV sent with this apply (optional, from the user's Documents CVs)
  cvDocuments = signal<CvDocumentDto[]>([]);
  docLoading = signal(false);
  private docLoaded = false;
  selectedCvValue = computed(() => this.application()?.cvVersionId ?? '');

  // From-Documents picker modal
  docsOpen = signal(false);
  docLetters = signal<CoverLetterDto[]>([]);

  // Follow-up reminder (right-column card): presets relative to the applied date,
  // custom date, or cleared. A set deadline becomes a PENDING reminder on the Calendar.
  followUpPresets = [
    { label: '3 days', short: '+3d', days: 3 },
    { label: '1 week', short: '+1w', days: 7 },
    { label: '2 weeks', short: '+2w', days: 14 },
    { label: '1 month', short: '+1m', days: 30 },
  ];
  followUpSaving = signal(false);
  followUpError = signal<string | null>(null);

  followUpDeadline = computed(() => this.application()?.followUpDate ?? null);
  followUpOverdue = computed(() => {
    const d = this.followUpDeadline();
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(d) < today;
  });

  /** Target date-input value for a preset: applied date + offset days (falls back to today). */
  presetTarget(days: number): string {
    const base = this.application()?.appliedAt ? new Date(this.application()!.appliedAt!) : new Date();
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async setFollowUp(dateInput: string) {
    const app = this.application();
    if (!app || this.followUpSaving()) return;
    this.followUpSaving.set(true);
    this.followUpError.set(null);
    try {
      const res = await this.appService.update(app.id, {
        followUpDate: dateInput ? new Date(dateInput + 'T12:00:00').toISOString() : undefined,
        clearFollowUp: !dateInput,
      });
      if (res.success && res.data) this.application.set(res.data);
      else this.followUpError.set(res.message || 'Failed to save follow-up');
    } catch {
      this.followUpError.set('Failed to save follow-up');
    } finally {
      this.followUpSaving.set(false);
    }
  }

  // Happy-path pipeline for the status stepper; REJECTED / WITHDRAWN are off-track.
  protected readonly PIPELINE: ApplicationStatus[] =
    ['SAVED', 'APPLIED', 'SCREENING', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'ACCEPTED'];
  currentStepIndex = computed(() =>
    this.PIPELINE.indexOf((this.application()?.status as ApplicationStatus) ?? 'SAVED'));
  isOffTrack = computed(() => {
    const s = this.application()?.status;
    return s === 'REJECTED' || s === 'WITHDRAWN';
  });
  /** How the user applied: channel of the earliest sent attempt. */
  firstSentChannel = computed(() =>
    this.attempts().filter(a => a.status === 'SENT').sort((a, b) => a.attemptNumber - b.attemptNumber)[0]?.channel ?? null);
  notesDirty = computed(() => this.editNotes() !== (this.application()?.notes || ''));
  notesState = signal<'idle' | 'saving' | 'saved'>('idle');

  /** Attempts and status changes in one feed, newest first. Status rows that only echo an
   *  attempt ("Attempt #1 sent via …" with no status change) are dropped as duplicates. */
  timeline = computed(() => {
    const app = this.application();
    type Row = { at: string; att?: AttemptResponseDto; entry?: NonNullable<ApplicationResponseDto['history']>[number] };
    const rows: Row[] = this.attempts().map(att => ({ at: att.sentAt || att.createdAt, att }));
    for (const entry of app?.history ?? []) {
      if (entry.oldStatus === entry.newStatus && /^Attempt #\d+/.test(entry.comment ?? '')) continue;
      rows.push({ at: entry.changedAt, entry });
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  });

  /** What to do next, from status + how long it has been quiet. */
  nextStep = computed(() => {
    const app = this.application();
    if (!app) return null;
    const quiet = daysQuiet(app);
    const nudgeOn = new Date(new Date(app.updatedAt).getTime() + 7 * 86400000);
    switch (app.status) {
      case 'SAVED':
        return { tone: 'neutral', title: "You haven't applied yet", text: 'Apply, then log how you did it so follow-ups work.', kind: 'apply' as const };
      case 'APPLIED': case 'SCREENING': case 'ASSESSMENT':
        if (app.followUpDate && app.followUpStatus === 'PENDING')
          return { tone: this.followUpOverdue() ? 'warn' : 'neutral', title: this.followUpOverdue() ? 'Your follow-up date has passed' : `Follow up on ${this.formatDate(app.followUpDate)}`,
            text: this.followUpOverdue() ? 'Send a short nudge, or close it out if they went silent.' : 'Nothing to do until then.', kind: 'followup' as const };
        return quiet >= 7
          ? { tone: 'warn', title: `Quiet for ${quiet} days`, text: 'A short, polite follow-up often gets a reply.', kind: 'followup' as const }
          : { tone: 'neutral', title: 'Waiting on a reply', text: `No news for ${quiet} day${quiet === 1 ? '' : 's'}. Follow up around ${this.formatDate(nudgeOn.toISOString())} if it stays quiet.`, kind: 'wait' as const };
      case 'INTERVIEW':
        return { tone: 'good', title: 'Interview stage', text: 'Prepare with your notes and company research, then send a thank-you within a day.', kind: 'interview' as const };
      case 'OFFER':
        return { tone: 'good', title: 'You have an offer', text: 'Record your decision once you make it.', kind: 'offer' as const };
      default:
        return null;
    }
  });

  /** Statuses offered in the inline status menu: the current one plus legal next steps. */
  statusChoices = computed(() => {
    const app = this.application();
    return app ? [app.status as ApplicationStatus, ...this.availableStatuses()] : [];
  });

  async quickStatus(status: string, comment?: string) {
    const app = this.application();
    if (!app || (status === app.status && !comment)) return;
    try {
      const res = await this.appService.updateStatus(app.id, { status: status as ApplicationStatus, comment });
      if (res.success && res.data) { this.application.set(res.data); this.toast.success(comment ?? `Moved to ${this.getStatusLabel(status)}`); }
    } catch { this.toast.error('Could not update status'); }
  }

  /** Notes save themselves on blur; only the notes field is sent. */
  async saveNotes() {
    const app = this.application();
    if (!app || !this.notesDirty()) return;
    this.notesState.set('saving');
    try {
      const res = await this.appService.update(app.id, { notes: this.editNotes() });
      if (res.success && res.data) this.application.set(res.data);
      this.notesState.set('saved');
    } catch {
      this.notesState.set('idle');
      this.toast.error('Could not save notes');
    }
  }

  writeFollowUp() {
    const app = this.application();
    if (app) this.router.navigate(['/mailbox'], { queryParams: { followUp: app.id } });
  }
  daysInPipeline = computed(() => {
    const start = this.application()?.appliedAt;
    if (!start) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 86400000));
  });

  protected readonly STATUS_LABELS = STATUS_LABELS;
  protected readonly PRIORITY_LABELS = PRIORITY_LABELS;
  protected readonly PRIORITY_ORDER = PRIORITY_ORDER;
  protected readonly CHANNEL_LABELS = ATTEMPT_CHANNEL_LABELS;
  protected readonly ATTEMPT_STATUS_LABELS = ATTEMPT_STATUS_LABELS;
  protected readonly ALL_CHANNELS: AttemptChannel[] =
    Object.keys(ATTEMPT_CHANNEL_LABELS) as AttemptChannel[];
  protected readonly INITIATORS: AttemptInitiatedBy[] = ['USER', 'AI_AGENT', 'SCHEDULE'];
  protected readonly channelFields = computed(() => attemptChannelFields(this.attemptForm().channel));

  // ── Company fields, editable from the application ─────────────────────────
  readonly COUNTRIES = COUNTRIES;
  readonly flagUrl = flagUrl;
  companySaving = signal(false);

  /** Saves one company field; creates the company (named like the application) if it doesn't exist yet. */
  async saveCompanyField(field: 'country' | 'location' | 'websiteUrl' | 'linkedinUrl' | 'sector', raw: string) {
    const app = this.application();
    if (!app) return;
    const value = raw.trim();
    const co = this.reachCompany();
    if ((co?.[field] ?? '') === value) return;
    this.companySaving.set(true);
    try {
      const res = co
        ? await this.companyApi.updateCompany(co.id, { [field]: value })
        : await this.companyApi.createCompany({ name: app.companyName, [field]: value });
      if (res.success && res.data) {
        this.reachCompany.set(res.data);
        this.toast.success(co ? 'Company updated' : `${app.companyName} added to Companies`);
      } else {
        this.toast.error(res.message || 'Could not save company');
      }
    } catch {
      this.toast.error('Could not save company');
    } finally {
      this.companySaving.set(false);
    }
  }

  /** Furthest pipeline stage reached; for a closed application, the last one before it closed. */
  reachedIndex = computed(() => {
    if (!this.isOffTrack()) return this.currentStepIndex();
    const d = this.stageDates();
    return this.PIPELINE.reduce((r, st, i) => (d[st] ? i : r), -1);
  });
  tab = signal<'overview' | 'notes' | 'timeline' | 'files'>('overview');
  /** Reminder chip: a preset number of days after applying, or "clear". */
  pickReminder(v: string) { this.setFollowUp(v === 'clear' ? '' : this.presetTarget(Number(v))); }
  coEdit = signal(false);
  missingCompanyFields = computed(() => {
    const co = this.reachCompany();
    return ([['location', 'city'], ['sector', 'sector'], ['websiteUrl', 'website'], ['linkedinUrl', 'LinkedIn']] as const)
      .filter(([k]) => !co?.[k]).map(([, label]) => label);
  });
  /** First day the application reached each status, for the stage tracker. */
  stageDates = computed(() => {
    const app = this.application(), out: Record<string, string> = {};
    for (const h of [...(app?.history ?? [])].sort((x, y) => x.changedAt.localeCompare(y.changedAt)))
      out[h.newStatus] ??= h.changedAt;
    if (app?.appliedAt) out['APPLIED'] = app.appliedAt;
    return out;
  });
  readonly PRIORITIES = Object.keys(PRIORITY_LABELS) as ApplicationPriority[];
  /** Saves application fields edited inline on the page. */
  async saveAppField(patch: { priority?: ApplicationPriority; positionTitle?: string; offerSource?: string }) {
    const app = this.application();
    if (!app || Object.entries(patch).every(([k, v]) => (app as any)[k] === v || (!v && !(app as any)[k]))) return;
    try {
      const res = await this.appService.update(app.id, patch);
      if (res.success && res.data) { this.application.set(res.data); this.toast.success('Saved'); }
    } catch { this.toast.error('Could not save'); }
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadApplication(id);
    this.loadCvDocs();
    void this.ensureDocumentsLoaded();
  }

  /** Loads the user's CV versions so the edit modal can link which CV was used. */
  async loadCvDocs() {
    this.cvLoading.set(true);
    try {
      this.cvDocs.set(await this.docsApi.listUsableCvVersions().catch(() => []));
    } catch {
      this.cvDocs.set([]);
    } finally {
      this.cvLoading.set(false);
    }
  }

  cvVersionLabel(v: CvVersionDto): string {
    const base = `v${v.versionNumber}`;
    return v.label ? `${base} · ${v.label}` : base;
  }

  /** Fills the "Reach out" card: matching company contact + directory links. */
  private async loadReachOut(app: ApplicationResponseDto) {
    this.reachLoading.set(true);
    try {
      const [contactsRes, coRes] = await Promise.all([
        this.appService.getSuggestedContacts(app.id).catch(() => null),
        this.companyApi.getCompanies({ search: app.companyName, pageSize: 5 }).catch(() => null),
      ]);
      this.reachContact.set(contactsRes?.success && contactsRes.data?.length ? contactsRes.data[0] : null);
      const items = coRes?.success ? coRes.data?.items ?? [] : [];
      const exact = items.find(c => c.name.toLowerCase() === app.companyName.trim().toLowerCase());
      this.reachCompany.set(items.length ? (exact ?? items[0]) : null);
    } catch {
      this.reachContact.set(null);
      this.reachCompany.set(null);
    } finally {
      this.reachLoading.set(false);
    }
  }

  async loadApplication(id: string) {
    this.loading.set(true);
    try {
      const res = await this.appService.getById(id);
      if (res.success && res.data) {
        this.application.set(res.data);
        this.resetEditForm(res.data);
        void this.loadReachOut(res.data);
      } else {
        this.error.set(res.message || 'Failed to load');
      }
      const attRes = await this.appService.getAttempts(id);
      if (attRes.success && attRes.data) this.attempts.set(attRes.data);
    } catch { this.error.set('Failed to load'); }
    finally { this.loading.set(false); }
  }

  resetEditForm(app: ApplicationResponseDto) {
    this.editCountry.set(this.reachCompany()?.country || '');
    this.editCity.set(this.reachCompany()?.location || '');
    this.editCompanyName.set(app.companyName);
    this.editPositionTitle.set(app.positionTitle);
    this.editOfferSource.set(app.offerSource || '');
    this.editNotes.set(app.notes || '');
    this.editInternshipType.set(app.internshipType || '');
    this.editPriority.set(app.priority || 'MEDIUM');
    this.editCvVersionId.set(app.cvVersionId ?? '');
  }

  openEditModal() { const app = this.application(); if (app) this.resetEditForm(app); this.showEditModal.set(true); }
  closeEditModal() { this.showEditModal.set(false); }

  openAttemptModal() {
    const app = this.application();
    this.attemptForm.set({
      channel: 'EMAIL_GMAIL',
      initiatedBy: 'USER',
      subject: app ? `Application – ${app.positionTitle}` : '',
      body: '',
      recipientName: '',
      recipientContact: '',
      coverLetterVersionId: null,
    });
    this.attemptError.set(null);
    this.attemptAccountEnabled.set(false);
    this.attemptAccountEmail.set(DEFAULT_LOGIN_EMAIL);
    this.attemptAccountPassword.set(DEFAULT_LOGIN_PASSWORD);
    this.showAttemptModal.set(true);
    // Load company-matching suggestions for quick recipient selection.
    if (app) {
      this.appService.getSuggestedContacts(app.id)
        .then(res => { if (res.success && res.data) this.suggestedContacts.set(res.data); })
        .catch(() => { });
    }
    this.loadCoverLetters();
  }
  closeAttemptModal() {
    this.showAttemptModal.set(false);
    this.resetPicker();
  }

  async loadCoverLetters(): Promise<void> {
    try {
      const res = await this.documents.listCoverLetters();
      this.coverLetters.set(res.data ?? []);
    } catch {
      this.coverLetters.set([]);
    }
  }

  private resetPicker() {
    this.selectedContactId.set(null);
    this.contactSearch.set('');
    this.searchResults.set([]);
    this.showInlineCreate.set(false);
    this.inlineName.set('');
    this.inlineEmail.set('');
    this.inlineCompany.set('');
    this.inlineError.set(null);
  }

  setAttemptChannel(c: AttemptChannel) {
    this.attemptForm.update(f => ({ ...f, channel: c }));
  }

  /** Parsed channel metadata (form URL + account used) for an attempt. */
  attemptMetadata(att: AttemptResponseDto): AttemptMetadata {
    if (!att.channelMetadataJson) return {};
    try { return JSON.parse(att.channelMetadataJson) as AttemptMetadata; } catch { return {}; }
  }

  private toUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed || /[\s@]/.test(trimmed)) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/[\w\-._~:/?#[\]@!$&'()*+,;=%]*)?$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return null;
  }

  /** Clickable link for an attempt (form URL from metadata, or a URL-ish recipient contact). */
  attemptLink(att: AttemptResponseDto): string | null {
    const meta = this.attemptMetadata(att);
    const raw = (meta['formUrl'] && meta['formUrl'].trim())
      ? meta['formUrl']
      : (att.recipientContact ?? '');
    return this.toUrl(raw);
  }

  hostOf(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }

  toggleReveal(id: string) {
    this.revealedPass.update(map => ({ ...map, [id]: !map[id] }));
  }

  private buildAttemptMetadata(): string | undefined {
    const f = this.attemptForm();
    const meta: Record<string, string> = {};
    if (f.channel === 'WEB_FORM' || f.channel === 'LINKEDIN_APPLY') {
      const url = f.recipientContact.trim();
      if (url) meta['formUrl'] = url;
    }
    if (this.attemptAccountEnabled() && this.attemptAccountEmail().trim()) {
      meta['accountEmail'] = this.attemptAccountEmail().trim();
      if (this.attemptAccountPassword()) meta['accountPassword'] = this.attemptAccountPassword();
    }
    return Object.keys(meta).length ? JSON.stringify(meta) : undefined;
  }

  pickContact(c: ContactSummaryDto) {
    this.selectedContactId.set(c.id);
    const cfg = this.channelFields();
    const ch = this.attemptForm().channel;
    this.attemptForm.update(f => ({
      ...f,
      recipientName: cfg.recipientName ? (f.recipientName.trim() || c.name) : f.recipientName,
      recipientContact: (cfg.recipientContact && (ch === 'EMAIL_GMAIL' || ch === 'EMAIL_SMTP'))
        ? c.email : f.recipientContact,
    }));
    this.contactSearch.set('');
    this.searchResults.set([]);
    this.showInlineCreate.set(false);
  }

  clearContact() {
    this.selectedContactId.set(null);
  }

  async searchAllContacts() {
    const term = this.contactSearch().trim();
    if (term.length < 2) { this.searchResults.set([]); return; }
    this.searching.set(true);
    try {
      const res = await this.contactApi.getContacts({ search: term, pageSize: 8 });
      if (res.success && res.data) {
        this.searchResults.set(res.data.items.map(c => ({
          id: c.id, name: c.name, email: c.email,
          company: c.company, position: c.position, isFavorite: c.isFavorite,
        })));
      }
    } catch { }
    finally { this.searching.set(false); }
  }

  toggleInlineCreate() {
    this.showInlineCreate.update(v => !v);
    this.inlineError.set(null);
  }

  async createInlineContact() {
    const name = this.inlineName().trim();
    const email = this.inlineEmail().trim();
    this.inlineError.set(null);
    if (!name || !email) { this.inlineError.set('Name and email are required'); return; }
    try {
      const res = await this.contactApi.createContact({
        name, email,
        company: this.inlineCompany().trim() || undefined,
      });
      if (res.success && res.data) {
        this.pickContact({
          id: res.data.id, name: res.data.name, email: res.data.email,
          company: res.data.company, position: res.data.position, isFavorite: res.data.isFavorite,
        });
        this.suggestedContacts.update(list => list.some(c => c.id === res.data!.id)
          ? list
          : [...list, { id: res.data!.id, name: res.data!.name, email: res.data!.email, company: res.data!.company, position: res.data!.position, isFavorite: res.data!.isFavorite }]);
      } else {
        this.inlineError.set(res.message || 'Failed to create contact');
      }
    } catch (e: unknown) {
      const err = e as { error?: { message?: string }; message?: string };
      this.inlineError.set(err?.error?.message || err?.message || 'Failed to create contact');
    }
  }

  selectedContact = computed(() => {
    const id = this.selectedContactId();
    if (!id) return null;
    return this.suggestedContacts().find(c => c.id === id) ?? null;
  });

  async openContactPanel(attempt: AttemptResponseDto) {
    if (!attempt.contactId) return;
    await this.openContactPanelById(attempt.contactId);
  }

  async openContactPanelById(contactId: string) {
    this.panelOpen.set(true);
    this.panelLoading.set(true);
    this.panelContact.set(null);
    this.panelEmails.set([]);
    this.panelApplications.set([]);
    try {
      const [histRes, appsRes] = await Promise.all([
        this.contactApi.getContactHistory(contactId),
        this.appService.getApplicationsForContact(contactId).catch(() => null),
      ]);
      if (histRes.success && histRes.data) {
        this.panelContact.set(histRes.data.contact);
        this.panelEmails.set(histRes.data.emails || []);
      }
      if (appsRes?.success && appsRes.data) {
        this.panelApplications.set(appsRes.data.filter((a): a is ApplicationResponseDto => !!a));
      }
    } catch { }
    finally { this.panelLoading.set(false); }
  }

  closeContactPanel() { this.panelOpen.set(false); }

  async createAttempt(markSent: boolean) {
    const app = this.application();
    if (!app) return;
    const f = this.attemptForm();
    const cfg = this.channelFields();
    this.saving.set(true);
    this.attemptError.set(null);
    try {
      const res = await this.appService.createAttempt(app.id, {
        channel: f.channel,
        initiatedBy: f.initiatedBy,
        status: markSent ? 'SENT' : 'DRAFT',
        subject: cfg.subject ? (f.subject.trim() || undefined) : undefined,
        body: cfg.message ? (f.body.trim() || undefined) : undefined,
        recipientName: cfg.recipientName ? (f.recipientName.trim() || undefined) : undefined,
        recipientContact: cfg.recipientContact ? (f.recipientContact.trim() || undefined) : undefined,
        contactId: this.selectedContactId() ?? undefined,
        channelMetadataJson: this.buildAttemptMetadata(),
        coverLetterVersionId: f.coverLetterVersionId || null,
        sentAt: markSent ? new Date().toISOString() : undefined,
      });
      if (res.success && res.data) {
        this.closeAttemptModal();
        await this.loadApplication(app.id);
      } else {
        this.attemptError.set(res.message || 'Failed to log attempt');
      }
    } catch { this.attemptError.set('Failed to log attempt'); }
    finally { this.saving.set(false); }
  }

  async setAttemptStatus(attempt: AttemptResponseDto, status: AttemptStatus, failureReason?: string) {
    const app = this.application();
    if (!app) return;
    try {
      await this.appService.updateAttempt(app.id, attempt.id, {
        status,
        failureReason,
        ...(status === 'SENT' && !attempt.sentAt ? { sentAt: new Date().toISOString() } : {}),
      });
      await this.loadApplication(app.id);
    } catch { }
  }

  async saveEdit() {
    const app = this.application();
    if (!app) return;
    this.saving.set(true);
    try {
      const res = await this.appService.update(app.id, {
        companyName: this.editCompanyName(), positionTitle: this.editPositionTitle(),
        offerSource: this.editOfferSource() || undefined, notes: this.editNotes() || undefined,
        internshipType: this.editInternshipType().trim() || undefined,
        priority: this.editPriority(),
        cvVersionId: this.editCvVersionId().trim() || undefined,
      });
      if (res.success && res.data) this.application.set(res.data);
      // Company fields live on the company record; only touched ones are saved.
      if (this.editCountry() && this.editCountry() !== (this.reachCompany()?.country || '')) await this.saveCompanyField('country', this.editCountry());
      if (this.editCity().trim() !== (this.reachCompany()?.location || '')) await this.saveCompanyField('location', this.editCity());
      this.toast.success('Application saved');
      this.closeEditModal();
    } catch {
      this.toast.error('Failed to save application');
    } finally { this.saving.set(false); }
  }

  async onDelete() {
    const app = this.application();
    if (!app || !confirm('Delete this application?')) return;
    try { await this.appService.delete(app.id); this.router.navigate(['/applications/kanban']); }
    catch { }
  }

  getStatusLabel(s: string) { return STATUS_LABELS[s as ApplicationStatus] || s; }

  formatDate(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  formatDateTime(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  statusColor(s: string): string {
    return STATUS_COLORS[s as ApplicationStatus] ?? STATUS_COLORS.SAVED;
  }

  readonly priorityColor = priorityColor;

  attachmentDownloadUrl(index: number): string {
    const app = this.application();
    return app ? `/api/applications/${app.id}/attachments/${index}/download` : '';
  }

  async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) await this.uploadAttachments(files);
  }

  async uploadAttachments(files: File[]) {
    const app = this.application();
    if (!app || this.attachmentsUploading()) return;
    this.attachmentsUploading.set(true);
    this.attachmentError.set(null);
    try {
      const refs = await Promise.all(files.map(f => this.mailbox.uploadAttachment(f)));
      const failed = refs.find(r => !r.success || !r.data);
      if (failed) { this.attachmentError.set(failed.message || 'Upload failed'); return; }
      const next = [...(app.attachments ?? []), ...refs.map(r => r.data!)];
      const res = await this.appService.update(app.id, { attachments: next });
      if (res.success && res.data) {
        this.application.set(res.data);
      } else {
        this.attachmentError.set(res.message || 'Failed to save attachments');
      }
    } catch {
      this.attachmentError.set('Upload failed');
    } finally {
      this.attachmentsUploading.set(false);
    }
  }

  async removeAttachment(index: number) {
    const app = this.application();
    if (!app || this.attachmentsUploading()) return;
    this.attachmentError.set(null);
    try {
      const next = (app.attachments ?? []).filter((_, i) => i !== index);
      const res = await this.appService.update(app.id, { attachments: next });
      if (res.success && res.data) {
        this.application.set(res.data);
      } else {
        this.attachmentError.set(res.message || 'Failed to remove attachment');
      }
    } catch {
      this.attachmentError.set('Failed to remove attachment');
    }
  }

  formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── CV sent with this apply ─────────────────────────────────────────────
  async ensureDocumentsLoaded() {
    if (this.docLoaded || this.docLoading()) return;
    this.docLoading.set(true);
    try {
      const cvs = await this.documents.listCvs();
      if (cvs.success && cvs.data) this.cvDocuments.set(cvs.data);
      const letters = await this.documents.listCoverLetters();
      if (letters.success && letters.data) this.docLetters.set(letters.data);
      this.docLoaded = true;
    } catch {
    } finally {
      this.docLoading.set(false);
    }
  }

  /** Updates the application's CV version. '' clears it (sentinel Guid.Empty). */
  async setApplicationCv(value: string) {
    const app = this.application();
    if (!app) return;
    this.attachmentError.set(null);
    try {
      const res = await this.appService.update(app.id, {
        cvVersionId: value ? value : '00000000-0000-0000-0000-000000000000',
      });
      if (res.success && res.data) {
        this.application.set(res.data);
      } else {
        this.attachmentError.set(res.message || 'Failed to update CV');
      }
    } catch {
      this.attachmentError.set('Failed to update CV');
    }
  }

  // ── From-Documents picker ───────────────────────────────────────────────
  openDocsPicker() {
    void this.ensureDocumentsLoaded();
    this.docsOpen.set(true);
  }
  closeDocsPicker() { this.docsOpen.set(false); }

  docVersionLabel(v: CvVersionDto): string {
    const base = `v${v.versionNumber}`;
    return v.label ? `${base} · ${v.label}` : base;
  }

  async pickDocVersion(cv: CvDocumentDto, v: CvVersionDto) {
    const name = `${cv.title} — ${this.docVersionLabel(v)}.pdf`;
    const ok = await this.attachBlobAsFile(name, () => this.documents.getVersionFileBlob(v.id));
    if (ok) this.closeDocsPicker();
  }

  async pickLetterVersion(letter: CoverLetterDto, v: CoverLetterVersionDto) {
    const name = `${letter.title}${letter.companyName ? ` (${letter.companyName})` : ''} — v${v.versionNumber}.pdf`;
    const ok = await this.attachBlobAsFile(name, () => this.documents.getCoverLetterVersionFileBlob(v.id));
    if (ok) this.closeDocsPicker();
  }

  /** Fetches document bytes through the app's authenticated endpoint, uploads to
   *  MinIO via the mailbox attachment path, then persists the ref on the application. */
  private async attachBlobAsFile(fileName: string, fetchBlob: () => Promise<Blob>): Promise<boolean> {
    try {
      const blob = await fetchBlob();
      const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
      await this.uploadAttachments([file]);
      return true;
    } catch {
      this.attachmentError.set(`Could not load "${fileName}" from Documents`);
      return false;
    }
  }
}
