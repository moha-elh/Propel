import { Component, signal, inject, OnInit, computed, effect } from '@angular/core';
import { SheetImportDialogComponent } from '@app/shared/components/sheet-import-dialog/sheet-import-dialog.component';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { CronBuilderComponent } from '@app/shared/components/cron-builder/cron-builder.component';
import { AutoFillDialogComponent } from '@app/shared/components/auto-fill-dialog/auto-fill-dialog.component';
import { ContactsExtractDialogComponent } from '@app/shared/components/contacts-extract-dialog/contacts-extract-dialog.component';
import { ContactQuickActionsComponent } from '@app/shared/components/contact-quick-actions/contact-quick-actions.component';
import { AutofillField } from '@app/services/autofill.service';
import { DirectAiService } from '@app/services/direct-ai.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MailboxService } from '@app/services/mailbox.service';
import { ContactService } from '@app/services/contact.service';
import { ToastService } from '@app/services/toast.service';
import { DocumentsService } from '@app/services/documents.service';
import { CvDocumentDto, CvVersionDto } from '@app/models/document.model';
import {
  ContactDto, EmailMessageDto, EmailScheduleDto, ScheduleHistoryItem,
  MailboxStatsDto, SendEmailDto, ContactHistoryResponse, EmailAttachmentPayload,
} from '@app/models/mailbox.model';
import { ApplicationResponseDto, STATUS_LABELS } from '@app/models/application.model';
import {
  ScheduleTemplateDto, ApplyTemplateDto, ApplyTemplateResultDto, ScheduleAttachmentRef,
} from '@app/models/apply.model';

type MailboxView = 'compose' | 'history' | 'contacts' | 'schedules' | 'templates' | 'settings';

interface EmailTemplate {
  name: string;
  subject: string;
  body: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    name: 'Initial Outreach',
    subject: 'Application for Software Engineering Position',
    body: `Dear Hiring Manager,\n\nI am writing to express my strong interest in the Software Engineering position. With my background in full-stack development and passion for building scalable systems, I believe I would be a great addition to your team.\n\nI have attached my resume for your review and would welcome the opportunity to discuss how my skills align with your needs.\n\nBest regards,\n[Your Name]`,
  },
  {
    name: 'Follow-up',
    subject: 'Follow-up on Application',
    body: `Dear Hiring Manager,\n\nI hope this message finds you well. I wanted to follow up on my application submitted recently. I remain very interested in the position and would love to hear about any updates regarding the hiring process.\n\nPlease let me know if you need any additional information from me.\n\nBest regards,\n[Your Name]`,
  },
  {
    name: 'Interview Thank You',
    subject: 'Thank You for the Interview',
    body: `Dear Interviewer,\n\nThank you so much for taking the time to speak with me today. I truly enjoyed learning more about the team and the exciting work you are doing.\n\nOur conversation reinforced my enthusiasm for the role and I am confident that my skills and experience would be a great fit.\n\nI look forward to hearing about the next steps.\n\nBest regards,\n[Your Name]`,
  },
  {
    name: 'Status Update Request',
    subject: 'Application Status Inquiry',
    body: `Dear Hiring Manager,\n\nI hope you are doing well. I wanted to kindly check in on the status of my application. I remain very interested in the position and am eager to hear any updates.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your Name]`,
  },
];

@Component({
  selector: 'app-mailbox',
  standalone: true,
  imports: [CommonModule, FormsModule, SheetImportDialogComponent, RefreshButtonComponent, CronBuilderComponent, AutoFillDialogComponent, ContactsExtractDialogComponent, ContactQuickActionsComponent],
  templateUrl: './mailbox.component.html',
  styleUrl: './mailbox.component.scss',
})
export class MailboxComponent implements OnInit {
  private service = inject(MailboxService);
  private contactApi = inject(ContactService);
  private docApi = inject(DocumentsService);
  readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly directAi = inject(DirectAiService);

  view = signal<MailboxView>((localStorage.getItem('mailbox-view') as MailboxView) || 'compose');

  constructor() {
    effect(() => localStorage.setItem('mailbox-view', this.view()));
  }
  loading = signal(true);
  refreshing = signal(false);
  stats = signal<MailboxStatsDto | null>(null);

  contacts = signal<ContactDto[]>([]);
  contactsLoading = signal(false);
  contactsTotal = signal(0);
  contactSearch = signal('');
  showFavoritesOnly = signal(false);
  contactsPage = signal(1);
  contactsHasMore = signal(false);
  private readonly CONTACTS_PAGE_SIZE = 50;
  private contactSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private modalContactTimer: ReturnType<typeof setTimeout> | null = null;
  private composeContactTimer: ReturnType<typeof setTimeout> | null = null;
  contactDetailView = signal(false);
  selectedContactDetail = signal<ContactDto | null>(null);
  contactHistory = signal<EmailMessageDto[]>([]);
  contactHistoryLoading = signal(false);
  cdEditing = signal(false);
  cdEditName = signal('');
  cdEditEmail = signal('');
  cdEditCompany = signal('');
  cdEditPosition = signal('');
  cdEditPhone = signal('');
  cdEditLinkedin = signal('');
  cdEditNotes = signal('');

  history = signal<EmailMessageDto[]>([]);
  historyLoading = signal(false);
  historyTotal = signal(0);
  historyPage = signal(1);
  historySearch = signal('');
  selectedEmail = signal<EmailMessageDto | null>(null);
  selectedEmailLoading = signal(false);

  schedules = signal<EmailScheduleDto[]>([]);
  schedulesLoading = signal(false);

  composeRecipientSearch = signal('');
  composeSuggestions = signal<ContactDto[]>([]);
  composeRecipients = signal<ContactDto[]>([]);
  composeSubject = signal('');
  composeBody = signal('');
  draftHint = signal('');
  composeSending = signal(false);
  composeAi = signal(false);

  // Attempt logging: candidates are applications linked to the chosen recipients.
  attemptCandidates = signal<ApplicationResponseDto[]>([]);
  logAttempt = signal(true);
  attemptAppId = signal<string | null>(null);
  private readonly candidateCache = new Map<string, ApplicationResponseDto[]>();

  selectedContact = signal<ContactDto | null>(null);
  showContactForm = signal(false);
  sheetImportOpen = signal(false);
  extractContactsOpen = signal(false);
  contactFormName = signal('');
  contactFormEmail = signal('');
  contactFormPhone = signal('');
  contactFormMobile = signal('');
  contactFormFax = signal('');
  contactFormAddress = signal('');
  contactFormCompany = signal('');
  contactFormPosition = signal('');
  contactFormLinkedin = signal('');
  contactFormNotes = signal('');
  editingContactId = signal<string | null>(null);
  contactAutofillOpen = signal(false);

  contactAutofillFields: AutofillField[] = [
    { name: 'contactFormName', label: 'Name', type: 'text' },
    { name: 'contactFormEmail', label: 'Email', type: 'text' },
    { name: 'contactFormPhone', label: 'Phone', type: 'text' },
    { name: 'contactFormMobile', label: 'Mobile', type: 'text' },
    { name: 'contactFormFax', label: 'Fax', type: 'text' },
    { name: 'contactFormAddress', label: 'Address', type: 'text' },
    { name: 'contactFormCompany', label: 'Company', type: 'text' },
    { name: 'contactFormPosition', label: 'Position', type: 'text' },
    { name: 'contactFormLinkedin', label: 'LinkedIn URL', type: 'text' },
    { name: 'contactFormNotes', label: 'Notes', type: 'textarea' },
  ];

  openContactAutofill(): void {
    this.contactAutofillOpen.set(true);
  }

  applyContactAutofill(values: Record<string, any>): void {
    if (values['contactFormName'] !== undefined) this.contactFormName.set(String(values['contactFormName']));
    if (values['contactFormEmail'] !== undefined) this.contactFormEmail.set(String(values['contactFormEmail']));
    if (values['contactFormPhone'] !== undefined) this.contactFormPhone.set(String(values['contactFormPhone']));
    if (values['contactFormMobile'] !== undefined) this.contactFormMobile.set(String(values['contactFormMobile']));
    if (values['contactFormFax'] !== undefined) this.contactFormFax.set(String(values['contactFormFax']));
    if (values['contactFormAddress'] !== undefined) this.contactFormAddress.set(String(values['contactFormAddress']));
    if (values['contactFormCompany'] !== undefined) this.contactFormCompany.set(String(values['contactFormCompany']));
    if (values['contactFormPosition'] !== undefined) this.contactFormPosition.set(String(values['contactFormPosition']));
    if (values['contactFormLinkedin'] !== undefined) this.contactFormLinkedin.set(String(values['contactFormLinkedin']));
    if (values['contactFormNotes'] !== undefined) this.contactFormNotes.set(String(values['contactFormNotes']));
  }

  gmailConnected = signal(false);
  gmailEmail = signal('');

  // Compose aside
  asideTab = signal<'templates' | 'attachments'>('templates');
  templates = EMAIL_TEMPLATES;
  activeTemplate = signal<string | null>(null);
  attachments = signal<File[]>([]);

  // Documents picker inside the Attachments tab (CVs + their PDF versions).
  docCvs = signal<CvDocumentDto[]>([]);
  docLoading = signal(false);
  private docLoaded = false;

  // Contact modal
  showContactModal = signal(false);
  modalContactSearch = signal('');
  modalSelectedIds = signal<Set<string>>(new Set());
  /** Where the picker writes: compose recipients or schedule recipients. */
  pickerTarget = signal<'compose' | 'schedule'>('compose');

  // Schedule form
  showScheduleForm = signal(false);
  editingScheduleId = signal<string | null>(null);
  schedName = signal('');
  schedCron = signal('0 9 * * *');
  schedCustom = signal(false);
  schedSubject = signal('');
  schedBody = signal('');
  schedRecipients = signal<ContactDto[]>([]);
  schedSaving = signal(false);

  // Schedule detail sub-view
  selectedSchedule = signal<EmailScheduleDto | null>(null);
  scheduleRecipients = signal<ContactDto[]>([]);
  scheduleHistory = signal<ScheduleHistoryItem[]>([]);
  schedHistoryLoading = signal(false);
  scheduleRunning = signal(false);

  protected readonly CRON_PRESETS: { value: string; label: string }[] = [
    { value: '*/5 * * * *', label: 'Every 5 minutes' },
    { value: '0 * * * *', label: 'Hourly' },
    { value: '0 9 * * *', label: 'Daily at 09:00' },
    { value: '0 9 * * 1-5', label: 'Weekdays at 09:00' },
    { value: '0 9 * * 1', label: 'Weekly on Monday' },
  ];

  protected readonly TEMPLATE_CRON_PRESETS: { value: string; label: string }[] = [
    { value: '0 9 * * *', label: 'Daily at 09:00' },
    { value: '0 9 * * 1', label: 'Weekly on Monday' },
    { value: '0 9 * * 1/2', label: 'Every 2 weeks' },
    { value: '0 9 1 * *', label: 'Monthly (1st)' },
  ];

  cronPresetValue = computed(() => {
    const expr = this.schedCron().trim();
    return this.CRON_PRESETS.some(p => p.value === expr) ? expr : 'custom';
  });

  cronDescription = computed(() => {
    const preset = this.CRON_PRESETS.find(p => p.value === this.schedCron().trim());
    if (preset) return preset.label;
    const expr = this.schedCron().trim();
    return expr ? `Custom: ${expr}` : '';
  });

  // ── Reusable schedule templates ─────────────────────────────────────────────
  scheduleTemplates = signal<ScheduleTemplateDto[]>([]);
  templatesLoading = signal(false);
  showTemplateForm = signal(false);
  editingTemplateId = signal<string | null>(null);
  tplName = signal('');
  tplSubject = signal('');
  tplBody = signal('');
  tplCron = signal('0 9 * * *');
  tplCvVersionId = signal('');
  tplVarDefaultsJson = signal('{\n  \n}');
  tplAttachments = signal<ScheduleAttachmentRef[]>([]);
  tplDocPickerOpen = signal(false);

  applyTargetTemplate = signal<ScheduleTemplateDto | null>(null);
  applyCompanyName = signal('');
  applyCompanyDescription = signal('');
  applyRecipientEmail = signal('');
  applyRecipientName = signal('');
  applyContactNotes = signal('');
  applyingNow = signal(false);

  cvVersionOptions = computed(() => {
    const list: { id: string; label: string }[] = [];
    for (const cv of this.docCvs()) {
      for (const v of cv.versions) {
        list.push({ id: v.id, label: `${cv.title} — v${v.versionNumber}${v.label ? ' · ' + v.label : ''}` });
      }
    }
    return list;
  });

  async loadScheduleTemplates() {
    this.templatesLoading.set(true);
    try {
      const res = await this.service.getScheduleTemplates();
      if (res.success && res.data) this.scheduleTemplates.set(res.data);
    } catch {} finally { this.templatesLoading.set(false); }
  }

  openNewTemplate() {
    this.editingTemplateId.set(null);
    this.tplName.set('');
    this.tplSubject.set('Application for {{company_name}}');
    this.tplBody.set('Dear {{company_name}} hiring team,\n\nI am interested in the {{position}} role.\n\nBest regards,\n{{my_name}}');
    this.tplCron.set('0 9 * * *');
    this.tplCvVersionId.set('');
    this.tplVarDefaultsJson.set('{\n  \n}');
    this.tplAttachments.set([]);
    this.showTemplateForm.set(true);
    void this.ensureDocumentsLoaded();
  }

  openEditTemplate(t: ScheduleTemplateDto) {
    this.editingTemplateId.set(t.id);
    this.tplName.set(t.name);
    this.tplSubject.set(t.subjectTemplate);
    this.tplBody.set(t.bodyTemplate);
    this.tplCvVersionId.set(t.cvVersionId ?? '');
    this.tplVarDefaultsJson.set(JSON.stringify(t.variableDefaults ?? {}, null, 2));
    this.tplAttachments.set(t.attachments ?? []);
    this.showTemplateForm.set(true);
    void this.ensureDocumentsLoaded();
  }

  closeTemplateForm() { this.showTemplateForm.set(false); }

  async saveTemplate() {
    if (!this.tplName().trim() || !this.tplSubject().trim() || !this.tplBody().trim()) {
      this.toast.error('Name, subject and body are required');
      return;
    }
    let variableDefaults: Record<string, string> = {};
    const raw = this.tplVarDefaultsJson().trim();
    if (raw) {
      try { variableDefaults = JSON.parse(raw); }
      catch { this.toast.error('Variable defaults is not valid JSON'); return; }
    }
    const dto = {
      name: this.tplName().trim(),
      subjectTemplate: this.tplSubject(),
      bodyTemplate: this.tplBody(),
      cvVersionId: this.tplCvVersionId() || undefined,
      variableDefaults,
      attachments: this.tplAttachments().length ? this.tplAttachments() : undefined,
    };
    try {
      if (this.editingTemplateId()) {
        await this.service.updateScheduleTemplate(this.editingTemplateId()!, dto);
        this.toast.success('Template updated');
      } else {
        await this.service.createScheduleTemplate(dto);
        this.toast.success('Template created');
      }
      this.showTemplateForm.set(false);
      await this.loadScheduleTemplates();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Failed to save template');
    }
  }

  async onTplFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = Array.from(input.files);
    for (const f of files) {
      try {
        const ref = await this.service.uploadAttachment(f);
        if (ref.data) this.tplAttachments.update(list => [...list, ref.data!]);
      } catch {
        this.toast.error(`Failed to upload ${f.name}`);
      }
    }
    input.value = '';
  }

  removeTplAttachment(idx: number) {
    this.tplAttachments.update(list => list.filter((_, i) => i !== idx));
  }

  toggleTplDocPicker() {
    this.tplDocPickerOpen.update(o => !o);
    if (this.tplDocPickerOpen()) void this.ensureDocumentsLoaded();
  }

  /** Attach a Document's PDF version to the template as a MinIO attachment ref. */
  async attachDocToTemplate(cv: CvDocumentDto, v: CvVersionDto) {
    const name = `${cv.title} — ${this.docVersionLabel(v)}.pdf`;
    try {
      const blob = await this.docApi.getVersionFileBlob(v.id);
      const file = new File([blob], name, { type: blob.type || 'application/pdf' });
      const ref = await this.service.uploadAttachment(file);
      if (ref.data) {
        this.tplAttachments.update(list => [...list, ref.data!]);
        this.toast.success(`Attached "${name}"`);
      } else {
        this.toast.error(`Failed to attach "${name}"`);
      }
    } catch {
      this.toast.error(`Could not load "${name}" from Documents`);
    }
  }

  async deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await this.service.deleteScheduleTemplate(id);
      this.toast.success('Template deleted');
      await this.loadScheduleTemplates();
    } catch { this.toast.error('Failed to delete template'); }
  }

  startApply(t: ScheduleTemplateDto) {
    this.applyTargetTemplate.set(t);
    this.applyCompanyName.set('');
    this.applyCompanyDescription.set('');
    this.applyRecipientEmail.set('');
    this.applyRecipientName.set('');
    this.applyContactNotes.set('');
  }

  varDefaultsCount(t: ScheduleTemplateDto): number {
    return Object.keys(t.variableDefaults ?? {}).length;
  }

  cancelApply() { this.applyTargetTemplate.set(null); }

  async submitApply() {
    const t = this.applyTargetTemplate();
    if (!t) return;
    if (!this.applyCompanyName().trim()) { this.toast.error('Company name is required'); return; }
    this.applyingNow.set(true);
    try {
      const dto: ApplyTemplateDto = {
        templateId: t.id,
        companyName: this.applyCompanyName().trim(),
        companyDescription: this.applyCompanyDescription().trim() || undefined,
        recipientEmail: this.applyRecipientEmail().trim() || undefined,
        recipientName: this.applyRecipientName().trim() || undefined,
        contactNotes: this.applyContactNotes().trim() || undefined,
        cronExpression: this.tplCron().trim(),
        scheduleName: `Apply → ${this.applyCompanyName().trim()}`,
        createCompanyIfMissing: true,
      };
      const res = await this.service.applyTemplate(dto);
      if (res.success && res.data) {
        this.toast.success(`Created scheduled email for ${this.applyCompanyName()}`);
        this.applyTargetTemplate.set(null);
        this.loadSchedules();
      } else {
        this.toast.error(res.message || 'Failed to apply template');
      }
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Failed to apply template');
    } finally { this.applyingNow.set(false); }
  }

  sortedContacts = computed(() =>
    [...this.contacts()].sort((a, b) => a.name.localeCompare(b.name))
  );

  /** Compose autocomplete — results are fetched server-side (debounced) since the contact book can be large. */
  filteredContacts = computed(() => this.composeSuggestions());

  modalFilteredContacts = computed(() => {
    let list = this.sortedContacts();
    if (this.showFavoritesOnly()) list = list.filter(c => c.isFavorite);
    return list;
  });

  onComposeSearch(v: string) {
    this.composeRecipientSearch.set(v);
    const term = v.trim();
    if (this.composeContactTimer) clearTimeout(this.composeContactTimer);
    if (term.length < 2) { this.composeSuggestions.set([]); return; }
    this.composeContactTimer = setTimeout(async () => {
      try {
        const res = await this.contactApi.getContacts({ search: term, pageSize: 8 });
        this.composeSuggestions.set(res.success && res.data ? res.data.items : []);
      } catch { this.composeSuggestions.set([]); }
    }, 250);
  }

  onContactSearch(v: string) {
    this.contactSearch.set(v);
    if (this.contactSearchTimer) clearTimeout(this.contactSearchTimer);
    this.contactSearchTimer = setTimeout(() => this.loadContacts(true), 300);
  }

  onModalContactSearch(v: string) {
    this.modalContactSearch.set(v);
    if (this.modalContactTimer) clearTimeout(this.modalContactTimer);
    this.modalContactTimer = setTimeout(() => this.loadContacts(true, v.trim()), 300);
  }

  loadMoreContacts() { this.loadContacts(false); }

  loadMoreModalContacts() { this.loadContacts(false, this.modalContactSearch()); }

  async ngOnInit() {
    this.applyQueryParams();
    this.loading.set(true);
    try {
      const [statsRes] = await Promise.all([
        this.service.getStats(),
      ]);
      if (statsRes.success && statsRes.data) this.stats.set(statsRes.data);
    } catch { } finally { this.loading.set(false); }
    this.loadContacts();
    this.loadHistory();
    this.loadSchedules();
    this.loadScheduleTemplates();
    this.loadGmailStatus();
  }

  /** Deep-link support, e.g. /mailbox?tab=contacts&newContact=1&company=… from a company detail page. */
  private applyQueryParams() {
    const params = this.route.snapshot.queryParamMap;
    const tab = params.get('tab');
    if (tab === 'contacts' || tab === 'compose' || tab === 'history' || tab === 'schedules' || tab === 'templates' || tab === 'settings') {
      this.view.set(tab);
    }
    if (params.get('newContact') === '1') {
      this.showContactForm.set(true);
      this.editingContactId.set(null);
      this.contactFormName.set('');
      this.contactFormEmail.set('');
      this.contactFormPhone.set('');
      this.contactFormMobile.set('');
      this.contactFormFax.set('');
      this.contactFormAddress.set('');
      this.contactFormCompany.set(params.get('company') ?? '');
      this.contactFormPosition.set('');
    }
  }

  async loadGmailStatus() {
    try {
      const res = await this.service.getGmailStatus();
      this.gmailConnected.set(res.connected);
      if (res.email) this.gmailEmail.set(res.email);
    } catch {}
  }

  async disconnectGmail() {
    try {
      await this.service.disconnectGmail();
      this.gmailConnected.set(false);
      this.gmailEmail.set('');
    } catch {}
  }

  async loadContacts(reset = true, search?: string) {
    const term = search ?? this.contactSearch();
    const page = reset ? 1 : this.contactsPage() + 1;
    this.contactsLoading.set(true);
    try {
      const res = await this.contactApi.getContacts({
        search: term || undefined,
        favorite: this.showFavoritesOnly() || undefined,
        page,
        pageSize: this.CONTACTS_PAGE_SIZE,
      });
      if (res.success && res.data) {
        const items = res.data.items;
        const merged = reset ? items : [...this.contacts(), ...(items ?? [])];
        this.contacts.set(merged);
        this.contactsTotal.set(res.data.total);
        this.contactsPage.set(page);
        this.contactsHasMore.set(merged.length < res.data.total);
      }
    } catch {} finally { this.contactsLoading.set(false); this.refreshing.set(false); }
  }

  async loadHistory() {
    this.historyLoading.set(true);
    try {
      const res = await this.service.getHistory({
        page: this.historyPage(),
        pageSize: 20,
        search: this.historySearch() || undefined,
      });
      if (res.success && res.data) {
        this.history.set(res.data.items);
        this.historyTotal.set(res.data.total);
      }
    } catch {} finally { this.historyLoading.set(false); this.refreshing.set(false); }
  }

  async loadHistoryDetail(id: string) {
    this.selectedEmailLoading.set(true);
    try {
      const res = await this.service.getHistoryDetail(id);
      if (res.success && res.data) this.selectedEmail.set(res.data);
    } catch {} finally { this.selectedEmailLoading.set(false); }
  }

  selectEmail(email: EmailMessageDto) {
    this.selectedEmail.set(email);
  }

  backToHistoryList() {
    this.selectedEmail.set(null);
  }

  async loadContactHistory(contact: ContactDto) {
    this.contactDetailView.set(true);
    this.selectedContactDetail.set(contact);
    this.contactHistoryLoading.set(true);
    try {
      const res = await this.contactApi.getContactHistory(contact.id);
      if (res.success && res.data) {
        this.contactHistory.set(res.data.emails);
      }
    } catch {} finally { this.contactHistoryLoading.set(false); }
  }

  backToContactList() {
    this.contactDetailView.set(false);
    this.selectedContactDetail.set(null);
    this.contactHistory.set([]);
  }

  async toggleFavorite(contact: ContactDto) {
    const res = await this.contactApi.toggleFavorite(contact.id);
    if (res.success && res.data) {
      this.contacts.set(this.contacts().map(c => c.id === contact.id ? { ...c, isFavorite: res.data!.isFavorite } : c));
    }
  }

  startContactEdit(contact: ContactDto) {
    this.cdEditName.set(contact.name);
    this.cdEditEmail.set(contact.email);
    this.cdEditCompany.set(contact.company || '');
    this.cdEditPosition.set(contact.position || '');
    this.cdEditPhone.set(contact.phone || '');
    this.cdEditLinkedin.set(contact.linkedinUrl || '');
    this.cdEditNotes.set(contact.notes || '');
    this.cdEditing.set(true);
  }

  cancelContactEdit() {
    this.cdEditing.set(false);
  }

  async saveContactDetail() {
    const contact = this.selectedContactDetail();
    if (!contact) return;
    const dto: any = {
      name: this.cdEditName(),
      email: this.cdEditEmail(),
      company: this.cdEditCompany() || undefined,
      position: this.cdEditPosition() || undefined,
      phone: this.cdEditPhone() || undefined,
      linkedinUrl: this.cdEditLinkedin() || undefined,
      notes: this.cdEditNotes() || undefined,
    };
    const res = await this.contactApi.updateContact(contact.id, dto);
    if (res.success && res.data) {
      this.selectedContactDetail.set(res.data);
      this.cdEditing.set(false);
      this.contacts.set(this.contacts().map(c => c.id === contact.id ? res.data! : c));
    }
  }

  onContactAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const contact = this.selectedContactDetail();
      if (!contact) return;
      const res = await this.contactApi.updateContact(contact.id, { avatarBase64: base64 });
      if (res.success && res.data) {
        this.selectedContactDetail.set(res.data);
        this.contacts.set(this.contacts().map(c => c.id === contact.id ? res.data! : c));
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  async loadSchedules() {
    this.schedulesLoading.set(true);
    try {
      const res = await this.service.getSchedules();
      if (res.success && res.data) this.schedules.set(res.data);
    } catch {} finally { this.schedulesLoading.set(false); this.refreshing.set(false); }
  }

  async generateDraft() {
    const recips = this.composeRecipients();
    const company = recips[0]?.company || '';
    const name = recips.length === 1 ? recips[0].name : '';
    if (!company) {
      this.toast.error('Select a contact to draft to (so we know the company)');
      return;
    }
    this.composeAi.set(true);
    try {
      const res = await this.directAi.generateMessage({
        channel: 'email',
        companyName: company,
        recipientName: name,
        contactType: 'recruiter',
        considerations: this.draftHint().trim(),
        language: 'English',
      });
      const data = res?.data;
      if (!data) throw new Error('empty');
      if (data.subject) this.composeSubject.set(data.subject);
      if (data.message) this.composeBody.set(data.message);
      this.toast.success('AI draft ready — review before sending');
    } catch {
      this.toast.error('Could not generate a draft. Check the AI services are running.');
    } finally {
      this.composeAi.set(false);
    }
  }

  async sendEmail() {
    if (!this.composeRecipients().length || !this.composeSubject() || !this.composeBody()) return;
    this.composeSending.set(true);
    const recipients = this.composeRecipients();
    try {
      const files = this.attachments();
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      if (totalBytes > 10 * 1024 * 1024) {
        this.toast.error('Attachments exceed the 10 MB limit');
        return;
      }
      const attachmentPayloads: EmailAttachmentPayload[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        attachmentPayloads.push({ fileName: file.name, contentType: file.type || 'application/octet-stream', contentBase64: base64 });
      }

      const dto: SendEmailDto = {
        recipientIds: recipients.map(c => c.id),
        subject: this.composeSubject(),
        body: this.composeBody(),
        attachments: attachmentPayloads.length ? attachmentPayloads : undefined,
        applicationId: this.logAttempt() ? (this.attemptAppId() ?? undefined) : undefined,
      };
      const res = await this.service.send(dto);
      if (res.success) {
        const to = recipients.length === 1
          ? (recipients[0].name || recipients[0].email)
          : `${recipients.length} recipients`;
        const logged = res.data?.loggedAttempt;
        if (logged?.positionTitle && !logged.error) {
          this.toast.success(`Email sent to ${to} · logged on ${logged.positionTitle}${logged.companyName ? ` @ ${logged.companyName}` : ''}`);
        } else if (logged?.error) {
          this.toast.info(`Email sent to ${to}, but logging on the application failed`);
        } else {
          this.toast.success(`Email sent to ${to}`);
        }
        this.composeRecipients.set([]);
        this.composeSubject.set('');
        this.composeBody.set('');
        this.attemptCandidates.set([]);
        this.attemptAppId.set(null);
        this.logAttempt.set(true);
        this.loadHistory();
        this.loadStats();
      } else {
        this.toast.error(res.message || 'Failed to send email');
      }
    } catch {
      this.toast.error('Failed to send email — check your connection or Gmail status');
    } finally { this.composeSending.set(false); }
  }

  async loadStats() {
    try {
      const res = await this.service.getStats();
      if (res.success && res.data) this.stats.set(res.data);
    } catch {}
  }

  onRefresh() {
    this.refreshing.set(true);
    const v = this.view();
    if (v === 'contacts') this.loadContacts();
    else if (v === 'history') this.loadHistory();
    else if (v === 'schedules') this.loadSchedules();
    else if (v === 'templates') this.loadScheduleTemplates();
    else this.refreshing.set(false);
  }

  /** True for emails sent in the last few seconds — drives the green flash on the history row. */
  isJustSent(m: EmailMessageDto): boolean {
    if (m.status !== 'sent' || !m.sentAt) return false;
    return Date.now() - new Date(m.sentAt).getTime() < 10_000;
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes < 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async deleteContact(id: string) {
    await this.contactApi.deleteContact(id);
    this.loadContacts();
  }

  async toggleSchedule(id: string) {
    await this.service.toggleSchedule(id);
    this.loadSchedules();
  }

  async deleteSchedule(id: string) {
    await this.service.deleteSchedule(id);
    this.loadSchedules();
  }

  startNewContact() {
    this.showContactForm.set(true);
    this.editingContactId.set(null);
    this.contactFormName.set('');
    this.contactFormEmail.set('');
    this.contactFormPhone.set('');
    this.contactFormMobile.set('');
    this.contactFormFax.set('');
    this.contactFormAddress.set('');
    this.contactFormCompany.set('');
    this.contactFormPosition.set('');
    this.contactFormLinkedin.set('');
    this.contactFormNotes.set('');
  }

  editContact(c: ContactDto) {
    this.showContactForm.set(true);
    this.editingContactId.set(c.id);
    this.contactFormName.set(c.name);
    this.contactFormEmail.set(c.email);
    this.contactFormPhone.set(c.phone || '');
    this.contactFormMobile.set(c.mobile || '');
    this.contactFormFax.set(c.fax || '');
    this.contactFormAddress.set(c.address || '');
    this.contactFormCompany.set(c.company || '');
    this.contactFormPosition.set(c.position || '');
    this.contactFormLinkedin.set(c.linkedinUrl || '');
    this.contactFormNotes.set(c.notes || '');
  }

  async saveContact() {
    const dto = {
      name: this.contactFormName(),
      email: this.contactFormEmail(),
      phone: this.contactFormPhone() || undefined,
      mobile: this.contactFormMobile() || undefined,
      fax: this.contactFormFax() || undefined,
      address: this.contactFormAddress() || undefined,
      company: this.contactFormCompany() || undefined,
      position: this.contactFormPosition() || undefined,
      linkedinUrl: this.contactFormLinkedin() || undefined,
      notes: this.contactFormNotes() || undefined,
    };
    if (this.editingContactId()) {
      await this.contactApi.updateContact(this.editingContactId()!, dto);
    } else {
      await this.contactApi.createContact(dto);
    }
    this.showContactForm.set(false);
    this.loadContacts();
  }

  async importFromOffers() {
    await this.contactApi.importFromOffers();
    this.loadContacts();
  }

  toggleRecipient(c: ContactDto) {
    const curr = this.composeRecipients();
    const exists = curr.find(r => r.id === c.id);
    if (exists) {
      this.composeRecipients.set(curr.filter(r => r.id !== c.id));
    } else {
      this.composeRecipients.set([...curr, c]);
    }
    void this.refreshAttemptCandidates();
  }

  /** Distinct applications linked to any chosen recipient (cached per contact). */
  private async refreshAttemptCandidates() {
    const recipients = this.composeRecipients();
    if (recipients.length === 0) {
      this.attemptCandidates.set([]);
      this.attemptAppId.set(null);
      this.logAttempt.set(true);
      return;
    }

    const byId = new Map<string, ApplicationResponseDto>();
    for (const r of recipients) {
      let apps = this.candidateCache.get(r.id);
      if (!apps) {
        try {
          const res = await this.contactApi.getApplicationsForContact(r.id);
          apps = res.data ?? [];
        } catch {
          apps = [];
        }
        this.candidateCache.set(r.id, apps);
      }
      for (const app of apps) byId.set(app.id, app);
    }

    const candidates = [...byId.values()];
    this.attemptCandidates.set(candidates);

    // Keep the current pick if still valid; otherwise preselect the first candidate.
    const current = this.attemptAppId();
    if (!candidates.some(a => a.id === current)) {
      this.attemptAppId.set(candidates[0]?.id ?? null);
      this.logAttempt.set(true);
    }
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
  }

  humanizeCron(expr: string): string {
    const preset = this.CRON_PRESETS.find(p => p.value === expr.trim());
    return preset ? preset.label : 'Custom cadence';
  }

  isRecipientSelected(c: ContactDto): boolean {
    return this.composeRecipients().some(r => r.id === c.id);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDateTime(d: string): string {
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  relativeTime(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    return this.formatDate(d);
  }

  applyTemplate(t: EmailTemplate) {
    this.composeSubject.set(t.subject);
    this.composeBody.set(t.body);
    this.activeTemplate.set(t.name);
  }

  selectAsideTab(tab: 'templates' | 'attachments') {
    this.asideTab.set(tab);
    if (tab === 'attachments') void this.ensureDocumentsLoaded();
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = Array.from(input.files);
    this.attachments.set([...this.attachments(), ...files]);
    input.value = '';
  }

  removeAttachment(file: File) {
    this.attachments.set(this.attachments().filter(f => f !== file));
  }

  /** Lazy-load Documents on first open of the Attachments tab. */
  async ensureDocumentsLoaded() {
    if (this.docLoaded || this.docLoading()) return;
    this.docLoading.set(true);
    try {
      const res = await this.docApi.listCvs();
      if (res.success && res.data) {
        this.docCvs.set(res.data.filter(cv => cv.versions.some(v => v.pdfUrl || v.fileUrl)));
        this.docLoaded = true;
      }
    } catch {
    } finally {
      this.docLoading.set(false);
    }
  }

  docVersionLabel(v: CvVersionDto): string {
    const base = `v${v.versionNumber}`;
    return v.label ? `${base} · ${v.label}` : base;
  }

  /** Fetch the document's bytes through the app's authenticated endpoint and attach it to the mail. */
  async attachDocVersion(cv: CvDocumentDto, v: CvVersionDto) {
    const name = `${cv.title} — ${this.docVersionLabel(v)}.pdf`;
    try {
      const blob = await this.docApi.getVersionFileBlob(v.id);
      const size = blob.size;
      const duplicate = this.attachments().some(a => a.name === name && a.size === size);
      if (duplicate) {
        this.toast.info(`"${name}" is already attached`);
        return;
      }
      const file = new File([blob], name, { type: blob.type || 'application/pdf' });
      this.attachments.set([...this.attachments(), file]);
      this.toast.success(`Attached "${name}" (${this.formatBytes(size)})`);
    } catch {
      this.toast.error(`Could not load "${name}" from Documents`);
    }
  }

  openContactModal(target: 'compose' | 'schedule' = 'compose') {
    this.pickerTarget.set(target);
    const current = target === 'compose' ? this.composeRecipients() : this.schedRecipients();
    this.modalSelectedIds.set(new Set(current.map(c => c.id)));
    this.modalContactSearch.set('');
    this.showContactModal.set(true);
    this.loadContacts(true, '');
  }

  closeContactModal() {
    this.showContactModal.set(false);
    // The modal's server-side search filled `contacts()`; reset to the list's own filters.
    this.loadContacts(true);
  }

  toggleModalContact(c: ContactDto) {
    const set = new Set(this.modalSelectedIds());
    if (set.has(c.id)) set.delete(c.id); else set.add(c.id);
    this.modalSelectedIds.set(set);
  }

  onAddSelected() {
    const ids = this.modalSelectedIds();
    const selected = this.contacts().filter(c => ids.has(c.id));
    if (this.pickerTarget() === 'compose') {
      this.composeRecipients.set(selected);
      void this.refreshAttemptCandidates();
    } else {
      this.schedRecipients.set(selected);
    }
    this.showContactModal.set(false);
  }

  // ── Schedule form ──────────────────────────────────────────────────────────
  openNewSchedule() {
    this.editingScheduleId.set(null);
    this.schedName.set('');
    this.schedCron.set('0 9 * * *');
    this.schedCustom.set(false);
    this.schedSubject.set('');
    this.schedBody.set('');
    this.schedRecipients.set([]);
    this.showScheduleForm.set(true);
  }

  onCadenceChange(v: string) {
    if (v === 'custom') {
      this.schedCustom.set(true);
      return;
    }
    this.schedCron.set(v);
    this.schedCustom.set(false);
  }

  /** Resolve contact ids to ContactDtos using the loaded list, fetching any missing ones. */
  private async resolveContacts(ids: string[]): Promise<ContactDto[]> {
    const known = new Map(this.contacts().map(c => [c.id, c]));
    const resolved: ContactDto[] = [];
    for (const id of ids) {
      const local = known.get(id);
      if (local) { resolved.push(local); continue; }
      try {
        const res = await this.contactApi.getContact(id);
        if (res.data) resolved.push(res.data);
      } catch { /* skip unknown */ }
    }
    return resolved;
  }

  async openEditSchedule(s: EmailScheduleDto) {
    this.editingScheduleId.set(s.id);
    this.schedName.set(s.name);
    this.schedCron.set(s.cronExpression);
    this.schedCustom.set(!this.CRON_PRESETS.some(p => p.value === s.cronExpression));
    this.schedSubject.set(s.subject);
    this.schedBody.set(s.body);
    this.schedRecipients.set(await this.resolveContacts(s.recipientIds));
    this.showScheduleForm.set(true);
  }

  closeScheduleForm() {
    this.showScheduleForm.set(false);
  }

  removeSchedRecipient(c: ContactDto) {
    this.schedRecipients.set(this.schedRecipients().filter(r => r.id !== c.id));
  }

  schedFormValid = computed(() =>
    this.schedName().trim().length > 0 &&
    this.schedCron().trim().length > 0 &&
    this.schedSubject().trim().length > 0 &&
    this.schedBody().trim().length > 0 &&
    this.schedRecipients().length > 0);

  async saveSchedule() {
    if (!this.schedFormValid()) return;
    this.schedSaving.set(true);
    try {
      const dto = {
        name: this.schedName().trim(),
        cronExpression: this.schedCron().trim(),
        subject: this.schedSubject(),
        body: this.schedBody(),
        recipientIds: this.schedRecipients().map(c => c.id),
      };
      const id = this.editingScheduleId();
      if (id) {
        await this.service.updateSchedule(id, dto);
        this.toast.success('Schedule updated');
      } else {
        await this.service.createSchedule(dto);
        this.toast.success('Schedule created');
      }
      this.showScheduleForm.set(false);
      await this.loadSchedules();
      // Keep the detail view in sync when the edited schedule is open.
      const selected = this.selectedSchedule();
      if (selected) await this.refreshSelectedSchedule();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Failed to save schedule');
    } finally {
      this.schedSaving.set(false);
    }
  }

  // ── Schedule detail ────────────────────────────────────────────────────────
  async openScheduleDetail(s: EmailScheduleDto) {
    this.selectedSchedule.set(s);
    void this.loadScheduleDetailData(s.id, s.recipientIds);
  }

  backToSchedules() {
    this.selectedSchedule.set(null);
    this.scheduleHistory.set([]);
    this.scheduleRecipients.set([]);
  }

  private async loadScheduleDetailData(id: string, recipientIds: string[]) {
    this.schedHistoryLoading.set(true);
    try {
      const [scheduleRes, historyRes, recipients] = await Promise.all([
        this.service.getSchedule(id),
        this.service.getScheduleHistory(id),
        this.resolveContacts(recipientIds),
      ]);
      if (this.selectedSchedule()?.id !== id) return; // user navigated away
      if (scheduleRes.data) this.selectedSchedule.set(scheduleRes.data);
      this.scheduleHistory.set(historyRes.data?.items ?? []);
      this.scheduleRecipients.set(recipients);
    } catch {
      this.toast.error('Failed to load schedule details');
    } finally {
      this.schedHistoryLoading.set(false);
    }
  }

  private async refreshSelectedSchedule() {
    const selected = this.selectedSchedule();
    if (!selected) return;
    try {
      const res = await this.service.getSchedule(selected.id);
      if (res.data) this.selectedSchedule.set(res.data);
      const hist = await this.service.getScheduleHistory(selected.id);
      this.scheduleHistory.set(hist.data?.items ?? []);
    } catch { /* keep current data */ }
  }

  async runScheduleNow() {
    const s = this.selectedSchedule();
    if (!s || this.scheduleRunning()) return;
    this.scheduleRunning.set(true);
    try {
      const res = await this.service.runScheduleNow(s.id);
      if (res.success && res.data) {
        const { sent, failed } = res.data;
        if (failed > 0) {
          this.toast.info(`Fired "${s.name}": ${sent} sent, ${failed} failed`);
        } else {
          this.toast.success(`Fired "${s.name}": ${sent} sent`);
        }
        await this.refreshSelectedSchedule();
      } else {
        this.toast.error(res.message || 'Failed to run schedule');
      }
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Failed to run schedule');
    } finally {
      this.scheduleRunning.set(false);
    }
  }

  async toggleFromDetail() {
    const s = this.selectedSchedule();
    if (!s) return;
    try {
      const res = await this.service.toggleSchedule(s.id);
      if (res.data) this.selectedSchedule.set(res.data);
      this.loadSchedules();
    } catch {
      this.toast.error('Failed to update schedule');
    }
  }

  async deleteFromDetail() {
    const s = this.selectedSchedule();
    if (!s || !confirm(`Delete schedule "${s.name}"?`)) return;
    try {
      await this.service.deleteSchedule(s.id);
      this.toast.success('Schedule deleted');
      this.backToSchedules();
      this.loadSchedules();
    } catch {
      this.toast.error('Failed to delete schedule');
    }
  }

  formatRelative(iso?: string | null): string {
    if (!iso) return '—';
    const diffMs = new Date(iso).getTime() - Date.now();
    const future = diffMs > 0;
    const mins = Math.round(Math.abs(diffMs) / 60000);
    let label: string;
    if (mins < 1) label = 'less than a minute';
    else if (mins < 60) label = `${mins} min`;
    else if (mins < 60 * 24) label = `${Math.round(mins / 60)} h`;
    else label = `${Math.round(mins / (60 * 24))} d`;
    return future ? `in ${label}` : `${label} ago`;
  }
}
