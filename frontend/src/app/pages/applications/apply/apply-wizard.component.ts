import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ExtractionService } from '@app/services/extraction.service';
import { ApplyService } from '@app/services/apply.service';
import { MailboxService } from '@app/services/mailbox.service';
import { ContactService } from '@app/services/contact.service';
import { ToastService } from '@app/services/toast.service';
import { DocumentsService } from '@app/services/documents.service';
import { AuthService } from '@app/services/auth.service';
import { CreateContactDto } from '@app/models/mailbox.model';
import { CronBuilderComponent } from '@app/shared/components/cron-builder/cron-builder.component';
import { ExtractorOutput, ExtractionHistoryItem } from '@app/models/extraction.types';
import {
  ScheduleTemplateDto,
  ApplyEmailResult,
  ApplyPrepFormRequest,
  ApplyPrepMessageRequest,
  FormResponseItem,
} from '@app/models/apply.model';
import { CvDocumentDto, CvVersionDto } from '@app/models/document.model';
import { EmailAttachmentPayload } from '@app/models/apply.model';

interface CvOption {
  id: string;
  label: string;
}

const CUSTOM_CRON = '__custom__';
const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Daily at 9:00', cron: '0 9 * * *' },
  { label: 'Weekly (Monday 9:00)', cron: '0 9 * * 1' },
  { label: 'Every 2 weeks (Monday 9:00)', cron: '0 9 * * 1/2' },
  { label: 'Monthly (1st 9:00)', cron: '0 9 1 * *' },
  { label: 'Custom…', cron: CUSTOM_CRON },
];

@Component({
  selector: 'app-apply-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink, CronBuilderComponent],
  templateUrl: './apply-wizard.component.html',
  styleUrl: './apply-wizard.component.scss',
})
export class ApplyWizardComponent implements OnInit {
  private extractionSvc = inject(ExtractionService);
  private applySvc = inject(ApplyService);
  private mailboxSvc = inject(MailboxService);
  private contactSvc = inject(ContactService);
  private docsSvc = inject(DocumentsService);
  private authSvc = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  step = signal<1 | 2 | 3 | 4>(1);
  cronPresets = CRON_PRESETS;

  // Step 1
  inputText = '';
  inputUrl = '';
  language = 'en';
  history = signal<ExtractionHistoryItem[]>([]);
  extracting = signal(false);

  // Steps 2-3 shared
  extraction = signal<ExtractorOutput | null>(null);
  extractionId = signal<string | null>(null);
  savedToLibrary = signal(false);

  companyName = '';
  positionTitle = '';
  companyDescription = '';
  recipientEmail = '';
  recipientName = '';
  contactNotes = '';

  // Step 3 compose
  subject = '';
  body = '';
  templates = signal<ScheduleTemplateDto[]>([]);
  selectedTemplateId = signal<string>('');
  cvOptions = signal<CvOption[]>([]);
  selectedCvVersionId = signal<string>('');
  attachmentFiles = signal<File[]>([]);

  // "From Documents" picker
  docCvs = signal<CvDocumentDto[]>([]);
  docPickerOpen = signal(false);
  private docsLoaded = false;

  // Step 4 deliver
  deliverMode = signal<'now' | 'schedule'>('now');
  cronExpression = signal<string>(CRON_PRESETS[1].cron);
  customCron = signal<string>('');

  // Apply Prep (form answers + direct message) — alternative to email delivery
  prepMode = signal<'email' | 'form' | 'message'>('email');
  formFields = signal<string>('');
  generatingForm = signal(false);
  formResponses = signal<FormResponseItem[]>([]);
  formError = signal<string>('');
  messageChannel = signal<string>('LinkedIn');
  messageConsiderations = signal<string>('');
  generatingMessage = signal(false);
  generatedMessage = signal<string>('');
  messageError = signal<string>('');
  saveTracked = signal<boolean>(true);
  prepApplicationId = signal<string | null>(null);

  savingContact = signal(false);
  contactSaved = signal(false);

  submitting = signal(false);
  error = signal<string>('');
  result = signal<ApplyEmailResult | null>(null);
  gmailConnected = signal(false);
  gmailEmail = signal('');

  async ngOnInit() {
    this.history.set(await this.extractionSvc.getHistory('job-extractor').catch(() => []));
    this.templates.set((await this.mailboxSvc.getScheduleTemplates().catch(() => ({ success: true, data: [] }) as any)).data ?? []);
    const cvs = (await this.docsSvc.listCvs().catch(() => ({ success: true, data: [] }) as any)).data ?? [];
    const opts: CvOption[] = [];
    for (const cv of cvs as CvDocumentDto[]) {
      for (const v of cv.versions) opts.push({ id: v.id, label: `${cv.title} — ${v.label}` });
    }
    this.cvOptions.set(opts);
    try {
      const gmail = await this.mailboxSvc.getGmailStatus();
      this.gmailConnected.set(gmail.connected);
      if (gmail.email) this.gmailEmail.set(gmail.email);
    } catch { /* gmail status optional */ }
    await this.applyQueryParams();
  }

  private async applyQueryParams() {
    const q = this.route.snapshot.queryParamMap;
    const extractionId = q.get('extractionId');
    const companyName = q.get('companyName');
    const positionTitle = q.get('positionTitle');
    if (extractionId) {
      try {
        const output = await this.extractionSvc.getExtraction(extractionId);
        this.extractionId.set(extractionId);
        this.applyExtraction(output, extractionId);
        this.step.set(2);
        return;
      } catch { /* fall through to prefill */ }
    }
    if (companyName) {
      this.companyName = companyName;
      if (positionTitle) this.positionTitle = positionTitle;
      this.prefillCompose();
    }
  }

  async extract() {
    if (!this.inputText.trim() && !this.inputUrl.trim()) {
      this.error.set('Paste a job post or provide a URL first.');
      return;
    }
    this.error.set('');
    this.extracting.set(true);
    try {
      const res = await this.extractionSvc.extract({
        text: this.inputText.trim() || undefined,
        url: this.inputUrl.trim() || undefined,
        language: this.language,
      });
      this.extractionId.set(res.id);
      this.applyExtraction(res.output, res.id);
      this.step.set(2);
    } catch (e: any) {
      this.error.set(e?.message || 'Extraction failed');
    } finally {
      this.extracting.set(false);
    }
  }

  async selectHistory(id: string) {
    this.error.set('');
    try {
      const output = await this.extractionSvc.getExtraction(id);
      const item = this.history().find(h => h.id === id);
      this.extractionId.set(id);
      this.applyExtraction(output, id);
      this.step.set(2);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load extraction');
    }
  }

  private applyExtraction(output: ExtractorOutput, id: string) {
    this.extraction.set(output);
    this.companyName = output.enterpriseName || this.companyName;
    this.positionTitle = output.jobRole || this.positionTitle;
    this.companyDescription = output.enterpriseDescription || '';
    this.recipientEmail = output.contactEmail || this.recipientEmail;
    this.prefillCompose();
  }

  private prefillCompose() {
    const company = this.companyName || '{{company_name}}';
    const role = this.positionTitle || '{{position}}';
    this.subject = `Application for the ${role} position at ${company}`;
    this.body =
      `Dear ${company} hiring team,\n\n` +
      `I am writing to express my interest in the ${role} role at ${company}. ` +
      `Please find my CV attached. I would be glad to discuss how my background fits your needs.\n\n` +
      `Best regards,\n{{my_name}}`;
  }

  useTemplate() {
    const tpl = this.templates().find(t => t.id === this.selectedTemplateId());
    if (!tpl) return;
    const rendered = this.renderTemplate(tpl.subjectTemplate, tpl.bodyTemplate);
    this.subject = rendered.subject;
    this.body = rendered.body;
    if (tpl.cvVersionId) this.selectedCvVersionId.set(tpl.cvVersionId);
  }

  /** Client-side best-effort token resolution (mirrors backend TemplateVariableResolver). */
  private resolveVars(text: string): string {
    const user = this.authSvc.currentUser();
    const myName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
    const map: Record<string, string> = {
      '{{company_name}}': this.companyName,
      '{{company_description}}': this.companyDescription,
      '{{my_name}}': myName,
      '{{my_email}}': user?.email ?? '',
      '{{my_phone}}': '',
    };
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g,
      (m, k) => map[m.toLowerCase()] ?? map[m] ?? map[`{{${k}}}`] ?? m);
  }

  private renderTemplate(subjectTpl: string, bodyTpl: string) {
    return { subject: this.resolveVars(subjectTpl), body: this.resolveVars(bodyTpl) };
  }

  /** Live preview of what the email will actually contain (variables resolved). */
  previewSubject(): string { return this.resolveVars(this.subject); }
  previewBody(): string { return this.resolveVars(this.body); }

  /** Exact list of files that will be attached, so nothing is a surprise at send time. */
  attachmentPreview(): string[] {
    const list: string[] = [];
    if (this.selectedCvVersionId()) {
      const opt = this.cvOptions().find(o => o.id === this.selectedCvVersionId());
      list.push(`CV — ${opt?.label ?? 'selected version'} (attached automatically)`);
    }
    for (const f of this.attachmentFiles()) list.push(f.name);
    return list;
  }

  async saveToLibrary() {
    const id = this.extractionId();
    if (!id) return;
    try {
      const res = await this.extractionSvc.saveToLibrary(id);
      this.savedToLibrary.set(true);
      this.error.set('');
      alert(`Saved to library: ${res.companyName}`);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to save to library');
    }
  }

  isCustomCron(): boolean {
    return this.cronExpression() === CUSTOM_CRON;
  }

  /** Save the recipient as a contact in the mailbox, so it can be reused later. */
  async saveContact() {
    const email = this.recipientEmail.trim();
    if (!email) {
      this.toast.error('No recipient email to save');
      return;
    }
    if (this.contactSaved()) return;
    this.savingContact.set(true);
    try {
      const dto: CreateContactDto = {
        name: this.recipientName.trim() || this.extraction()?.enterpriseName || email,
        email,
        company: this.companyName.trim() || undefined,
        notes: this.contactNotes.trim() || undefined,
      };
      const res = await this.contactSvc.createContact(dto);
      if (res.success) {
        this.contactSaved.set(true);
        this.toast.success('Contact saved');
      } else {
        this.toast.error(res.message || 'Failed to save contact');
      }
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to save contact');
    } finally {
      this.savingContact.set(false);
    }
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.attachmentFiles.set([...this.attachmentFiles(), ...Array.from(input.files)]);
  }

  removeAttachment(i: number) {
    this.attachmentFiles.update(list => list.filter((_, idx) => idx !== i));
  }

  private async ensureDocs() {
    if (this.docsLoaded) return;
    try {
      const res = await this.docsSvc.listCvs();
      if (res.success && res.data) {
        this.docCvs.set(res.data.filter(cv => cv.versions.some(v => v.pdfUrl || v.fileUrl)));
        this.docsLoaded = true;
      }
    } catch { /* documents optional */ }
  }

  toggleDocPicker() {
    this.docPickerOpen.update(o => !o);
    if (this.docPickerOpen()) void this.ensureDocs();
  }

  docVersionLabel(v: CvVersionDto): string {
    const base = `v${v.versionNumber}`;
    return v.label ? `${base} · ${v.label}` : base;
  }

  async attachDocToApply(cv: CvDocumentDto, v: CvVersionDto) {
    const name = `${cv.title} — ${this.docVersionLabel(v)}.pdf`;
    try {
      const blob = await this.docsSvc.getVersionFileBlob(v.id);
      const file = new File([blob], name, { type: blob.type || 'application/pdf' });
      this.attachmentFiles.update(list => [...list, file]);
    } catch {
      this.toast.error(`Could not load "${name}" from Documents`);
    }
  }

  async submit() {
    if (!this.companyName.trim()) { this.error.set('Company name is required'); return; }
    if (!this.recipientEmail.trim()) { this.error.set('Recipient email is required'); return; }
    if (!this.subject.trim() || !this.body.trim()) { this.error.set('Subject and body are required'); return; }

    if (this.deliverMode() === 'now' && !this.gmailConnected()) {
      this.error.set('Gmail is not connected. Connect Gmail in Mailbox → Settings, or choose Schedule instead.');
      this.toast.error('Gmail not connected');
      return;
    }

    if (this.deliverMode() === 'schedule' && this.isCustomCron() && !this.customCron().trim()) {
      this.error.set('Enter a custom cron expression, or pick a preset.');
      return;
    }

    this.error.set('');
    this.submitting.set(true);
    try {
      const attachments: EmailAttachmentPayload[] = [];
      for (const f of this.attachmentFiles()) {
        const base64 = await this.fileToBase64(f);
        attachments.push({ fileName: f.name, contentType: f.type || 'application/octet-stream', contentBase64: base64 });
      }

      const res = await this.applySvc.apply({
        companyName: this.companyName.trim(),
        positionTitle: this.positionTitle.trim(),
        companyDescription: this.companyDescription || undefined,
        recipientEmail: this.recipientEmail.trim(),
        recipientName: this.recipientName.trim() || undefined,
        contactNotes: this.contactNotes.trim() || undefined,
        subject: this.subject.trim(),
        body: this.body,
        cvVersionId: this.selectedCvVersionId() || undefined,
        attachments: attachments.length ? attachments : undefined,
        scheduleCron: this.deliverMode() === 'schedule'
          ? (this.isCustomCron() ? this.customCron().trim() : this.cronExpression())
          : undefined,
        scheduleName: this.deliverMode() === 'schedule' ? `Apply → ${this.companyName.trim()}` : undefined,
        allowDuplicate: false,
      });

      if (!res.success || !res.data) {
        // Surface duplicate matches if present
        const payload = (res as any).errors;
        if (payload && payload.matches) {
          this.error.set(`This company already has ${payload.matches.length} application(s). Open the existing one or allow duplicate.`);
        } else {
          this.error.set(res.message || 'Apply failed');
        }
        return;
      }
      this.result.set(res.data);
      this.step.set(4);
    } catch (e: any) {
      this.error.set(e?.message || 'Apply failed');
    } finally {
      this.submitting.set(false);
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  goApplications() { this.router.navigate(['/applications/kanban']); }
  goDetail(id: string) { this.router.navigate(['/applications', id]); }

  // ── Apply Prep: generate content without sending ──────────────────────────────
  private jobContext() {
    const ext = this.extraction();
    return {
      jobDescription: (this.inputText.trim() || ext?.rawDescription || ext?.enterpriseDescription || ''),
      jobRole: this.positionTitle,
      requiredSkills: ext?.requiredSkills ?? [],
      responsibilities: ext?.responsibilities ?? [],
    };
  }

  private parseFields(): string[] {
    return this.formFields().split('\n').map(s => s.trim()).filter(Boolean);
  }

  async generateForm() {
    const fields = this.parseFields();
    if (!this.companyName.trim()) { this.formError.set('Company name is required'); return; }
    if (!fields.length) { this.formError.set('Paste at least one form field/question (one per line).'); return; }
    this.formError.set('');
    this.formResponses.set([]);
    this.prepApplicationId.set(null);
    this.generatingForm.set(true);
    const ctx = this.jobContext();
    try {
      const res = await this.applySvc.generateFormResponses({
        companyName: this.companyName.trim(),
        positionTitle: this.positionTitle.trim(),
        companyDescription: this.companyDescription || undefined,
        jobDescription: ctx.jobDescription || undefined,
        requiredSkills: ctx.requiredSkills,
        responsibilities: ctx.responsibilities,
        language: this.language === 'en' ? 'English' : this.language,
        fields,
        saveTracked: this.saveTracked(),
        recipientName: this.recipientName.trim() || undefined,
        recipientEmail: this.recipientEmail.trim() || undefined,
        contactNotes: this.contactNotes.trim() || undefined,
        cvVersionId: this.selectedCvVersionId() || undefined,
      });
      if (res.success && res.data) {
        this.formResponses.set(res.data.responses ?? []);
        this.prepApplicationId.set(res.data.applicationId ?? null);
      } else {
        this.formError.set(res.message || 'Failed to generate answers');
      }
    } catch (e: any) {
      this.formError.set(e?.message || 'Failed to generate answers');
    } finally {
      this.generatingForm.set(false);
    }
  }

  async generateMessage() {
    if (!this.companyName.trim()) { this.messageError.set('Company name is required'); return; }
    this.messageError.set('');
    this.generatedMessage.set('');
    this.prepApplicationId.set(null);
    this.generatingMessage.set(true);
    const ctx = this.jobContext();
    try {
      const res = await this.applySvc.generateMessage({
        companyName: this.companyName.trim(),
        positionTitle: this.positionTitle.trim(),
        companyDescription: this.companyDescription || undefined,
        jobDescription: ctx.jobDescription || undefined,
        requiredSkills: ctx.requiredSkills,
        responsibilities: ctx.responsibilities,
        language: this.language === 'en' ? 'English' : this.language,
        channel: this.messageChannel(),
        considerations: this.messageConsiderations().trim() || undefined,
        saveTracked: this.saveTracked(),
        recipientName: this.recipientName.trim() || undefined,
        recipientEmail: this.recipientEmail.trim() || undefined,
        contactNotes: this.contactNotes.trim() || undefined,
        cvVersionId: this.selectedCvVersionId() || undefined,
      });
      if (res.success && res.data) {
        this.generatedMessage.set(res.data.message ?? '');
        this.prepApplicationId.set(res.data.applicationId ?? null);
      } else {
        this.messageError.set(res.message || 'Failed to generate message');
      }
    } catch (e: any) {
      this.messageError.set(e?.message || 'Failed to generate message');
    } finally {
      this.generatingMessage.set(false);
    }
  }

  async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Copy failed — select and copy manually');
    }
  }

  copyAllForm() {
    const all = this.formResponses().map(r => `Q: ${r.field}\nA: ${r.answer}`).join('\n\n');
    void this.copyText(all);
  }
}
