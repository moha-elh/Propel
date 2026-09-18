import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationService } from '@app/services/application.service';
import { DirectAiService } from '@app/services/direct-ai.service';
import { ContactService } from '@app/services/contact.service';
import { AuthService } from '@app/services/auth.service';
import { CompanyService } from '@app/services/company.service';
import { DocumentsService } from '@app/services/documents.service';
import type { CompanyDto } from '@app/services/company.service';
import { CvDocumentDto, CvVersionDto } from '@app/models/document.model';
import {
  DuplicateMatchDto,
  ApiResponse,
  ApplicationResponseDto,
  ApplicationStatus,
  ApplicationPriority,
  AttemptChannel,
  AttemptInitiatedBy,
  ContactSummaryDto,
  STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from '@app/models/application.model';

/** Default login used to sign into an external web application portal. */
const DEFAULT_LOGIN_EMAIL = 'mouhssineelhaouary@gmail.com';
const DEFAULT_LOGIN_PASSWORD = 'Stage2027';

interface ChannelTile {
  value: AttemptChannel;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-application-create',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink],
  templateUrl: './application-create.component.html',
  styleUrl: './application-create.component.scss',
})
export class ApplicationCreateComponent implements OnInit {
  private appService = inject(ApplicationService);
  private directAi = inject(DirectAiService);
  private contactApi = inject(ContactService);
  private companyApi = inject(CompanyService);
  private docsApi = inject(DocumentsService);
  private authService = inject(AuthService);
  protected router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  ngOnInit() {
    // Prefill support, e.g. /applications/new?companyName=… from a company detail page.
    const prefill = this.route.snapshot.queryParamMap.get('companyName');
    if (prefill) this.companyName.set(prefill);
    void this.loadCvDocs();
    void this.loadCvVersions();
  }

  cvVersionLabel(v: CvVersionDto): string {
    const base = `v${v.versionNumber}`;
    return v.label ? `${base} · ${v.label}` : base;
  }

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

  submitting = signal(false);
  error = signal<string | null>(null);
  duplicateWarning = signal<DuplicateMatchDto[] | null>(null);

  // ── Paste-to-fill: extract fields from a pasted job post / email ──────────────
  pasteOpen = signal(false);
  pasteText = signal('');
  extracting = signal(false);
  extractError = signal<string | null>(null);

  async extractFromPaste() {
    const text = this.pasteText().trim();
    if (!text || this.extracting()) return;
    this.extracting.set(true);
    this.extractError.set(null);
    try {
      const res = await this.directAi.chat({
        system:
          'Extract job-application fields from the text. Reply with ONLY a JSON object, no markdown, ' +
          'using these keys (empty string when unknown): companyName, positionTitle, offerSource ' +
          '(e.g. LinkedIn, company site, referral), internshipType (e.g. PFE, summer, "" if not an internship), ' +
          'recipientName (contact person), recipientEmail, notes (short 1-2 sentence summary).',
        user: text,
        temperature: 0,
      });
      const raw = res.data?.text ?? '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!res.success || !match) {
        this.extractError.set('Could not extract fields — fill them in manually.');
        return;
      }
      const d = JSON.parse(match[0]) as Record<string, string>;
      const set = (sig: { set: (v: string) => void; (): string }, v?: string) => {
        if (v && v.trim()) sig.set(v.trim());
      };
      set(this.companyName, d['companyName']);
      set(this.positionTitle, d['positionTitle']);
      set(this.offerSource, d['offerSource']);
      set(this.internshipType, d['internshipType']);
      set(this.notes, d['notes']);
      set(this.recipientName, d['recipientName']);
      set(this.recipientContact, d['recipientEmail']);
      if (d['companyName']?.trim()) this.companyIsNew.set(true);
      this.pasteOpen.set(false);
      this.pasteText.set('');
    } catch {
      this.extractError.set('Could not extract fields — fill them in manually.');
    } finally {
      this.extracting.set(false);
    }
  }

  // ── Form state ──────────────────────────────────────────────────────────────
  companyName = signal('');
  positionTitle = signal('');
  offerSource = signal('');
  notes = signal('');
  internshipType = signal('');
  priority = signal<ApplicationPriority>('MEDIUM');

  /** Where the candidate stands at creation time. */
  stage = signal<'SAVED' | 'APPLIED'>('APPLIED');

  // ── CV used (linked to this application) ────────────────────────────────────
  cvDocs = signal<CvDocumentDto[]>([]);
  cvLoading = signal(false);
  selectedCvVersionId = signal('');
  cvTiles = computed(() => {
    const tiles: { id: string; title: string; version: string; tags: string[] }[] = [];
    for (const cv of this.cvDocs()) {
      for (const v of cv.versions) {
        tiles.push({ id: v.id, title: cv.title, version: this.cvVersionLabel(v), tags: cv.tags ?? [] });
      }
    }
    return tiles;
  });

  // ── First attempt (only used when stage === 'APPLIED') ──────────────────────
  channel = signal<AttemptChannel>('EMAIL_GMAIL');
  initiatedBy = signal<AttemptInitiatedBy>('USER');
  markSent = signal(true);
  subject = signal('');
  body = signal('');
  recipientName = signal('');
  recipientContact = signal('');

  // ── Account used for the apply attempt (any channel, toggleable) ────────────
  formAccountEnabled = signal(false);
  formAccountEmail = signal(DEFAULT_LOGIN_EMAIL);
  formAccountPassword = signal(DEFAULT_LOGIN_PASSWORD);
  showFormAccountPassword = signal(false);

  /** Date of the first apply — defaults to today; backfill earlier applications by changing it. */
  appliedDate = signal(this.localTodayStr());

  // ── CV used for this application (defaults to the single active CV) ───────
  cvVersions = signal<{ version: CvVersionDto; label: string }[]>([]);
  cvVersionId = signal<string>('');

  /** Label of the pre-selected active CV (used in the sidebar hint). */
  activeCvName = computed<string>(() => {
    const selected = this.cvVersionId();
    const hit = this.cvVersions().find(o => o.version.id === selected);
    return hit ? hit.label.replace(' (active)', '') : '';
  });

  /** Defaults the select to the active CV's latest version. */
  private async loadCvVersions() {
    if (this.cvLoading()) return;
    this.cvLoading.set(true);
    try {
      const res = await this.docsApi.listCvs();
      if (!res.success || !res.data) return;
      const active = res.data.find(c => c.isActive);
      const options: { version: CvVersionDto; label: string }[] = [];
      for (const cv of res.data) {
        const versions = [...cv.versions].sort((a, b) => b.versionNumber - a.versionNumber);
        versions.forEach((v, i) => {
          options.push({
            version: v,
            label: `${cv.title} · v${v.versionNumber}${i === 0 && cv.isActive ? ' (active)' : ''}${v.label ? ` — ${v.label}` : ''}`,
          });
        });
      }
      this.cvVersions.set(options);
      if (active && active.versions.length) {
        const latest = [...active.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
        this.cvVersionId.set(latest.id);
      }
    } catch {
      // non-blocking — attempt still saves without a CV
    } finally {
      this.cvLoading.set(false);
    }
  }

  private localTodayStr(): string {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

  private isoFromDate(value: string): string | undefined {
    if (!value) return undefined;
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  // Contact linking for the first attempt (search-all — no app id exists yet)
  pickedContact = signal<ContactSummaryDto | null>(null);
  contactSearch = signal('');
  contactResults = signal<ContactSummaryDto[]>([]);
  searchingContacts = signal(false);

  /** When an unmatched recipient is typed, optionally persist them to the contact list. */
  saveRecipientAsContact = signal(false);

  // Inline "add a new contact" (create + link in one go)
  newContactMode = signal(false);
  newContactName = signal('');
  newContactEmail = signal('');
  newContactCompany = signal('');
  newContactPosition = signal('');
  creatingContact = signal(false);
  newContactError = signal<string | null>(null);

  // ── Company name: suggest existing companies, allow a brand-new name ───────
  companyMatches = signal<CompanyDto[]>([]);
  searchingCompanies = signal(false);
  companySuggestOpen = signal(false);
  /** True when the typed name does NOT match an existing saved company. */
  companyIsNew = signal(false);
  /** The saved company matching the typed name (tracks its logo when it exists). */
  pickedCompany = signal<CompanyDto | null>(null);
  /** When the name is new, offer to persist it to the Companies directory. */
  saveCompanyInfo = signal(true);
  private companyTimer: ReturnType<typeof setTimeout> | null = null;

  /** Logo URL when the current company name resolves to a saved company that has one. */
  companyLogoUrl = computed<string | null>(() => this.pickedCompany()?.logoUrl ?? null);

  pickCompany(c: CompanyDto) {
    if (this.companyTimer) { clearTimeout(this.companyTimer); this.companyTimer = null; }
    this.companyName.set(c.name);
    this.companyIsNew.set(false);
    this.companySuggestOpen.set(false);
    this.companyMatches.set([]);
    this.pickedCompany.set(c);
  }

  onCompanyInput(v: string) {
    this.companyName.set(v);
    const trimmed = v.trim();
    this.companyIsNew.set(trimmed.length > 0);
    // A live edit breaks the logo match — clear it until a suggestion is re-picked.
    const picked = this.pickedCompany();
    if (picked && picked.name.toLowerCase() !== trimmed.toLowerCase()) this.pickedCompany.set(null);
    if (!trimmed) {
      this.companyMatches.set([]);
      this.companySuggestOpen.set(false);
      this.pickedCompany.set(null);
      return;
    }
    this.companySuggestOpen.set(true);
    if (this.companyTimer) clearTimeout(this.companyTimer);
    this.companyTimer = setTimeout(() => this.loadCompanySuggestions(trimmed), 220);
  }

  onCompanyFocus() {
    if (this.companyName().trim()) {
      this.companySuggestOpen.set(true);
      this.searchingCompanies.set(true);
      this.companyApi.getCompanies({ search: this.companyName().trim(), pageSize: 8, sortBy: 'name' })
        .then(res => { if (res.success && res.data) this.companyMatches.set(res.data.items); })
        .catch(() => { })
        .finally(() => this.searchingCompanies.set(false));
    }
  }

  private loadCompanySuggestions(term: string) {
    this.searchingCompanies.set(true);
    this.companyApi.getCompanies({ search: term, pageSize: 8, sortBy: 'name' })
      .then(res => {
        const items = res.success && res.data ? res.data.items : [];
        this.companyMatches.set(items);
        const cur = this.companyName().trim().toLowerCase();
        this.companyIsNew.set(cur.length > 0 && !items.some(c => c.name.toLowerCase() === cur));
        // Auto-resolve the logo when the typed name is an exact match.
        const exact = items.find(c => c.name.toLowerCase() === cur);
        if (exact) this.pickedCompany.set(exact);
      })
      .catch(() => {
        this.companyMatches.set([]);
        this.companyIsNew.set(this.companyName().trim().length > 0);
      })
      .finally(() => this.searchingCompanies.set(false));
  }

  searchContacts() {
    const term = this.contactSearch().trim();
    if (term.length < 2) { this.contactResults.set([]); return; }
    this.searchingContacts.set(true);
    this.contactApi.getContacts({ search: term, pageSize: 6 })
      .then(res => {
        if (res.success && res.data) {
          this.contactResults.set(res.data.items.map(c => ({
            id: c.id, name: c.name, email: c.email,
            company: c.company, position: c.position, isFavorite: c.isFavorite,
          })));
        }
      })
      .catch(() => { })
      .finally(() => this.searchingContacts.set(false));
  }

  pickContact(c: ContactSummaryDto) {
    this.pickedContact.set(c);
    const cfg = this.channelFields();
    if (cfg.recipientName && !this.recipientName().trim()) this.recipientName.set(c.name);
    const ch = this.channel();
    if (cfg.recipientContact && !this.recipientContact().trim() && (ch === 'EMAIL_GMAIL' || ch === 'EMAIL_SMTP')) {
      this.recipientContact.set(c.email);
    }
    this.contactSearch.set('');
    this.contactResults.set([]);
  }

  openNewContact() {
    this.newContactMode.set(true);
    const term = this.contactSearch().trim();
    if (term && !this.newContactName().trim()) this.newContactName.set(term);
    if (!this.newContactCompany().trim()) this.newContactCompany.set(this.companyName().trim());
    this.newContactError.set(null);
  }

  closeNewContact() { this.newContactMode.set(false); this.newContactError.set(null); }

  async saveNewContact() {
    const name = this.newContactName().trim();
    const email = this.newContactEmail().trim();
    if (!name || !email) { this.newContactError.set('Name and email are required'); return; }
    this.creatingContact.set(true);
    this.newContactError.set(null);
    try {
      const res = await this.contactApi.createContact({
        name,
        email,
        company: this.newContactCompany().trim() || undefined,
        position: this.newContactPosition().trim() || undefined,
      });
      if (!res.success || !res.data) {
        this.newContactError.set(res.message || 'Failed to create contact');
        return;
      }
      const c = res.data;
      this.pickContact({ id: c.id, name: c.name, email: c.email, company: c.company, position: c.position, isFavorite: c.isFavorite });
      this.newContactMode.set(false);
    } catch {
      this.newContactError.set('Failed to create contact');
    } finally {
      this.creatingContact.set(false);
    }
  }

  clearPickedContact() { this.pickedContact.set(null); }

  protected readonly STATUS_LABELS = STATUS_LABELS;
  protected readonly PRIORITY_LABELS = PRIORITY_LABELS;
  protected readonly PRIORITY_ORDER = PRIORITY_ORDER;

  readonly channels: ChannelTile[] = [
    { value: 'EMAIL_GMAIL',          label: 'Gmail',              icon: 'ti-brand-gmail' },
    { value: 'EMAIL_SMTP',           label: 'Email (SMTP)',       icon: 'ti-mail' },
    { value: 'WHATSAPP',             label: 'WhatsApp',           icon: 'ti-brand-whatsapp' },
    { value: 'LINKEDIN_MESSAGE',     label: 'LinkedIn message',   icon: 'ti-brand-linkedin' },
    { value: 'LINKEDIN_CONNECTION',  label: 'LinkedIn connect',   icon: 'ti-user-plus' },
    { value: 'LINKEDIN_APPLY',       label: 'LinkedIn apply',     icon: 'ti-brand-linkedin' },
    { value: 'WEB_FORM',             label: 'Web form',           icon: 'ti-world' },
    { value: 'IN_PERSON',            label: 'In person',          icon: 'ti-users-group' },
    { value: 'OTHER',                label: 'Other',              icon: 'ti-dots' },
  ];

  protected readonly INITIATORS: { value: AttemptInitiatedBy; label: string }[] = [
    { value: 'USER', label: 'Me' },
    { value: 'AI_AGENT', label: 'AI agent' },
    { value: 'SCHEDULE', label: 'Scheduled' },
  ];

  /** Which attempt fields apply per channel (email gets subject, web form gets the URL, …). */
  readonly channelFields = computed<{
    subject: boolean;
    message: boolean;
    messageLabel: string;
    messagePlaceholder: string;
    recipientName: boolean;
    recipientContact: boolean;
    recipientContactLabel: string;
    recipientContactPlaceholder: string;
  }>(() => {
    switch (this.channel()) {
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
  });

  get isFormValid(): boolean {
    return this.companyName().trim().length > 0 && this.positionTitle().trim().length > 0;
  }

  /** Persist extra channel info (form URL + the account used) on the attempt. */
  private buildChannelMetadataJson(): string | undefined {
    const meta: Record<string, string> = {};
    if (this.channel() === 'WEB_FORM' || this.channel() === 'LINKEDIN_APPLY') {
      const url = this.recipientContact().trim();
      if (url) meta['formUrl'] = url;
    }
    if (this.formAccountEnabled() && this.formAccountEmail().trim()) {
      meta['accountEmail'] = this.formAccountEmail().trim();
      if (this.formAccountPassword()) meta['accountPassword'] = this.formAccountPassword();
    }
    return Object.keys(meta).length ? JSON.stringify(meta) : undefined;
  }

  setStage(stage: 'SAVED' | 'APPLIED') { this.stage.set(stage); }
  dismissDuplicates() { this.duplicateWarning.set(null); }

  // ── Live preview card ───────────────────────────────────────────────────────
  previewStatus = computed<ApplicationStatus>(() => (this.stage() === 'APPLIED' ? 'APPLIED' : 'SAVED'));
  previewDate = computed(() => {
    if (this.stage() !== 'APPLIED') return null;
    const iso = this.isoFromDate(this.appliedDate());
    return iso ? new Date(iso) : new Date();
  });

  async onSubmit(force = false) {
    if (!this.isFormValid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);

    const user = this.authService.currentUser();
    if (!user) {
      this.error.set('You must be logged in');
      this.submitting.set(false);
      return;
    }

    try {
      // Pre-flight duplicate check unless the user already chose to force-create.
      if (!force) {
        try {
          const dupRes = await this.appService.checkDuplicate({
            companyName: this.companyName().trim(),
            positionTitle: this.positionTitle().trim(),
          });
          if (dupRes.success && dupRes.data?.hasDuplicates) {
            this.duplicateWarning.set(dupRes.data.matches);
            this.submitting.set(false);
            return;
          }
        } catch { /* check failed — let create decide */ }
      }

      // If the company name is brand new and the user opted in, save it to the directory.
      if (this.companyIsNew() && this.saveCompanyInfo()) {
        this.companyApi.createCompany({ name: this.companyName().trim() }).catch(() => { /* non-blocking */ });
      }

      const res = await this.appService.create({
        candidateId: user.userId,
        companyName: this.companyName().trim(),
        positionTitle: this.positionTitle().trim(),
        offerSource: this.offerSource().trim() || undefined,
        notes: this.notes().trim() || undefined,
        status: this.stage(),
        allowDuplicate: force || undefined,
        internshipType: this.internshipType().trim() || undefined,
        priority: this.priority(),
        appliedAt: this.stage() === 'APPLIED' ? this.isoFromDate(this.appliedDate()) : undefined,
        cvVersionId: this.selectedCvVersionId().trim() || this.cvVersionId() || undefined,
      });

      if (!res.success || !res.data) {
        this.error.set(res.message || 'Failed to create');
        return;
      }

      const appId = res.data.id;

      // Log the first apply attempt — a SENT attempt flips the app to APPLIED server-side.
      if (this.stage() === 'APPLIED') {
        const cfg = this.channelFields();
        let contactId = this.pickedContact()?.id;

        // Optional side effect: persist an unmatched recipient to the contact list.
        if (contactId == null && this.saveRecipientAsContact()) {
          try {
            const recipientName = this.recipientName().trim();
            const recipientContact = this.recipientContact().trim();
            if (recipientName && recipientContact.includes('@')) {
              const created = await this.contactApi.createContact({
                name: recipientName,
                email: recipientContact,
                company: this.companyName().trim() || undefined,
                position: this.positionTitle().trim() || undefined,
              });
              if (created.success && created.data) contactId = created.data.id;
            }
          } catch { /* contact save failed — never block application creation */ }
        }

        try {
          await this.appService.createAttempt(appId, {
            channel: this.channel(),
            initiatedBy: this.initiatedBy(),
            status: this.markSent() ? 'SENT' : 'DRAFT',
            subject: cfg.subject ? (this.subject().trim() || undefined) : undefined,
            body: cfg.message ? (this.body().trim() || undefined) : undefined,
            recipientName: cfg.recipientName ? (this.recipientName().trim() || undefined) : undefined,
            recipientContact: cfg.recipientContact ? (this.recipientContact().trim() || undefined) : undefined,
            contactId,
            channelMetadataJson: this.buildChannelMetadataJson(),
            cvVersionId: this.selectedCvVersionId().trim() || this.cvVersionId() || undefined,
            sentAt: this.markSent() ? (this.isoFromDate(this.appliedDate()) ?? new Date().toISOString()) : undefined,
          });
        } catch { /* attempt logging failed — app still created */ }
      }

      this.router.navigate(['/applications', appId]);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        const apiErr = err.error as ApiResponse<ApplicationResponseDto>;
        const payload = apiErr?.errors as { matches?: DuplicateMatchDto[] } | undefined;
        if (payload?.matches?.length) {
          this.duplicateWarning.set(payload.matches);
        } else {
          this.error.set(apiErr?.message || 'This application already exists');
        }
      } else {
        this.error.set(err instanceof HttpErrorResponse
          ? ((err.error as ApiResponse<unknown>)?.message ?? 'An error occurred')
          : err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      this.submitting.set(false);
    }
  }

  formatPreviewDate(d: Date | null): string {
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  }

  statusLabel(s: string): string {
    return STATUS_LABELS[s as ApplicationStatus] ?? s;
  }
}
