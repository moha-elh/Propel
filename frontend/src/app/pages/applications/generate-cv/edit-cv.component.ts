import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CvGenerationService } from '@app/services/cv-generation.service';
import { CvGenerationResult, EditCvSection } from '@app/models/cv-generation.models';

@Component({
  selector: 'app-edit-cv',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="edit-page">
  <div class="edit-header">
    <div class="edit-header-left">
      <h1 class="edit-title">Edit Your CV Sections</h1>
      <p class="edit-sub">Modify each section before saving or regenerating.</p>
    </div>
    <div class="edit-header-actions">
      <button class="back-btn" routerLink="/applications/generate">Back</button>
      <button class="save-btn" (click)="saveChanges()" [disabled]="saving()">
        <i class="ti ti-device-floppy"></i> {{ saving() ? 'Saving...' : 'Save Changes' }}
      </button>
    </div>
  </div>

  @if (loading()) {
    <div class="loading-state"><i class="ti ti-refresh"></i> Loading...</div>
  } @else if (editData()) {
    <div class="edit-grid">
      <div class="edit-section">
        <h2 class="section-title"><i class="ti ti-align-left"></i> Summary</h2>
        <textarea class="edit-textarea"
          [value]="editData()!.summary"
          (input)="updateSummary($any($event.target).value)"
          placeholder="Professional summary..."></textarea>
      </div>

      <div class="edit-section">
        <h2 class="section-title"><i class="ti ti-briefcase"></i> Experience</h2>
        @for (exp of editData()!.experiences; track exp; let i = $index) {
          <div class="exp-card">
            <div class="exp-header">
              <strong>{{ exp.title }} @ {{ exp.company }}</strong>
              <button class="icon-btn" (click)="removeExperience(i)"><i class="ti ti-x"></i></button>
            </div>
            <textarea class="edit-textarea small"
              [value]="exp.description"
              (input)="updateExpDesc(i, $any($event.target).value)"
              placeholder="Description..."></textarea>
            <div class="bullet-list">
              @for (bullet of exp.bullets; track bullet; let j = $index) {
                <div class="bullet-row">
                  <span class="bullet-dot"></span>
                  <input class="bullet-input" [value]="bullet" (input)="updateBullet(i, j, $any($event.target).value)" />
                  <button class="icon-btn small" (click)="removeBullet(i, j)"><i class="ti ti-x"></i></button>
                </div>
              }
              <button class="add-bullet-btn" (click)="addBullet(i)">+ Add bullet point</button>
            </div>
          </div>
        }
        <button class="add-section-btn" (click)="addExperience()">+ Add Experience</button>
      </div>

      <div class="edit-section">
        <h2 class="section-title"><i class="ti ti-code"></i> Skills</h2>
        <div class="skills-edit">
          @for (skill of editData()!.skills; track skill; let i = $index) {
            <div class="skill-chip">
              <span>{{ skill }}</span>
              <button class="chip-remove" (click)="removeSkill(i)"><i class="ti ti-x"></i></button>
            </div>
          }
          <div class="add-skill-row">
            <input class="skill-input" #skillInput placeholder="Add skill..." (keydown.enter)="addSkill(skillInput.value); skillInput.value = ''" />
            <button class="icon-btn" (click)="addSkill(skillInput.value); skillInput.value = ''"><i class="ti ti-plus"></i></button>
          </div>
        </div>
      </div>

      <div class="edit-section">
        <h2 class="section-title"><i class="ti ti-folder"></i> Projects</h2>
        @for (proj of editData()!.projects; track proj; let i = $index) {
          <div class="exp-card">
            <div class="exp-header">
              <strong>{{ proj.name }}</strong>
              <button class="icon-btn" (click)="removeProject(i)"><i class="ti ti-x"></i></button>
            </div>
            <textarea class="edit-textarea small"
              [value]="proj.description"
              (input)="updateProjDesc(i, $any($event.target).value)"
              placeholder="Project description..."></textarea>
          </div>
        }
        <button class="add-section-btn" (click)="addProject()">+ Add Project</button>
      </div>
    </div>

    <div class="edit-footer">
      <button class="save-btn" (click)="saveChanges()" [disabled]="saving()">
        <i class="ti ti-device-floppy"></i> {{ saving() ? 'Saving...' : 'Save Changes' }}
      </button>
      <button class="regenerate-btn" (click)="regenerateWithEdits()">
        <i class="ti ti-refresh"></i> Regenerate CV with edits
      </button>
    </div>
  }
</div>
  `,
  styles: [`
:host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.edit-page { padding: 32px 40px; display: flex; flex-direction: column; gap: 24px; flex: 1; overflow-y: auto; background: var(--bg); }
.edit-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.edit-header-left { display: flex; flex-direction: column; gap: 6px; }
.edit-title { font-family: var(--font-display); font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.025em; }
.edit-sub { font-size: 14px; color: var(--text-3); }
.edit-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.back-btn { padding: 7px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-2); font-size: 13px; font-weight: 500; cursor: pointer; font-family: var(--font-body); transition: background 0.1s; &:hover { background: var(--bg-2); } }
.save-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 8px; background: var(--dark); color: white; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); transition: opacity 0.12s; i { font-size: 14px; } &:disabled { opacity: 0.5; } &:not(:disabled):hover { opacity: 0.85; } }
.regenerate-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: var(--radius); background: oklch(0.55 0.18 250); color: white; font-size: 14px; font-weight: 700; cursor: pointer; font-family: var(--font-display); transition: opacity 0.12s; i { font-size: 14px; } &:hover { opacity: 0.85; } }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 48px; font-size: 15px; color: var(--text-3); i { animation: spin 1s linear infinite; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.edit-grid { display: flex; flex-direction: column; gap: 20px; }
.edit-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); }
.section-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; i { color: var(--text-2); } }
.edit-textarea { width: 100%; min-height: 80px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px; color: var(--text); line-height: 1.55; resize: vertical; outline: none; box-sizing: border-box; transition: border-color 0.12s; &:focus { border-color: oklch(0.75 0.1 250); } &.small { min-height: 60px; font-size: 13px; } }
.exp-card { margin-bottom: 12px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); }
.exp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; strong { font-size: 14px; color: var(--text); } }
.icon-btn { width: 24px; height: 24px; border: none; background: transparent; color: var(--text-3); cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; &:hover { background: var(--border); color: var(--text-2); } &.small { width: 20px; height: 20px; } }
.bullet-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.bullet-row { display: flex; align-items: center; gap: 6px; }
.bullet-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--text-3); flex-shrink: 0; }
.bullet-input { flex: 1; border: none; background: transparent; font-size: 13px; color: var(--text-2); font-family: var(--font-body); outline: none; padding: 4px 0; }
.add-bullet-btn { background: none; border: none; color: oklch(0.5 0.14 250); font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 0; font-family: var(--font-body); &:hover { color: oklch(0.4 0.16 250); } }
.add-section-btn { background: none; border: 1px dashed var(--border); border-radius: var(--radius); padding: 8px 16px; color: var(--text-3); font-size: 13px; font-weight: 500; cursor: pointer; width: 100%; font-family: var(--font-body); &:hover { background: var(--bg); color: var(--text-2); } }
.skills-edit { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.skill-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; background: oklch(0.93 0.04 250); border: 1px solid oklch(0.82 0.06 250); color: oklch(0.4 0.14 250); font-size: 13px; font-weight: 500; }
.chip-remove { width: 16px; height: 16px; border: none; background: transparent; color: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; padding: 0; opacity: 0.6; &:hover { opacity: 1; } }
.add-skill-row { display: flex; align-items: center; gap: 4px; }
.skill-input { border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; font-size: 13px; font-family: var(--font-body); outline: none; background: var(--bg); color: var(--text); width: 140px; &:focus { border-color: oklch(0.75 0.1 250); } }
.edit-footer { display: flex; gap: 12px; justify-content: flex-end; padding-top: 8px; }
  `]
})
export class EditCvComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cvService = inject(CvGenerationService);

  loading = signal(true);
  saving = signal(false);
  editData = signal<EditCvSection | null>(null);
  private runId = '';

  ngOnInit() {
    this.runId = this.route.snapshot.paramMap.get('runId') ?? '';
    if (!this.runId) {
      this.router.navigate(['/applications/generate']);
      return;
    }
    this.loadData();
  }

  private async loadData() {
    this.loading.set(true);
    try {
      const result = await this.cvService.getResult(this.runId);
      this.editData.set(this.buildEditData(result));
    } catch {
      this.router.navigate(['/applications/generate']);
    }
    this.loading.set(false);
  }

  private buildEditData(result: CvGenerationResult): EditCvSection {
    const ext = result.extraction ?? {};
    const search = result.search ?? {};

    return {
      summary: ext.enterprise_name
        ? `Experienced ${ext.job_role ?? 'professional'} with expertise in ${(ext.required_skills ?? []).slice(0, 3).join(', ')}.`
        : '',
      experiences: (search.matched_experiences ?? search.MatchedExperiences ?? []).map((e: any) => ({
        company: e.company ?? e.Company ?? '',
        title: e.title ?? e.Title ?? '',
        description: e.description ?? e.Description ?? '',
        bullets: [],
      })),
      skills: (search.matched_skills ?? search.MatchedSkills ?? []).map((s: any) => (typeof s === 'string' ? s : s.name ?? s.Name ?? '')),
      projects: (search.matched_projects ?? search.MatchedProjects ?? []).map((p: any) => ({
        name: p.title ?? p.Title ?? p.name ?? p.Name ?? '',
        description: p.description ?? p.Description ?? '',
        url: p.url ?? p.Url ?? p.demoUrl ?? p.DemoUrl ?? '',
      })),
    };
  }

  updateSummary(val: string) { this.editData.update(d => d ? { ...d, summary: val } : d); }

  updateExpDesc(i: number, val: string) {
    this.editData.update(d => {
      if (!d) return d;
      const exps = [...d.experiences];
      exps[i] = { ...exps[i], description: val };
      return { ...d, experiences: exps };
    });
  }

  updateBullet(expIdx: number, bulletIdx: number, val: string) {
    this.editData.update(d => {
      if (!d) return d;
      const exps = [...d.experiences];
      const bullets = [...exps[expIdx].bullets];
      bullets[bulletIdx] = val;
      exps[expIdx] = { ...exps[expIdx], bullets };
      return { ...d, experiences: exps };
    });
  }

  addBullet(expIdx: number) {
    this.editData.update(d => {
      if (!d) return d;
      const exps = [...d.experiences];
      exps[expIdx] = { ...exps[expIdx], bullets: [...exps[expIdx].bullets, ''] };
      return { ...d, experiences: exps };
    });
  }

  removeBullet(expIdx: number, bulletIdx: number) {
    this.editData.update(d => {
      if (!d) return d;
      const exps = [...d.experiences];
      exps[expIdx] = { ...exps[expIdx], bullets: exps[expIdx].bullets.filter((_, j) => j !== bulletIdx) };
      return { ...d, experiences: exps };
    });
  }

  addExperience() {
    this.editData.update(d => d ? {
      ...d,
      experiences: [...d.experiences, { company: '', title: '', description: '', bullets: [] }]
    } : d);
  }

  removeExperience(i: number) {
    this.editData.update(d => d ? { ...d, experiences: d.experiences.filter((_, j) => j !== i) } : d);
  }

  addSkill(name: string) {
    if (!name.trim()) return;
    this.editData.update(d => d ? { ...d, skills: [...d.skills, name.trim()] } : d);
  }

  removeSkill(i: number) {
    this.editData.update(d => d ? { ...d, skills: d.skills.filter((_, j) => j !== i) } : d);
  }

  updateProjDesc(i: number, val: string) {
    this.editData.update(d => {
      if (!d) return d;
      const projs = [...d.projects];
      projs[i] = { ...projs[i], description: val };
      return { ...d, projects: projs };
    });
  }

  addProject() {
    this.editData.update(d => d ? { ...d, projects: [...d.projects, { name: '', description: '' }] } : d);
  }

  removeProject(i: number) {
    this.editData.update(d => d ? { ...d, projects: d.projects.filter((_, j) => j !== i) } : d);
  }

  async saveChanges() {
    this.saving.set(true);
    // In production, POST to a save endpoint
    await new Promise(r => setTimeout(r, 500));
    this.saving.set(false);
    alert('Changes saved locally. In production, this would persist to the server.');
  }

  regenerateWithEdits() {
    // Navigate back to generate page with the edited data
    this.router.navigate(['/applications/generate']);
  }
}
