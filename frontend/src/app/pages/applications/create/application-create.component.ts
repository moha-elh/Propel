import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationService } from '@app/services/application.service';
import { ContactService } from '@app/services/contact.service';
import { AuthService } from '@app/services/auth.service';
import { CompanyService } from '@app/services/company.service';
import type { CompanyDto } from '@app/services/company.service';
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
  private contactApi = inject(ContactService);
  private companyApi = inject(CompanyService);
  private authService = inject(AuthService);
  protected router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  ngOnInit() {
    // Prefill support, e.g. /applications/new?companyName=… from a company detail page.
    const prefill = this.route.snapshot.queryParamMap.get('companyName');
    if (prefill) this.companyName.set(prefill);
  }

  submitting = signal(false);
  error = signal<string | null>(null);
  duplicateWarning = signal<DuplicateMatchDto[] | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  companyName = signal('');
  positionTitle = signal('');
  offerSource = signal('');
  notes = signal('');
  internshipType = signal('');
  priority = signal<ApplicationPriority>('MEDIUM');

  /** Where the candidate stands at creation time. */
  stage = signal<'SAVED' | 'APPLIED'>('APPLIED');

  // ── First attempt (only used when stage === 'APPLIED') ──────────────────────
  channel = signal<AttemptChannel>('EMAIL_GMAIL');
  initiatedBy = signal<AttemptInitiatedBy>('USER');
  markSent = signal(true);
  subject = signal('');
  body = signal('');
  recipientName = signal('');
  recipientContact = signal('');

  /** Date of the first apply — defaults to today; backfill earlier applications by changing it. */
  appliedDate = signal(this.localTodayStr());

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
  /** When the name is new, offer to persist it to the Companies directory. */
  saveCompanyInfo = signal(true);
  private companyTimer: ReturnType<typeof setTimeout> | null = null;

  onCompanyInput(v: string) {
    this.companyName.set(v);
    const trimmed = v.trim();
    this.companyIsNew.set(trimmed.length > 0);
    if (!trimmed) {
      this.companyMatches.set([]);
      this.companySuggestOpen.set(false);
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
      })
      .catch(() => {
        this.companyMatches.set([]);
        this.companyIsNew.set(this.companyName().trim().length > 0);
      })
      .finally(() => this.searchingCompanies.set(false));
  }

  pickCompany(c: CompanyDto) {
    if (this.companyTimer) { clearTimeout(this.companyTimer); this.companyTimer = null; }
    this.companyName.set(c.name);
    this.companyIsNew.set(false);
    this.companySuggestOpen.set(false);
    this.companyMatches.set([]);
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
      });

      if (!res.success || !res.data) {
        this.error.set(res.message || 'Failed to create');
        return;
      }

      const appId = res.data.id;

      // Log the first apply attempt — a SENT attempt flips the app to APPLIED server-side.
      if (this.stage() === 'APPLIED') {
        const cfg = this.channelFields();
        try {
          await this.appService.createAttempt(appId, {
            channel: this.channel(),
            initiatedBy: this.initiatedBy(),
            status: this.markSent() ? 'SENT' : 'DRAFT',
            subject: cfg.subject ? (this.subject().trim() || undefined) : undefined,
            body: cfg.message ? (this.body().trim() || undefined) : undefined,
            recipientName: cfg.recipientName ? (this.recipientName().trim() || undefined) : undefined,
            recipientContact: cfg.recipientContact ? (this.recipientContact().trim() || undefined) : undefined,
            contactId: this.pickedContact()?.id,
            channelMetadataJson: (this.channel() === 'WEB_FORM' && this.recipientContact().trim())
              ? JSON.stringify({ formUrl: this.recipientContact().trim() })
              : undefined,
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
