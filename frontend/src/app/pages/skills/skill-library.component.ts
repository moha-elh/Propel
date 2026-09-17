import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '@env/environment';
import { TaxonomyNode } from '@app/models/category.model';
import { ApiResponse } from '@app/models/application.model';
import { CategoryService } from '@app/services/category.service';
import { ToastService } from '@app/services/toast.service';
import { ConfirmService } from '@app/services/confirm.service';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { SheetImportDialogComponent } from '@app/shared/components/sheet-import-dialog/sheet-import-dialog.component';

interface SkillRow {
  id: string;
  name: string;
  level: string;
  category: string;
}

const LEVEL_DOTS: Record<string, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
  Expert: 4,
};

const DOT_INDEXES = [0, 1, 2, 3, 4];

/** A category container lists this many skills before offering "Show all N". */
const EXPAND_LIMIT = 12;

@Component({
  selector: 'app-skill-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, RefreshButtonComponent, SheetImportDialogComponent],
  templateUrl: './skill-library.component.html',
  styleUrl: './skill-library.component.scss',
})
export class SkillLibraryComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private categoryService = inject(CategoryService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  categories = signal<TaxonomyNode[]>([]);
  skills = signal<SkillRow[]>([]);
  collapsed = signal<Set<string>>(new Set());
  search = signal('');
  loading = signal(false);
  newCategory = '';
  dots = DOT_INDEXES;
  importOpen = signal(false);
  /** Containers that opted into showing every skill row (beyond EXPAND_LIMIT). */
  expanded = signal<Set<string>>(new Set());

  // ── Bulk management ─────────────────────────────────────────────────────
  manageMode = signal(false);
  selected = signal<Set<string>>(new Set());
  busyBulk = signal(false);
  showMoveDialog = signal(false);
  newMoveName = '';
  moveChoice = signal<{ kind: 'existing' | 'new' | 'uncategorized'; name?: string } | null>(null);

  readonly selectedSkills = computed(() => {
    const sel = this.selected();
    if (sel.size === 0) return [];
    const byId = new Map(this.skills().map(s => [s.id, s]));
    return [...sel].map(id => byId.get(id)).filter((s): s is SkillRow => s !== undefined);
  });

  readonly allCollapsed = computed(
    () => this.categories().length > 0 && this.categories().every(c => this.collapsed().has(c.id)),
  );

  /** sourceId -> node ids (tag grouping for the whole skills scope). */
  private tagBySkill = new Map<string, string[]>();

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.skills();
    return this.skills().filter(s => s.name.toLowerCase().includes(q));
  });

  readonly containers = computed(() => {
    const byId = new Map<string, string>();
    this.categories().forEach(c => byId.set(c.id, c.name));
    const byNameId = new Map<string, string>();
    this.categories().forEach(c => byNameId.set(c.name.trim().toLowerCase(), c.id));

    const groups: { id: string; name: string; skills: SkillRow[] }[] = [];
    this.categories().forEach(c => groups.push({ id: c.id, name: c.name, skills: [] }));
    const bucketById = new Map<string, SkillRow[]>();
    groups.forEach(g => bucketById.set(g.id, g.skills));
    const uncategorized: SkillRow[] = [];

    for (const s of this.filtered()) {
      const nodeIds = this.tagBySkill.get(s.id) ?? [];
      let hit = nodeIds.find(id => byId.has(id));
      if (!hit && s.category) {
        const byName = byNameId.get(s.category.trim().toLowerCase());
        if (byName) hit = byName;
      }
      if (hit) {
        bucketById.get(hit)?.push(s);
      } else {
        uncategorized.push(s);
      }
    }

    groups.forEach(g => g.skills.sort((a, b) => a.name.localeCompare(b.name)));
    uncategorized.sort((a, b) => a.name.localeCompare(b.name));

    if (uncategorized.length) {
      groups.push({ id: 'uncategorized', name: 'Uncategorized', skills: uncategorized });
    }
    return groups;
  });

  readonly totalSkills = computed(() => this.skills().length);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.loadCategoriesAndSkills();
  }

  private async loadCategoriesAndSkills(): Promise<void> {
    try {
      const [treeResult, skillsResult, tagsResult] = await Promise.allSettled([
        this.categoryService.getTree('skills'),
        firstValueFrom(this.http.get<any>(`${environment.apiUrl}/api/user-content/skills`, { withCredentials: true })),
        this.categoryService.getTagsForScope('skills'),
      ]);

      const tree = treeResult.status === 'fulfilled' ? treeResult.value : null;
      const skillRes = skillsResult.status === 'fulfilled' ? skillsResult.value : null;
      const tags = tagsResult.status === 'fulfilled' ? tagsResult.value : null;

      const raw = skillRes?.data ?? skillRes ?? [];
      const rows: SkillRow[] = Array.isArray(raw)
        ? raw.map((s: any) => ({
            id: String(s.id ?? s.Id),
            name: s.name ?? s.Name ?? '',
            level: (s.level ?? s.Level ?? '').trim(),
            category: (s.category ?? s.Category ?? '').trim(),
          }))
        : [];

      const tagMap = new Map<string, string[]>();
      (tags || []).forEach((t: any) => {
        if (t?.sourceId) tagMap.set(String(t.sourceId), (t.nodeIds || []).map(String));
      });

      this.tagBySkill = tagMap;
      this.categories.set(tree || []);
      this.skills.set(rows.filter(r => r.id.length > 0));
    } catch (err) {
      console.error('Failed to load skills', err);
      this.toast.error('Could not load skills.');
    } finally {
      this.loading.set(false);
    }
  }

  isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  toggleCollapsed(id: string): void {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.collapsed.set(next);
  }

  toggleAll(): void {
    if (this.allCollapsed()) {
      this.collapsed.set(new Set());
    } else {
      this.collapsed.set(new Set(this.categories().map(c => c.id)));
    }
  }

  visibleSkills(group: { id: string; skills: SkillRow[] }): SkillRow[] {
    if (this.expanded().has(group.id) || group.skills.length <= EXPAND_LIMIT) return group.skills;
    return group.skills.slice(0, EXPAND_LIMIT);
  }

  toggleMore(groupId: string): void {
    const next = new Set(this.expanded());
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    this.expanded.set(next);
  }

  readonly expandLimit = EXPAND_LIMIT;

  dotFill(level: string, i: number): boolean {
    const filled = LEVEL_DOTS[level] ?? 0;
    return i < filled;
  }

  addSkill(category?: string): void {
    this.router.navigate(['/my-career', 'skills', 'add'], category ? { queryParams: { category } } : undefined);
  }

  openSkill(id: string): void {
    this.router.navigate(['/my-career', 'skills', id]);
  }

  rowClick(ev: MouseEvent, id: string): void {
    if (this.manageMode()) {
      ev.preventDefault();
      ev.stopPropagation();
      this.toggleSelect(id);
      return;
    }
    this.openSkill(id);
  }

  enterManage(): void {
    this.manageMode.set(true);
    this.selected.set(new Set());
  }

  exitManage(): void {
    this.manageMode.set(false);
    this.selected.set(new Set());
    this.showMoveDialog.set(false);
    this.moveChoice.set(null);
  }

  toggleSelect(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  selectAllSkills(): void {
    this.selected.set(new Set(this.skills().map(s => s.id)));
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  async deleteSelected(): Promise<void> {
    const sel = this.selectedSkills();
    if (sel.length === 0) return;
    if (!(await this.confirm.confirm({
      message: `Delete ${sel.length} skill${sel.length === 1 ? '' : 's'}? Category tags are removed too.`,
      variant: 'danger',
    }))) return;
    this.busyBulk.set(true);
    try {
      await firstValueFrom(
        this.http.post<ApiResponse<{ deleted: number }>>(
          `${environment.apiUrl}/api/user-content/skills/bulk-delete`,
          { ids: sel.map(s => s.id) },
          { withCredentials: true },
        ),
      );
      this.toast.success(`${sel.length} skill${sel.length === 1 ? '' : 's'} deleted`);
      this.exitManage();
      this.loadCategoriesAndSkills();
    } catch (err) {
      const msg = this.errorText(err);
      this.toast.error(msg || 'Could not delete skills.');
    } finally {
      this.busyBulk.set(false);
    }
  }

  openMoveDialog(): void {
    if (this.selectedSkills().length === 0) return;
    this.moveChoice.set(null);
    this.newMoveName = '';
    this.showMoveDialog.set(true);
  }

  closeMoveDialog(): void {
    this.showMoveDialog.set(false);
    this.moveChoice.set(null);
  }

  chooseExisting(name: string): void {
    this.moveChoice.set({ kind: 'existing', name });
  }

  chooseUncategorized(): void {
    this.moveChoice.set({ kind: 'uncategorized' });
  }

  chooseNew(): void {
    this.moveChoice.set({ kind: 'new', name: this.newMoveName.trim() });
  }

  moveSelectedToCategory(category: string): void {
    const sel = this.selectedSkills();
    if (sel.length === 0) return;
    this.busyBulk.set(true);
    firstValueFrom(
      this.http.post<ApiResponse<{ updated: number; category?: string | null }>>(
        `${environment.apiUrl}/api/user-content/skills/category`,
        { ids: sel.map(s => s.id), category },
        { withCredentials: true },
      ),
    )
      .then(() => {
        this.toast.success(`${sel.length} skill${sel.length === 1 ? '' : 's'} moved${category ? ` to "${category}"` : ' to Uncategorized'}`);
        this.closeMoveDialog();
        this.exitManage();
        this.loadCategoriesAndSkills();
      })
      .catch(err => {
        const msg = this.errorText(err);
        this.toast.error(msg || 'Could not move skills.');
      })
      .finally(() => this.busyBulk.set(false));
  }

  applyMoveChoice(): void {
    const choice = this.moveChoice();
    if (!choice) return;
    if (choice.kind === 'new') {
      if (!choice.name) {
        this.toast.info('Type a category name first.');
        return;
      }
      this.moveSelectedToCategory(choice.name);
      return;
    }
    this.moveSelectedToCategory(choice.kind === 'existing' ? (choice.name ?? '') : '');
  }

  createCategory(): void {
    const name = this.newCategory.trim();
    if (!name) {
      this.toast.info('Type a category name first.');
      return;
    }
    this.categoryService
      .createNode('skills', name)
      .then(() => {
        this.newCategory = '';
        this.loadCategoriesAndSkills();
      })
      .catch(err => {
        const msg = this.errorText(err);
        this.toast.error(msg || 'Could not create category.');
      });
  }

  async deleteCategory(id: string, name: string): Promise<void> {
    if (!(await this.confirm.confirm({ message: `Delete category "${name}"?`, variant: 'danger' }))) return;
    this.categoryService
      .deleteNode(id)
      .then(() => this.loadCategoriesAndSkills())
      .catch(err => {
        const msg = this.errorText(err);
        this.toast.error(msg || 'Could not delete category.');
      });
  }

  private errorText(err: any): string {
    const e = err?.error;
    if (typeof e === 'string') return e;
    if (e?.message) return String(e.message);
    if (e?.errors) return String(e.errors);
    return err?.message ? String(err.message) : '';
  }
}