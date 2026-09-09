import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CvGenerationService } from '@app/services/cv-generation.service';
import { DocumentsService } from '@app/services/documents.service';
import { AuthService } from '@app/services/auth.service';
import { CvTemplateDto } from '@app/models/document.model';
import {
  CvGenerationStatus,
  CvGenerationResult,
  StepStatus,
  CVProfile,
  TONES,
  LANGUAGES,
} from '@app/models/cv-generation.models';
import { extractError } from '@app/shared/error-utils';

type PageState = 'form' | 'progress' | 'results';
type InputTab = 'paste' | 'url';

@Component({
  selector: 'app-template-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink],
  templateUrl: './template-workspace.component.html',
  styleUrl: './template-workspace.component.scss',
})
export class TemplateWorkspaceComponent implements OnInit, OnDestroy {
  private readonly cvService = inject(CvGenerationService);
  private readonly documents = inject(DocumentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  tones = TONES;
  languages = LANGUAGES;

  state = signal<PageState>('form');
  inputTab = signal<InputTab>('paste');

  templates = signal<CvTemplateDto[]>([]);
  templatesLoading = signal(false);
  selectedTemplate = signal('');
  selectedTemplateName = signal('');

  jobDescription = signal('');
  jobUrl = signal('');
  selectedTone = signal('Confident');
  selectedLanguage = signal('en');

  // Candidate + email (carried from the legacy page)
  candidateName = signal(
    this.auth.currentUser()
      ? `${this.auth.currentUser()!.firstName} ${this.auth.currentUser()!.lastName}`
      : '',
  );
  recipientEmail = signal(this.auth.currentUser()?.email ?? '');
  sendEmail = signal(true);
  emailSubject = signal('');
  profiles = signal<CVProfile[]>([]);
  profilesLoading = signal(false);
  selectedProfileId = signal<string | null>(null);

  runId = signal<string | null>(null);
  status = signal<CvGenerationStatus | null>(null);
  result = signal<CvGenerationResult | null>(null);
  elapsedSeconds = signal(0);
  error = signal('');
  selectedStepIndex = signal<number | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;

  defaultSteps: StepStatus[] = [
    { step: 0, name: 'Job Extraction', status: 'pending', started_at: null, completed_at: null, duration_ms: null, error: null },
    { step: 1, name: 'Profile Matching', status: 'pending', started_at: null, completed_at: null, duration_ms: null, error: null },
    { step: 2, name: 'Template Rendering', status: 'pending', started_at: null, completed_at: null, duration_ms: null, error: null },
    { step: 3, name: 'CV Optimization', status: 'pending', started_at: null, completed_at: null, duration_ms: null, error: null },
    { step: 4, name: 'Email Delivery', status: 'pending', started_at: null, completed_at: null, duration_ms: null, error: null },
  ];

  get canSubmit(): boolean {
    const hasDesc =
      this.inputTab() === 'url' ? this.jobUrl().trim().length > 0 : this.jobDescription().trim().length > 0;
    return hasDesc && this.state() === 'form';
  }

  ngOnInit(): void {
    this.loadTemplates();
    this.loadProfiles();
  }

  ngOnDestroy(): void {
    this.stopPolling();
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

  private async loadProfiles(): Promise<void> {
    this.profilesLoading.set(true);
    this.profiles.set(await this.cvService.fetchProfiles());
    this.profilesLoading.set(false);
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

  // ── Generate ──
  async generate(): Promise<void> {
    if (!this.canSubmit) return;

    this.error.set('');
    const desc = this.inputTab() === 'url' ? `[URL: ${this.jobUrl()}]` : this.jobDescription();
    this.state.set('progress');
    this.elapsedSeconds.set(0);
    this.startElapsedTimer();

    try {
      const runId = await this.cvService.submit({
        jobDescription: desc,
        candidateName: this.candidateName() || undefined,
        recipientEmail: this.sendEmail() ? this.recipientEmail() || undefined : undefined,
        templateId: this.selectedTemplate() || undefined,
        language: this.selectedLanguage() !== 'en' ? this.selectedLanguage() : undefined,
        tone: this.selectedTone(),
        emailSubject: this.emailSubject() || undefined,
      });
      this.runId.set(runId);
      this.startPolling(runId);
    } catch (e: any) {
      this.error.set(extractError(e, 'Failed to start generation.'));
      this.state.set('form');
      this.stopElapsedTimer();
    }
  }

  private startPolling(runId: string): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const s = await this.cvService.getStatus(runId);
        this.status.set(s);
        if (s.status === 'completed') {
          this.stopPolling();
          this.stopElapsedTimer();
          const r = await this.cvService.getResult(runId);
          this.result.set(r);
          this.state.set('results');
        } else if (s.status === 'failed' || s.status === 'cancelled') {
          this.stopPolling();
          this.stopElapsedTimer();
          this.error.set(s.error_message || `Run ${s.status}`);
          try { const r = await this.cvService.getResult(runId); this.result.set(r); } catch {}
          this.state.set('results');
        }
      } catch {
        this.stopPolling();
        this.stopElapsedTimer();
        this.error.set('Lost connection while polling status.');
      }
    }, 1500);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      this.elapsedSeconds.update(v => v + 1);
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  // ── Run control ──
  async cancelRun(): Promise<void> {
    const id = this.runId();
    if (!id) return;
    try {
      await this.cvService.cancel(id);
    } catch {}
    this.stopPolling();
    this.stopElapsedTimer();
    this.state.set('form');
  }

  goBack(): void {
    this.stopPolling();
    this.stopElapsedTimer();
    this.state.set('form');
    this.runId.set(null);
    this.status.set(null);
    this.result.set(null);
    this.error.set('');
    this.selectedStepIndex.set(null);
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

  displayedSteps(): StepStatus[] {
    const steps = this.status()?.steps;
    return steps && steps.length > 0 ? steps : this.defaultSteps;
  }

  stepPercent(step: StepStatus): number {
    if (step.status === 'completed') return 100;
    if (step.status === 'running') return 60;
    if (step.status === 'failed') return 100;
    return 0;
  }

  liveMatchScore(): number | null {
    const s = this.result()?.search;
    return s?.match_score ?? s?.MatchScore ?? null;
  }

  liveAtsScore(): number | null {
    const o = this.result()?.optimization;
    return o?.ats_score_after ?? o?.AtsScoreAfter ?? null;
  }

  liveGapSkills(): string[] {
    const s = this.result()?.search;
    return s?.gap_skills ?? s?.GapSkills ?? [];
  }

  pdfPreviewUrl(): string {
    const render = this.result()?.render;
    return render?.file_path ?? render?.FilePath ?? render?.cv_code ?? render?.CvCode ?? '';
  }

  downloadPdf(): void {
    const url = this.pdfPreviewUrl();
    if (url) window.open(url, '_blank');
  }

  viewEditPage(): void {
    const id = this.runId();
    if (id) this.router.navigate(['/applications/generate/edit', id]);
  }

  goToHistory(): void {
    this.router.navigate(['/applications/resumes']);
  }

  // ── Step detail ──
  openStepDetail(idx: number): void {
    this.selectedStepIndex.set(idx);
  }

  closeStepDetail(): void {
    this.selectedStepIndex.set(null);
  }

  stepDetailData(idx: number): any {
    const r = this.result();
    if (!r) return null;
    switch (idx) {
      case 0: return r.extraction;
      case 1: return r.search;
      case 2: return r.render;
      case 3: return r.optimization;
      case 4: return r.delivery;
      default: return null;
    }
  }

  jsonStringify(v: any): string {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  // ── Sample ──
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
}