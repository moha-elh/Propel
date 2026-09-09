import { Component, signal, computed, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { Router } from '@angular/router';
import { DocumentsService } from '@app/services/documents.service';
import { ToastService } from '@app/services/toast.service';
import { extractError } from '@app/shared/error-utils';
import { CvTemplateDto } from '@app/models/document.model';

@Component({
  selector: 'app-documents-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './documents-templates.component.html',
  styleUrl: './documents-templates.component.scss',
})
export class DocumentsTemplatesComponent implements OnInit {
  private readonly service = inject(DocumentsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  @ViewChild('srcTa') srcTa?: ElementRef<HTMLTextAreaElement>;

  templates = signal<CvTemplateDto[]>([]);
  loading = signal(true);

  editing = signal<CvTemplateDto | null>(null);
  modalOpen = signal(false);
  formName = signal('');
  formDescription = signal('');
  formType = signal<'latex' | 'html' | 'pdf'>('latex');
  formContent = signal('');
  saving = signal(false);

  readonly sectionPresets = SECTION_PRESETS;
  readonly sectionLegend = SECTION_LEGEND;

  parsedPlaceholders = computed(() => parsePlaceholders(this.formContent()));

  hasPlaceholderWarnings = computed(() =>
    this.parsedPlaceholders().some(p => p.warnings.length > 0),
  );

  hasBodyMarker = computed(() => this.formContent().includes(BODY_MARKER));

  // ── Source selection (convert pre-filled code → section) ──────────────────
  sel = signal<{ start: number; end: number; text: string } | null>(null);
  selLen = computed(() => this.sel()?.text.length ?? 0);

  // ── Section form ───────────────────────────────────────────────────────────
  sfOpen = signal(false);
  sfFromSelection = signal(false);
  sfEditIndex = signal<number | null>(null);
  sfTitle = signal('');
  sfKey = signal('');
  sfFormat = signal<'list' | 'paragraph'>('list');
  sfMaxChars = signal<number | null>(null);
  sfMaxItems = signal<number | null>(null);
  sfPerItemChars = signal<number | null>(null);
  sfReverse = signal(false);
  sfGuidance = signal('');
  sfExample = signal('');
  sfExpandBlock = signal(false);

  sfChips = computed<ConditionEntry[]>(() =>
    this.conditionsFromForm().map(text => ({ text, kind: conditionKind(text) })),
  );

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.service.listTemplates();
      this.templates.set(res.data ?? []);
    } catch (err) {
      this.toast.error(extractError(err, 'Failed to load templates'));
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.resetSectionForm();
    this.editing.set(null);
    this.modalOpen.set(true);
    this.sel.set(null);
    this.formName.set('');
    this.formDescription.set('');
    this.formType.set('latex');
    this.formContent.set(DEFAULT_LATEX_SKELETON);
  }

  openEdit(template: CvTemplateDto): void {
    this.resetSectionForm();
    this.editing.set(template);
    this.modalOpen.set(true);
    this.sel.set(null);
    this.formName.set(template.name);
    this.formDescription.set(template.description);
    this.formType.set(template.templateType);
    this.formContent.set(template.content);
  }

  close(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
    this.sel.set(null);
    this.resetSectionForm();
  }

  generateCvWithTemplate(t: CvTemplateDto): void {
    this.router.navigate(['/applications/generate'], { queryParams: { template: t.id } });
  }

  placeholderCount(content: string): number {
    return parsePlaceholders(content).length;
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  onTextAreaEvent(event: Event): void {
    this.captureSelection(event.target as HTMLTextAreaElement);
  }

  private captureSelection(ta: HTMLTextAreaElement | null): void {
    if (!ta) return;
    const start = Math.min(ta.selectionStart, ta.selectionEnd);
    const end = Math.max(ta.selectionStart, ta.selectionEnd);
    const text = this.formContent().slice(start, end);
    if (text) this.sel.set({ start, end, text });
    else this.sel.set(null);
  }

  expandSelectionToSection(): void {
    const ta = this.srcTa?.nativeElement;
    const content = this.formContent();
    const span = findEnclosingSection(content, this.sel()?.start ?? -1, this.sel()?.end ?? -1);
    if (!span || !ta) {
      this.toast.error('Could not detect an enclosing \\section block — select the whole block manually.');
      return;
    }
    this.sel.set({ start: span[0], end: span[1], text: content.slice(span[0], span[1]) });
    ta.selectionStart = span[0];
    ta.selectionEnd = span[1];
    ta.focus();
    this.sfExample.set(content.slice(span[0], span[1]));
  }

  // ── Section form ──────────────────────────────────────────────────────────
  openSectionForm(fromSelection: boolean, preset: SectionPreset | null = null): void {
    this.resetSectionForm();
    if (fromSelection) {
      const sel = this.sel();
      if (sel && sel.text.trim()) {
        this.sfFromSelection.set(true);
        const title = sectionTitleFromSelection(sel.text);
        if (title) this.sfTitle.set(title);
        const key = suggestKey(title || sel.text);
        if (key) this.sfKey.set(key);
        this.sfExample.set(sel.text);
      } else {
        this.toast.error('Select a part of the source code first, then click "Add as section".');
        return;
      }
    }
    if (preset) this.applyPreset(preset);
    this.sfOpen.set(true);
  }

  editSection(index: number): void {
    const ph = this.parsedPlaceholders()[index];
    if (!ph) return;
    this.resetSectionForm();
    this.sfEditIndex.set(index);
    this.sfTitle.set(ph.title);
    this.sfKey.set(ph.key);
    this.sfExample.set(ph.example);
    this.applyConditionsToForm(ph.conditions.map(c => c.text));
    this.sfOpen.set(true);
  }

  cancelSectionForm(): void {
    this.resetSectionForm();
  }

  private resetSectionForm(): void {
    this.sfOpen.set(false);
    this.sfFromSelection.set(false);
    this.sfEditIndex.set(null);
    this.sfTitle.set('');
    this.sfKey.set('');
    this.sfFormat.set('list');
    this.sfMaxChars.set(null);
    this.sfMaxItems.set(null);
    this.sfPerItemChars.set(null);
    this.sfReverse.set(false);
    this.sfGuidance.set('');
    this.sfExample.set('');
    this.sfExpandBlock.set(false);
  }

  private applyPreset(preset: SectionPreset): void {
    this.sfKey.set(preset.key);
    this.sfTitle.set(preset.title);
    this.applyConditionsToForm(preset.conditions);
  }

  pickPreset(preset: SectionPreset): void {
    this.applyPreset(preset);
  }

  private applyConditionsToForm(conds: string[]): void {
    const guidance: string[] = [];
    for (const raw of conds) {
      const t = raw.trim();
      let m: RegExpMatchArray | null;
      if ((m = t.match(RE_PER_ITEM_CHARS))) {
        this.sfPerItemChars.set(Number(m[1]));
        this.sfFormat.set('list');
        continue;
      }
      if ((m = t.match(RE_PER_ITEM_WORDS))) {
        guidance.push(t);
        continue;
      }
      if ((m = t.match(RE_MAX_ITEMS))) {
        this.sfMaxItems.set(Number(m[1]));
        this.sfFormat.set('list');
        continue;
      }
      if ((m = t.match(RE_MAX_CHARS))) {
        this.sfMaxChars.set(Number(m[1]));
        this.sfFormat.set('paragraph');
        continue;
      }
      if ((m = t.match(RE_MAX_WORDS))) {
        guidance.push(t);
        continue;
      }
      if (RE_REVERSE.test(t)) {
        this.sfReverse.set(true);
        continue;
      }
      if (RE_BULLETS.test(t)) {
        this.sfFormat.set('list');
        continue;
      }
      guidance.push(t);
    }
    this.sfGuidance.set(guidance.join('\n'));
  }

  private conditionsFromForm(): string[] {
    const conds: string[] = [];
    if (this.sfFormat() === 'paragraph') {
      const maxChars = this.sfMaxChars();
      if (maxChars && maxChars > 0) conds.push(`max ${maxChars} characters`);
    } else {
      const maxItems = this.sfMaxItems();
      if (maxItems && maxItems > 0) conds.push(`maximum ${maxItems} items`);
      const perItem = this.sfPerItemChars();
      if (perItem && perItem > 0) conds.push(`each item max ${perItem} characters`);
    }
    if (this.sfReverse()) conds.push('reverse chronological order');
    const guidance = this.sfGuidance().trim();
    if (guidance) conds.push(guidance);
    return conds;
  }

  setNum(field: 'maxChars' | 'maxItems' | 'perItemChars', value: number | string | null): void {
    const n = value === null || value === '' ? null : Number(value);
    const safe = n === null || Number.isFinite(n) ? n : null;
    if (field === 'maxChars') this.sfMaxChars.set(safe);
    else if (field === 'maxItems') this.sfMaxItems.set(safe);
    else this.sfPerItemChars.set(safe);
  }

  confirmSection(): void {
    const title = this.sfTitle().trim();
    if (!title) {
      this.toast.error('Section title is required');
      return;
    }
    const key = (this.sfKey().trim() || slugify(title) || 'section').toLowerCase();
    const conditions = this.conditionsFromForm();
    const example = this.sfExample().trim();
    const block = placeholderBlock(key, title, conditions, example);

    const editIndex = this.sfEditIndex();
    if (editIndex !== null) {
      const ph = this.parsedPlaceholders()[editIndex];
      if (!ph) {
        this.resetSectionForm();
        return;
      }
      const content = this.formContent();
      this.formContent.set(content.slice(0, ph.start) + block + content.slice(ph.end));
      this.toast.success('Section updated');
    } else if (this.sfFromSelection()) {
      const sel = this.sel();
      if (!sel) {
        this.resetSectionForm();
        return;
      }
      const content = this.formContent();
      if (content.slice(sel.start, sel.end) !== sel.text) {
        this.toast.error('The selection changed — select the text again, then retry.');
        return;
      }
      this.formContent.set(content.slice(0, sel.start) + block + content.slice(sel.end));
      this.sel.set(null);
      this.toast.success('Selection converted to a section placeholder');
    } else {
      this.insertBlock(block);
      this.toast.success('Section added');
    }
    this.resetSectionForm();
  }

  private insertBlock(block: string): void {
    this.formContent.update(content => {
      const idx = content.indexOf(BODY_MARKER);
      if (idx >= 0) {
        const insertAt = idx + BODY_MARKER.length;
        return content.slice(0, insertAt) + '\n' + block + '\n' + content.slice(insertAt);
      }
      return (content ? content.trimEnd() + '\n\n' : '') + block;
    });
  }

  movePlaceholder(index: number, delta: -1 | 1): void {
    const parsed = this.parsedPlaceholders();
    const target = index + delta;
    if (target < 0 || target >= parsed.length) return;
    const a = parsed[index];
    const b = parsed[target];
    if (!a || !b || a === b) return;
    // List follows source order, so a always precedes b.
    const content = this.formContent();
    const first = a.start < b.start ? a : b;
    const second = first === a ? b : a;
    this.formContent.set(
      content.slice(0, first.start) + second.raw + content.slice(first.end, second.start) + first.raw + content.slice(second.end),
    );
  }

  duplicatePlaceholder(index: number): void {
    const ph = this.parsedPlaceholders()[index];
    if (!ph) return;
    const content = this.formContent();
    this.formContent.set(content.slice(0, ph.end) + '\n' + ph.raw + content.slice(ph.end));
  }

  deletePlaceholder(index: number): void {
    const ph = this.parsedPlaceholders()[index];
    if (!ph) return;
    const content = this.formContent();
    this.formContent.set(content.slice(0, ph.start) + content.slice(ph.end));
    if (this.sfEditIndex() === index) this.resetSectionForm();
  }

  unsupportedKeys(): string[] {
    return this.parsedPlaceholders()
      .filter(p => p.warnings.some(w => w.includes('no data source and no example')))
      .map(p => p.key);
  }

  async doSave(): Promise<void> {
    if (!this.formName().trim()) {
      this.toast.error('Template name is required');
      return;
    }
    if (!this.formContent().trim()) {
      this.toast.error('Template content is required');
      return;
    }
    const unsupported = this.unsupportedKeys();
    if (unsupported.length > 0) {
      const ok = window.confirm(
        `These placeholder keys have no data source AND no example — they'll be skipped at render:\n- ${unsupported.join('\n- ')}\n\nSave anyway?`,
      );
      if (!ok) return;
    }
    const input = {
      name: this.formName().trim(),
      description: this.formDescription().trim(),
      templateType: this.formType(),
      content: this.formContent(),
    };
    const isEdit = this.editing() !== null;
    this.saving.set(true);
    try {
      const current = this.editing();
      if (current) {
        const res = await this.service.updateTemplate(current.id, input);
        this.toast.success(res.message ?? 'Template updated');
      } else {
        const res = await this.service.createTemplate(input);
        this.toast.success(res.message ?? 'Template created');
      }
      this.close();
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, isEdit ? 'Update failed' : 'Create failed'));
    } finally {
      this.saving.set(false);
    }
  }

  async deleteTemplate(template: CvTemplateDto): Promise<void> {
    if (template.isSystem) return;
    const confirmed = window.confirm(`Delete template "${template.name}"?`);
    if (!confirmed) return;
    try {
      await this.service.deleteTemplate(template.id);
      this.toast.success('Template deleted');
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Delete failed'));
    }
  }
}

const DEFAULT_LATEX_SKELETON = `\\documentclass[a4paper,10pt]{article}

% Packages
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[english]{babel}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{fontawesome5}
\\usepackage{array}
\\usepackage{tabularx}

% Page setup
\\geometry{left=1cm, right=1cm, top=0.3cm, bottom=0.3cm}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}

% Colors
\\definecolor{darkblue}{RGB}{0, 51, 102}
\\definecolor{lightgray}{RGB}{245, 245, 245}

% Section title formatting
\\titleformat{\\section}
  {\\color{darkblue}\\normalsize\\bfseries}
  {}{0em}{}[\\titlerule]

\\titlespacing*{\\section}{0pt}{3pt}{2pt}

% Hyperlink setup
\\hypersetup{
    colorlinks=true,
    linkcolor=darkblue,
    urlcolor=darkblue,
    filecolor=darkblue
}

% Custom commands (used by the section renderers)
\\newcommand{\\cvitem}[2]{
    \\textbf{#1:} #2
}

\\newcommand{\\experience}[5]{
    \\noindent
    \\colorbox{lightgray}{
        \\begin{minipage}{\\dimexpr\\textwidth-2\\fboxsep}
            \\vspace{1pt}
            \\begin{tabularx}{\\textwidth}{@{}X r@{}}
                {\\small\\textbf{\\color{darkblue}#1 --- #3}} & \\textcolor{darkblue}{\\small\\faCalendar\\ #2}
            \\end{tabularx}
            \\vspace{-2pt}
            \\textit{\\small #4}
            \\vspace{1pt}
        \\end{minipage}
    }
    \\vspace{1pt}
    #5
    \\vspace{3pt}
}

\\newcommand{\\formation}[3]{
    \\noindent
    \\begin{tabularx}{\\textwidth}{@{}X r@{}}
        \\textbf{#1} & \\textit{#2} \\\\
        \\multicolumn{2}{@{}p{\\textwidth}@{}}
        {\\small\\itshape #3}
    \\end{tabularx}
    \\vspace{1pt}
}

\\begin{document}
%=== BODY ===
\\end{document}
`;

// ── Section placeholders ────────────────────────────────────────────────────
// Templates can declare per-section placeholders (LaTeX comments, so they are
// inert to pdflatex) that document what should be injected where, each with its
// own conditions note + a style EXAMPLE the AI follows. The BODY marker stays
// the main injection point but the placeholder blocks make each named section's
// intent + constraints explicit:
//
//   %=== SECTION PLACEHOLDER ===
//   % KEY: experience
//   % TITLE: PROFESSIONAL EXPERIENCE
//   % COND: maximum 5 entries
//   % COND: each item max 120 characters
//   % COND: reverse chronological order
//   %=== EXAMPLE ===
//   % \experience{...}{...}{...}{}{...}
//   %=== END EXAMPLE ===
//   %=== END PLACEHOLDER ===
//
// Known keys map onto CvSections data + a deterministic renderer. Unknown keys
// are FREE-FORM: the AI writes their LaTeX from the EXAMPLE + candidate data.

const BODY_MARKER = '%=== BODY ===';

const PH_BLOCK_RE = /%=== SECTION PLACEHOLDER ===[\s\S]*?%=== END PLACEHOLDER ===/gi;
const PH_EXAMPLE_RE = /%=== EXAMPLE ===([\s\S]*?)%=== END EXAMPLE ===/gim;
const PH_KEY_RE = /^\s*%[ \t]*KEY:[ \t]*([^\n]+)/im;
const PH_TITLE_RE = /^\s*%[ \t]*TITLE:[ \t]*([^\n]+)/im;
const PH_COND_RE = /^\s*%[ \t]*COND:[ \t]*([^\n]+)/gim;

// Must mirror the sidecar's known-key mapping (agents/template/placeholders.py):
// keys not listed here have no CvSections data source and are rendered free-form
// by the AI using the block's example. `header` is recognized but drives the
// header block, not a section.
const KNOWN_SECTION_KEYS = new Set([
  'summary', 'about', 'skills', 'experience', 'experiences',
  'education', 'educations', 'projects', 'hackathons', 'languages',
  'soft-skills', 'softskills', 'soft_skills', 'interests', 'extracurricular',
  'header',
]);

type ConditionKind =
  | 'max_chars'
  | 'max_words'
  | 'max_items'
  | 'per_item'
  | 'bullets'
  | 'inline'
  | 'reverse'
  | 'hint';

interface ConditionEntry {
  text: string;
  kind: ConditionKind;
}

interface ParsedPlaceholder {
  key: string;
  title: string;
  conditions: ConditionEntry[];
  example: string;
  raw: string;
  start: number;
  end: number;
  warnings: string[];
}

interface SectionPreset {
  key: string;
  label: string;
  title: string;
  conditions: string[];
}

interface LegendEntry {
  key: string;
  label: string;
  source: string;
}

// Sections a new template can declare, mirroring the classic CV layout order.
const SECTION_PRESETS: SectionPreset[] = [
  { key: 'summary', label: 'Summary', title: 'ABOUT ME', conditions: ['3-4 concise sentences', 'max 120 words'] },
  { key: 'experience', label: 'Experience', title: 'PROFESSIONAL EXPERIENCE', conditions: ['reverse chronological order', 'maximum 5 entries', 'each item max 120 characters'] },
  { key: 'education', label: 'Education', title: 'EDUCATION', conditions: ['most recent first', 'maximum 4 entries'] },
  { key: 'projects', label: 'Projects', title: 'ACADEMIC PROJECTS', conditions: ['maximum 5 projects', 'name + one short line each', 'use a bullet list'] },
  { key: 'skills', label: 'Skills', title: 'TECHNICAL SKILLS', conditions: ['max 300 characters', 'use a bullet list', 'maximum 5 items'] },
  { key: 'hackathons', label: 'Hackathons', title: 'HACKATHONS', conditions: ['name (event, year): one-line impact', 'maximum 4 entries'] },
  { key: 'languages', label: 'Languages', title: 'LANGUAGES', conditions: ['name (level)', 'maximum 4 entries'] },
  { key: 'soft-skills', label: 'Soft skills', title: 'SOFT SKILLS', conditions: ['comma-separated, concise', 'maximum 1 line'] },
  { key: 'extracurricular', label: 'Extracurricular', title: 'EXTRACURRICULAR ACTIVITIES', conditions: ['title --- role, dates', 'use a bullet list', 'maximum 5 entries'] },
  { key: 'interests', label: 'Interests', title: 'INTERESTS', conditions: ['comma-separated, concise', 'maximum 1 line'] },
];

// Reference for % KEY: values and what fills them. Aliases accepted: about≈summary,
// experiences≈experience, educations≈education, softskills≈soft-skills.
const SECTION_LEGEND: LegendEntry[] = [
  { key: 'summary', label: 'Summary', source: 'AI-written professional summary (from the job + profile)' },
  { key: 'skills', label: 'Skills', source: 'Skill groups from profile + job-matched skills' },
  { key: 'experience', label: 'Experience', source: 'Profile experience entries' },
  { key: 'education', label: 'Education', source: 'Profile education entries' },
  { key: 'projects', label: 'Projects', source: 'Profile projects' },
  { key: 'hackathons', label: 'Hackathons', source: 'Profile hackathons' },
  { key: 'languages', label: 'Languages', source: 'Profile languages' },
  { key: 'soft-skills', label: 'Soft skills', source: 'Profile soft skills' },
  { key: 'interests', label: 'Interests', source: 'Profile interests' },
  { key: 'extracurricular', label: 'Extracurricular', source: 'Profile extracurricular activities' },
  { key: 'header', label: 'Header', source: 'Name + contact block at the top (not a section)' },
  { key: 'others', label: 'Any other key', source: 'FREE-FORM — AI writes the LaTeX from your example + profile/job data' },
];

const RE_MAX_CHARS = /max(?:imum)?\s*(\d+)\s*(?:chars?|characters)/i;
const RE_MAX_WORDS = /max(?:imum)?\s*(\d+)\s*words?/i;
const RE_MAX_ITEMS = /max(?:imum)?\s*(\d+)\s*(?:items?|entries?|projects?|bullets?|points?)/i;
const RE_PER_ITEM_CHARS = /(?:each|per)\s+item\s+max(?:imum)?\s*(\d+)\s*(?:chars?|characters)/i;
const RE_PER_ITEM_WORDS = /(?:each|per)\s+item\s+max(?:imum)?\s*(\d+)\s*words?/i;
const RE_BULLETS = /bullet|bulleted|list\s+items/i;
const RE_INLINE = /comma|inline|one\s+line|separated/i;
const RE_REVERSE = /reverse.*chronolog|chronolog.*reverse|most\s+recent|newest|latest/i;

const KEY_HINTS: [RegExp, string][] = [
  [/summary|about|profile|objective|intro/i, 'summary'],
  [/experience|career|work|professional|employment/i, 'experience'],
  [/education|academi|formation|school|university|degree/i, 'education'],
  [/project/i, 'projects'],
  [/skill|technolog/i, 'skills'],
  [/hackathon/i, 'hackathons'],
  [/language/i, 'languages'],
  [/soft.?skill/i, 'soft-skills'],
  [/extracurricular|volunteer|activit/i, 'extracurricular'],
  [/interest/i, 'interests'],
];

function conditionKind(text: string): ConditionKind {
  if (RE_PER_ITEM_CHARS.test(text) || RE_PER_ITEM_WORDS.test(text)) return 'per_item';
  if (RE_MAX_CHARS.test(text)) return 'max_chars';
  if (RE_MAX_WORDS.test(text)) return 'max_words';
  if (RE_MAX_ITEMS.test(text)) return 'max_items';
  if (RE_BULLETS.test(text)) return 'bullets';
  if (RE_INLINE.test(text)) return 'inline';
  if (RE_REVERSE.test(text)) return 'reverse';
  return 'hint';
}

function exampleFromBlock(block: string): string {
  let out = '';
  for (const m of block.matchAll(PH_EXAMPLE_RE)) {
    const inner = m[1] ?? '';
    const lines = inner.split('\n').map(l => l.replace(/^%\s?/, ''));
    out += (out ? '\n' : '') + lines.join('\n');
  }
  return out.trim();
}

function parsePlaceholders(content: string): ParsedPlaceholder[] {
  const out: ParsedPlaceholder[] = [];
  if (!content) return out;
  const seen = new Set<string>();
  for (const match of content.matchAll(PH_BLOCK_RE)) {
    const block = match[0];
    const start = match.index ?? 0;
    const end = start + block.length;
    const key = block.match(PH_KEY_RE)?.[1]?.trim() ?? '';
    const title = block.match(PH_TITLE_RE)?.[1]?.trim() ?? '';
    const example = exampleFromBlock(block);
    const conditions: ConditionEntry[] = [];
    for (const cond of block.matchAll(PH_COND_RE)) {
      const text = cond[1].trim();
      if (text) conditions.push({ text, kind: conditionKind(text) });
    }
    const warnings: string[] = [];
    if (!key) warnings.push('missing KEY');
    else {
      if (seen.has(key)) warnings.push(`duplicate key "${key}"`);
      if (!KNOWN_SECTION_KEYS.has(key.toLowerCase())) {
        if (example) warnings.push('free-form — the AI writes this section from your example');
        else warnings.push('no data source and no example — the section won\'t be filled');
      }
    }
    seen.add(key);
    if (!title) warnings.push('missing TITLE');
    if (conditions.length === 0) warnings.push('no conditions');
    out.push({ key, title, conditions, example, raw: block, start, end, warnings });
  }
  return out;
}

function placeholderBlock(key: string, title: string, conditions: string[], example = ''): string {
  const lines = [
    '%=== SECTION PLACEHOLDER ===',
    `% KEY: ${key}`,
    `% TITLE: ${title}`,
    ...conditions.map(c => `% COND: ${c}`),
  ];
  const trimmed = example.trim();
  if (trimmed) {
    lines.push('%=== EXAMPLE ===');
    for (const ln of trimmed.split('\n')) lines.push(ln ? `% ${ln}` : '%');
    lines.push('%=== END EXAMPLE ===');
  }
  lines.push('%=== END PLACEHOLDER ===');
  return lines.join('\n');
}

function sectionTitleFromSelection(text: string): string {
  const m = text.match(/\\section(?:\*)?\{([^}]*)\}/);
  return m?.[1]?.trim() ?? '';
}

function suggestKey(title: string): string {
  for (const [re, key] of KEY_HINTS) if (re.test(title)) return key;
  return '';
}

function findEnclosingSection(text: string, start: number, end: number): [number, number] | null {
  const re = /\\section(?:\*)?\{/g;
  let m: RegExpExecArray | null;
  let matchStart = -1;
  let braceOpen = -1;
  while ((m = re.exec(text)) !== null && m.index < start) {
    matchStart = m.index;
    braceOpen = m.index + m[0].length - 1;
  }
  if (matchStart < 0 || braceOpen < 0) return null;
  let depth = 0;
  for (let i = braceOpen; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return [matchStart, i + 1];
    }
  }
  return null;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}