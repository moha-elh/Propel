import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CompanyService, CompanyDto } from '@app/services/company.service';
import {
  CompanyResearchService,
  CompanyResearchDataType,
  COMPANY_RESEARCH_DATA_TYPES,
} from '@app/services/company-research.service';
import { ToastService } from '@app/services/toast.service';
import { extractError } from '@app/shared/error-utils';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';

interface ResearchStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  message?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-company-research',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RefreshButtonComponent],
  templateUrl: './company-research.component.html',
  styleUrl: './company-research.component.scss',
})
export class CompanyResearchComponent implements OnInit {
  private readonly companiesApi = inject(CompanyService);
  private readonly researchApi = inject(CompanyResearchService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  dataTypeOptions = COMPANY_RESEARCH_DATA_TYPES;

  companies = signal<CompanyDto[]>([]);
  loading = signal(true);

  selectedIds = signal<Set<string>>(new Set());
  selectedTypes = signal<Set<CompanyResearchDataType>>(
    new Set(COMPANY_RESEARCH_DATA_TYPES.map(t => t.key)),
  );
  statuses = signal<Record<string, ResearchStatus>>({});

  search = signal('');
  sectorFilter = signal('');
  websiteFilter = signal<'all' | 'yes' | 'no'>('all');
  researchedFilter = signal<'all' | 'yes' | 'no'>('all');

  sortBy = signal<'name' | 'researched' | 'applied'>('name');
  private readonly sortDir = 'desc';

  sectors = signal<string[]>([]);

  page = signal(1);
  total = signal(0);
  private readonly pageSize = 20;
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  refreshing = signal(false);

  hasActiveFilters = computed(() =>
    !!this.search().trim() ||
    !!this.sectorFilter() ||
    this.websiteFilter() !== 'all' ||
    this.researchedFilter() !== 'all');

  ngOnInit(): void {
    void this.loadSectors();
    void this.load();
  }

  async loadSectors(): Promise<void> {
    try {
      const res = await this.companiesApi.getCompanySectors();
      this.sectors.set(res.data ?? []);
    } catch {
      this.sectors.set([]);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.companiesApi.getCompanies({
        search: this.search().trim() || undefined,
        sector: this.sectorFilter() || undefined,
        hasWebsite: this.websiteFilter() === 'all' ? undefined : this.websiteFilter() === 'yes',
        researched: this.researchedFilter() === 'all' ? undefined : this.researchedFilter() === 'yes',
        sortBy: this.sortBy(),
        sortDir: this.sortBy() === 'name' ? 'asc' : this.sortDir,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.total.set(res.data?.total ?? 0);

      const maxPage = Math.max(1, Math.ceil(this.total() / this.pageSize));
      if (this.page() > maxPage) {
        this.page.set(maxPage);
        this.loading.set(false);
        await this.load();
        return;
      }

      this.companies.set(res.data?.items ?? []);
    } catch {
      this.toast.error('Failed to load companies');
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  onRefresh(): void {
    this.refreshing.set(true);
    void this.load();
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 300);
  }

  onFilterChange(): void {
    this.page.set(1);
    void this.load();
  }

  onSortByChange(value: 'name' | 'researched' | 'applied'): void {
    this.sortBy.set(value);
    this.page.set(1);
    void this.load();
  }

  resetFilters(): void {
    this.search.set('');
    this.sectorFilter.set('');
    this.websiteFilter.set('all');
    this.researchedFilter.set('all');
    this.sortBy.set('name');
    this.page.set(1);
    void this.load();
  }

  goToPage(target: number): void {
    const clamped = Math.min(Math.max(1, target), this.pageCount());
    if (clamped === this.page()) return;
    this.page.set(clamped);
    void this.load();
  }

  visiblePages(): number[] {
    const count = this.pageCount();
    const current = this.page();
    if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
    const pages = new Set<number>([1, count, current - 1, current, current + 1]);
    if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
    if (current >= count - 2) [count - 3, count - 2, count - 1].forEach(p => pages.add(p));
    const sorted = [...pages].filter(p => p >= 1 && p <= count).sort((a, b) => a - b);
    const out: number[] = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev > 1) out.push(-1);
      out.push(p);
      prev = p;
    }
    return out;
  }

  pageSelectedCount(): number {
    return this.companies().filter(c => this.selectedIds().has(c.id)).length;
  }

  toggleSelect(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  selectAllCurrentPage(): void {
    const onPage = this.companies().filter(c => !!c.websiteUrl);
    const next = new Set(this.selectedIds());
    const allSelected = onPage.length > 0 && onPage.every(c => next.has(c.id));
    if (allSelected) onPage.forEach(c => next.delete(c.id));
    else onPage.forEach(c => next.add(c.id));
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  toggleType(key: CompanyResearchDataType): void {
    const next = new Set(this.selectedTypes());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedTypes.set(next);
  }

  allTypesSelected(): boolean {
    return this.selectedTypes().size === this.dataTypeOptions.length;
  }

  selectAllTypes(): void {
    this.selectedTypes.set(new Set(this.dataTypeOptions.map(t => t.key)));
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  canRun(): boolean {
    const sets = this.statuses();
    return this.selectedIds().size > 0 &&
      this.selectedTypes().size > 0 &&
      !Object.values(sets).some(s => s.state === 'running');
  }

  async run(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    const types = [...this.selectedTypes()];
    if (types.length === 0) return;

    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      const company = this.companies().find(c => c.id === id);
      if (!company) continue;

      if (!company.websiteUrl) {
        this.updateStatus(id, { state: 'error', message: 'No website saved — edit the company to add one first.' });
        failed++;
        continue;
      }

      this.updateStatus(id, { state: 'running' });
      try {
        const res = await this.researchApi.research(id, types);
        const updated = res.data;
        if (updated) {
          this.companies.set(this.companies().map(c => (c.id === id ? updated : c)));
        }
        this.updateStatus(id, {
          state: 'done',
          message: res.message ?? 'Enriched from website',
          updatedAt: updated?.researchUpdatedAt ?? undefined,
        });
        succeeded++;
      } catch (e) {
        const msg = extractError(e);
        this.updateStatus(id, { state: 'error', message: msg || 'Research failed' });
        failed++;
      }
    }

    if (succeeded > 0) {
      this.toast.success(`Research complete for ${succeeded} company${succeeded === 1 ? '' : 's'}`);
    }
    this.selectedIds.set(new Set());
    void this.load();
  }

  openDetail(company: CompanyDto): void {
    void this.router.navigate(['/company-research', company.id]);
  }

  private updateStatus(id: string, status: ResearchStatus): void {
    const next = { ...this.statuses() };
    next[id] = status;
    this.statuses.set(next);
  }

  statusFor = (id: string): ResearchStatus => this.statuses()[id] ?? { state: 'idle' };

  isRunning = (id: string): boolean => this.statusFor(id).state === 'running';

  formatDate(iso?: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  hostOf(url?: string | null): string {
    if (!url) return '';
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  coSub(location?: string | null, sector?: string | null): string {
    return [location, sector].filter(Boolean).join(' · ');
  }
}