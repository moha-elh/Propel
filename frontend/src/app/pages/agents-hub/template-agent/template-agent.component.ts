import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DocumentsService } from '@app/services/documents.service';
import { ExtractionService } from '@app/services/extraction.service';
import { TemplateRenderService } from '@app/services/template-render.service';
import { CvTemplateDto } from '@app/models/document.model';
import { ExtractorOutput, ExtractionHistoryItem } from '@app/models/extraction.types';
import {
  TemplateRenderResult,
  TemplateRenderRunStatus,
  TemplateRenderSseEvent,
} from '@app/models/template-render.models';
import { TONES, LANGUAGES } from '@app/models/cv-generation.models';
import { extractError } from '@app/shared/error-utils';
import { ImagePickerComponent } from '@app/shared/components/image-picker/image-picker.component';
import { ImageDto, ImageService } from '@app/services/image.service';
import { UserProfileService } from '@app/services/user-profile.service';
import { ToastService } from '@app/services/toast.service';

type Phase = 'input' | 'prep' | 'running' | 'done';
type InputTab = 'paste' | 'url' | 'history';
type StepStatusKind = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface UiStep {
  name: string;
  runStep?: number;
  status: StepStatusKind;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  data: any;
  expanded?: boolean;
}

const DEFAULT_STEPS: UiStep[] = [
  { name: 'Job Extraction', status: 'pending', startedAt: null, completedAt: null, durationMs: null, error: null, data: null },
  { name: 'Profile Matching', runStep: 0, status: 'pending', startedAt: null, completedAt: null, durationMs: null, error: null, data: null },
  { name: 'Template Rendering', runStep: 1, status: 'pending', startedAt: null, completedAt: null, durationMs: null, error: null, data: null },
  { name: 'PDF & Save', runStep: 2, status: 'pending', startedAt: null, completedAt: null, durationMs: null, error: null, data: null },
];

@Component({
  selector: 'app-template-agent',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ImagePickerComponent],
  templateUrl: './template-agent.component.html',
  styleUrl: './template-agent.component.scss',
})
export class TemplateAgentComponent implements OnInit, OnDestroy {
  private readonly documents = inject(DocumentsService);
  private readonly extractionService = inject(ExtractionService);
  private readonly renderService = inject(TemplateRenderService);
  private readonly route = inject(ActivatedRoute);
  private readonly imagesApi = inject(ImageService);
  private readonly profileSvc = inject(UserProfileService);
  private readonly toast = inject(ToastService);

  tones = TONES;
  languages = LANGUAGES;

  phase = signal<Phase>('input');
  inputTab = signal<InputTab>('paste');

  templates = signal<CvTemplateDto[]>([]);
  templatesLoading = signal(false);
  selectedTemplate = signal('');
  selectedTemplateName = signal('');

  jobDescription = signal('');
  jobUrl = signal('');
  history = signal<ExtractionHistoryItem[]>([]);
  historyLoading = signal(false);
  selectedExtractionId = signal<string>('');

  selectedTone = signal('Confident');
  selectedLanguage = signal('en');
  saveToDocuments = signal(true);
  cvTitle = signal('');

  photoPickerOpen = signal(false);
  profilePhotoKey = signal<string>('');
  cvPhotoPreview = signal<string | null>(null);

  steps = signal<UiStep[]>([...DEFAULT_STEPS].map(s => ({ ...s, data: null })));
  runId = signal<string | null>(null);
  runStatus = signal<TemplateRenderRunStatus | null>(null);
  result = signal<TemplateRenderResult | null>(null);
  elapsedSeconds = signal(0);
  error = signal('');

  // Developer aid: raw events received over the SSE stream.
  eventLog = signal<string[]>([]);
  running = signal(false);

  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private closeStream: (() => void) | null = null;

  get canSubmit(): boolean {
    if (this.phase() !== 'input') return false;
    if (this.inputTab() === 'history') return !!this.selectedExtractionId();
    if (this.inputTab() === 'url') return this.jobUrl().trim().length > 0;
    return this.jobDescription().trim().length > 0;
  }

  ngOnInit(): void {
    this.loadTemplates();
    this.loadHistory();
    this.loadPhoto();
  }

  private async loadPhoto(): Promise<void> {
    try {
      const profile = await this.profileSvc.getMyProfile();
      const key = profile?.profilePhotoKey ?? '';
      this.profilePhotoKey.set(key);
      if (key) {
        const res = await this.imagesApi.list({ page: 1, pageSize: 200 });
        const match = (res.data?.items ?? []).find(i => i.objectKey === key);
        this.cvPhotoPreview.set(match?.url ?? null);
      } else {
        this.cvPhotoPreview.set(null);
      }
    } catch {
      // non-fatal: photo selection just won't show
    }
  }

  async onPhotoPicked(img: ImageDto): Promise<void> {
    if (!img.objectKey) {
      this.toast.error('URL-only images can\'t be used in the CV header — upload it or re-add it so it is downloaded');
      return;
    }
    try {
      await this.profileSvc.applyFields({ profilePhotoKey: img.objectKey });
      this.profilePhotoKey.set(img.objectKey);
      this.cvPhotoPreview.set(img.url);
      this.toast.success('CV profile photo set — it will appear in the CV header');
    } catch {
      this.toast.error('Failed to set CV photo');
    }
  }

  async removePhoto(): Promise<void> {
    try {
      await this.profileSvc.applyFields({ profilePhotoKey: '' });
      this.profilePhotoKey.set('');
      this.cvPhotoPreview.set(null);
      this.toast.success('CV photo removed');
    } catch {
      this.toast.error('Failed to remove CV photo');
    }
  }

  ngOnDestroy(): void {
    this.closeStream?.();
    this.stopElapsedTimer();
  }

  private async loadTemplates(): Promise<void> {
    this.templatesLoading.set(true);
    try {
      const res = await this.documents.listTemplates();
      const list = (res.data ?? []).filter(t => t.templateType === 'latex');
      this.templates.set(list);
      const q = this.route.snapshot.queryParamMap.get('template');
      if (q) {
        const match = list.find(t => t.id === q || t.name === q);
        if (match) {
          this.selectedTemplate.set(match.id);
          this.selectedTemplateName.set(match.name);
        }
      }
    } catch {
      // Keep built-in default available on catalog failure
    } finally {
      this.templatesLoading.set(false);
    }
  }

  private async loadHistory(): Promise<void> {
    this.historyLoading.set(true);
    this.history.set(await this.extractionService.getHistory('job-extractor'));
    this.historyLoading.set(false);
  }

  onTemplateChange(): void {
    const id = this.selectedTemplate();
    const match = this.templates().find(t => t.id === id);
    this.selectedTemplateName.set(match ? match.name : '');
  }

  selectedTemplateMeta(): CvTemplateDto | null {
    const match = this.templates().find(t => t.id === this.selectedTemplate());
    return match ?? null;
  }

  placeholderCount(content: string): number {
    const m = content.match(/%=== SECTION PLACEHOLDER ===/g);
    return m ? m.length : 0;
  }

  templateLabel(): string {
    return this.selectedTemplateName() || 'Default (built-in)';
  }

  selectedHistoryItem(): ExtractionHistoryItem | null {
    return this.history().find(h => h.id === this.selectedExtractionId()) ?? null;
  }

  // ── Generate ──
  async generate(): Promise<void> {
    if (!this.canSubmit) return;

    this.error.set('');
    this.eventLog.set([]);
    this.running.set(true);
    // Show the tracking panel immediately so the Job Extraction step is
    // visible/updating while the extractor runs (it can take 10-30s).
    this.phase.set('prep');
    this.elapsedSeconds.set(0);
    this.startElapsedTimer();

    // The two agent outputs feed the render as input:
    //  1) Job Extraction output (persisted run — fresh or from history)
    //  2) Profile Matching output (computed inside the render run)
    let extractionId = '';
    try {
      if (this.inputTab() === 'history') {
        extractionId = this.selectedExtractionId();
        this.setStepStatus(0, 'running');
        const output = await this.extractionService.getExtraction(extractionId);
        this.completeStep(0, output);
      } else {
        this.setStepStatus(0, 'running');
        const res = await this.extractionService.extract({
          text: this.inputTab() === 'paste' ? this.jobDescription() : undefined,
          url: this.inputTab() === 'url' ? this.jobUrl() : undefined,
          language: this.selectedLanguage(),
        });
        extractionId = res.id;
        this.completeStep(0, res.output);
      }
    } catch (e: any) {
      this.stopElapsedTimer();
      this.setStepStatus(0, 'failed');
      this.error.set(extractError(e, 'Job extraction failed.'));
      this.running.set(false);
      this.phase.set('input');
      return;
    }

    await this.submitRun(extractionId);
  }

  private async submitRun(extractionId: string): Promise<void> {
    // Reset run-owned steps; keep step 0 (extraction) as completed.
    const next: UiStep[] = this.steps().map((s, i) =>
      i === 0 ? s : { ...s, status: 'pending' as StepStatusKind, startedAt: null, completedAt: null, durationMs: null, error: null, data: null },
    );
    this.steps.set(next);

    try {
      const runId = await this.renderService.submit({
        extractionId,
        templateId: this.selectedTemplate() || undefined,
        language: this.selectedLanguage() !== 'en' ? this.selectedLanguage() : undefined,
        tone: this.selectedTone(),
        saveToDocuments: this.saveToDocuments(),
        title: this.cvTitle().trim() || undefined,
      });
      this.runId.set(runId);
      this.eventLog.update(l => [...l, `run_id=${runId}`]);

      this.closeStream = this.renderService.streamEvents(runId, {
        onOpen: () => this.eventLog.update(l => [...l, 'event: open']),
        onSnapshot: snap => {
          this.runStatus.set(snap.status);
          this.eventLog.update(l => [...l, `event: snapshot status=${snap.status} step=${snap.current_step}`]);
          this.applyRunSnapshot(snap.steps ?? []);
        },
        onDone: done => {
          this.stopElapsedTimer();
          this.eventLog.update(l => [...l, `event: done status=${done.status}${done.error_message ? ' error=' + done.error_message : ''}`]);
          this.runStatus.set(done.status);
          this.handleDone(done);
        },
        onError: msg => {
          this.stopElapsedTimer();
          this.eventLog.update(l => [...l, `event: error ${msg}`]);
          this.error.set(msg);
          this.phase.set('done');
        },
      });
    } catch (e: any) {
      this.stopElapsedTimer();
      this.error.set(extractError(e, 'Failed to start template render.'));
      this.running.set(false);
      this.phase.set('input');
    }
  }

  private applyRunSnapshot(runSteps: Array<{ step: number; name: string; status: string; started_at?: string | null; completed_at?: string | null; duration_ms?: number | null; error?: string | null }>): void {
    const mapped = this.steps().map(ui => {
      const rs = ui.runStep !== undefined ? runSteps.find(r => r.step === ui.runStep) : null;
      if (!rs) return ui;
      return {
        ...ui,
        status: rs.status as StepStatusKind,
        startedAt: rs.started_at ?? null,
        completedAt: rs.completed_at ?? null,
        durationMs: rs.duration_ms ?? null,
        error: rs.error ?? null,
      };
    });
    this.steps.set(mapped);
  }

  private completeStep(idx: number, data: any): void {
    this.steps.update(st => st.map((s, i) =>
      i === idx ? { ...s, status: 'completed', completedAt: new Date().toISOString(), data } : s,
    ));
  }

  private setStepStatus(idx: number, status: StepStatusKind, error: string | null = null): void {
    this.steps.update(st => st.map((s, i) => (i === idx ? { ...s, status, error } : s)));
  }

  private handleDone(done: Extract<TemplateRenderSseEvent, { type: 'done' }>): void {
    this.running.set(false);
    if (done.status === 'completed' && done.result) {
      const r = done.result;
      this.result.set(r);
      this.steps.update(st => st.map((s, i) => {
        if (i === 1 && r.search) return { ...s, data: r.search };
        if (i === 2 && r.render) return { ...s, data: r.render };
        if (i === 3) return { ...s, data: { pdf_url: r.pdf_url, cv_id: r.cv_id, saved: r.saved } };
        return s;
      }));
      this.phase.set('done');
    } else if (done.status === 'cancelled') {
      this.error.set('Run cancelled.');
      this.phase.set('done');
    } else {
      this.error.set(done.error_message || `Run ${done.status}. See step details or the debug log below.`);
      this.phase.set('done');
    }
  }

  // ── Run control ──
  async cancelRun(): Promise<void> {
    const id = this.runId();
    this.closeStream?.();
    this.closeStream = null;
    this.stopElapsedTimer();
    if (id) {
      try { await this.renderService.cancel(id); } catch {}
    }
    this.running.set(false);
    this.phase.set('input');
    this.runStatus.set(null);
    this.error.set('');
  }

  newRun(): void {
    this.closeStream?.();
    this.closeStream = null;
    this.stopElapsedTimer();
    this.phase.set('input');
    this.runId.set(null);
    this.runStatus.set(null);
    this.result.set(null);
    this.error.set('');
    this.eventLog.set([]);
    this.elapsedSeconds.set(0);
    this.steps.set([...DEFAULT_STEPS].map(s => ({ ...s, data: null })));
  }

  // ── Display helpers ──
  formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  stepPercent(step: UiStep): number {
    if (step.status === 'completed') return 100;
    if (step.status === 'running') return 60;
    if (step.status === 'failed' || step.status === 'cancelled') return 100;
    return 0;
  }

  jsonStringify(v: any): string {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  openStepDetail(idx: number): void {
    this.steps.update(st => st.map((s, i) => (i === idx ? { ...s, expanded: !s.expanded } : s)));
  }

  downloadPdf(): void {
    const url = this.result()?.pdf_url;
    if (url) window.open(url, '_blank');
  }

  copyTex(): void {
    const tex = this.result()?.tex;
    if (!tex) return;
    navigator.clipboard?.writeText(tex);
  }

  downloadTex(): void {
    const tex = this.result()?.tex;
    if (!tex) return;
    const blob = new Blob([tex], { type: 'application/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cv.tex';
    a.click();
    URL.revokeObjectURL(url);
  }

  useSample(): void {
    this.jobDescription.set(`We're looking for a Senior Product Designer to join our team.

You'll work closely with engineering and product to design experiences for millions of users. You'll own the design process end-to-end — from research and ideation to high-fidelity mockups and QA.

Requirements:
- 5+ years of product design experience
- Proficiency in Figma and Protopie
- Experience working in agile teams
- Strong portfolio demonstrating systems thinking`);
    this.inputTab.set('paste');
  }

  reloadHistory(): void {
    void this.loadHistory();
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => this.elapsedSeconds.update(v => v + 1), 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }
}