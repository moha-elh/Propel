import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { ContactService } from '@app/services/contact.service';
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
  PRIORITY_COLORS,
  ATTEMPT_CHANNEL_LABELS,
  ATTEMPT_STATUS_LABELS,
} from '@app/models/application.model';
import { ContactDto, EmailMessageDto } from '@app/models/mailbox.model';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';

type AttemptForm = {
  channel: AttemptChannel;
  initiatedBy: AttemptInitiatedBy;
  subject: string;
  body: string;
  recipientName: string;
  recipientContact: string;
};

@Component({
  selector: 'app-application-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink, RefreshButtonComponent],
  templateUrl: './application-detail.component.html',
  styleUrl: './application-detail.component.scss',
})
export class ApplicationDetailComponent implements OnInit {
  private appService = inject(ApplicationService);
  private contactApi = inject(ContactService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  application = signal<ApplicationResponseDto | null>(null);
  attempts = signal<AttemptResponseDto[]>([]);
  loading = signal(true);
  refreshing = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  showStatusModal = signal(false);
  showEditModal = signal(false);
  showAttemptModal = signal(false);

  newStatus = signal<ApplicationStatus>('APPLIED');
  statusComment = signal('');
  editCompanyName = signal('');
  editPositionTitle = signal('');
  editOfferSource = signal('');
  editNotes = signal('');
  editInternshipType = signal('');
  editPriority = signal<ApplicationPriority>('MEDIUM');

  attemptForm = signal<AttemptForm>({
    channel: 'EMAIL_GMAIL',
    initiatedBy: 'USER',
    subject: '',
    body: '',
    recipientName: '',
    recipientContact: '',
  });
  attemptError = signal<string | null>(null);

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

  availableStatuses = computed(() => NEXT_STATUSES[this.application()?.status || 'SAVED'] || []);
  sortedAttempts = computed(() =>
    [...this.attempts()].sort((a, b) => b.attemptNumber - a.attemptNumber)
  );

  protected readonly STATUS_LABELS = STATUS_LABELS;
  protected readonly PRIORITY_LABELS = PRIORITY_LABELS;
  protected readonly PRIORITY_ORDER = PRIORITY_ORDER;
  protected readonly CHANNEL_LABELS = ATTEMPT_CHANNEL_LABELS;
  protected readonly ATTEMPT_STATUS_LABELS = ATTEMPT_STATUS_LABELS;
  protected readonly ALL_CHANNELS: AttemptChannel[] =
    Object.keys(ATTEMPT_CHANNEL_LABELS) as AttemptChannel[];
  protected readonly INITIATORS: AttemptInitiatedBy[] = ['USER', 'AI_AGENT', 'SCHEDULE'];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadApplication(id);
  }

  async loadApplication(id: string) {
    this.loading.set(true);
    try {
      const res = await this.appService.getById(id);
      if (res.success && res.data) {
        this.application.set(res.data);
        this.resetEditForm(res.data);
      } else {
        this.error.set(res.message || 'Failed to load');
      }
      const attRes = await this.appService.getAttempts(id);
      if (attRes.success && attRes.data) this.attempts.set(attRes.data);
    } catch { this.error.set('Failed to load'); }
    finally { this.loading.set(false); this.refreshing.set(false); }
  }

  onRefresh() {
    this.refreshing.set(true);
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadApplication(id);
  }

  resetEditForm(app: ApplicationResponseDto) {
    this.editCompanyName.set(app.companyName);
    this.editPositionTitle.set(app.positionTitle);
    this.editOfferSource.set(app.offerSource || '');
    this.editNotes.set(app.notes || '');
    this.editInternshipType.set(app.internshipType || '');
    this.editPriority.set(app.priority || 'MEDIUM');
  }

  openStatusModal() {
    this.newStatus.set(this.availableStatuses()[0] || 'APPLIED');
    this.statusComment.set('');
    this.showStatusModal.set(true);
  }
  closeStatusModal() { this.showStatusModal.set(false); }
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
    });
    this.attemptError.set(null);
    this.showAttemptModal.set(true);
    // Load company-matching suggestions for quick recipient selection.
    if (app) {
      this.appService.getSuggestedContacts(app.id)
        .then(res => { if (res.success && res.data) this.suggestedContacts.set(res.data); })
        .catch(() => { });
    }
  }
  closeAttemptModal() {
    this.showAttemptModal.set(false);
    this.resetPicker();
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

  pickContact(c: ContactSummaryDto) {
    this.selectedContactId.set(c.id);
    this.attemptForm.update(f => ({
      ...f,
      recipientName: f.recipientName.trim() || c.name,
      recipientContact: c.email,
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
    this.panelOpen.set(true);
    this.panelLoading.set(true);
    this.panelContact.set(null);
    this.panelEmails.set([]);
    this.panelApplications.set([]);
    try {
      const [histRes, appsRes] = await Promise.all([
        this.contactApi.getContactHistory(attempt.contactId),
        this.appService.getApplicationsForContact(attempt.contactId).catch(() => null),
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
    this.saving.set(true);
    this.attemptError.set(null);
    try {
      const res = await this.appService.createAttempt(app.id, {
        channel: f.channel,
        initiatedBy: f.initiatedBy,
        status: markSent ? 'SENT' : 'DRAFT',
        subject: f.subject.trim() || undefined,
        body: f.body.trim() || undefined,
        recipientName: f.recipientName.trim() || undefined,
        recipientContact: f.recipientContact.trim() || undefined,
        contactId: this.selectedContactId() ?? undefined,
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

  async updateStatus() {
    const app = this.application();
    if (!app) return;
    this.saving.set(true);
    try {
      const res = await this.appService.updateStatus(app.id, { status: this.newStatus(), comment: this.statusComment() || undefined });
      if (res.success && res.data) this.application.set(res.data);
      this.closeStatusModal();
    } catch { } finally { this.saving.set(false); }
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
      });
      if (res.success && res.data) this.application.set(res.data);
      this.closeEditModal();
    } catch { } finally { this.saving.set(false); }
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

  priorityColor(p?: string): string {
    return PRIORITY_COLORS[p as ApplicationPriority] ?? PRIORITY_COLORS.MEDIUM;
  }
}
