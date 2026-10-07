import { Component, signal, computed, inject, OnInit, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { RouterLink, Router } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import {
  ApplicationResponseDto,
  ApplicationStatisticsDto,
  ApplicationStatus,
  ApplicationPriority,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRIORITY_COLORS,
} from '@app/models/application.model';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';

export type SortKey = 'applied' | 'updated' | 'company' | 'priority';
export type SortDir = 'asc' | 'desc';

interface SortOption { value: string; label: string; }

@Component({
  selector: 'app-applications-list',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink, CompanyLogoComponent],
  templateUrl: './applications-list.component.html',
  styleUrl: './applications-list.component.scss',
})
export class ApplicationsListComponent implements OnInit {
  private appService = inject(ApplicationService);
  protected router = inject(Router);

  applications = signal<ApplicationResponseDto[]>([]);
  statistics = signal<ApplicationStatisticsDto>({ total: 0, saved: 0, applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, accepted: 0, rejected: 0, withdrawn: 0 });
  loading = signal(true);
  page = signal(1);
  pageSize = signal(15);
  totalItems = signal(0);
  searchQuery = signal('');

  selectedStatuses = signal<Set<ApplicationStatus>>(new Set());
  selectedPriorities = signal<Set<ApplicationPriority>>(new Set());
  appliedFrom = signal('');
  appliedTo = signal('');
  updatedFrom = signal('');
  updatedTo = signal('');

  filterOpen = signal(false);
  sortKey = signal<SortKey>('applied');
  sortDir = signal<SortDir>('desc');

  /** Each sort option spells out field + direction so nothing is ambiguous. */
  readonly SORT_OPTIONS: SortOption[] = [
    { value: 'applied:desc',  label: 'Applied: newest first' },
    { value: 'applied:asc',   label: 'Applied: oldest first' },
    { value: 'updated:desc',  label: 'Last updated: recent first' },
    { value: 'updated:asc',   label: 'Last updated: oldest first' },
    { value: 'company:asc',   label: 'Company name: A → Z' },
    { value: 'company:desc',  label: 'Company name: Z → A' },
    { value: 'priority:desc', label: 'Priority: high → low' },
    { value: 'priority:asc',  label: 'Priority: low → high' },
  ];

  sortValue = computed(() => `${this.sortKey()}:${this.sortDir()}`);

  /** Active filters rendered as removable chips under the toolbar. */
  activeChips = computed(() => {
    const chips: { label: string; clear: () => void }[] = [];
    for (const s of this.selectedStatuses())
      chips.push({ label: `Status: ${STATUS_LABELS[s]}`, clear: () => { this.toggleStatus(s); this.reload(); } });
    for (const p of this.selectedPriorities())
      chips.push({ label: `Priority: ${PRIORITY_LABELS[p]}`, clear: () => { this.togglePriority(p); this.reload(); } });
    const range = (label: string, from: WritableSignal<string>, to: WritableSignal<string>) => {
      if (!from() && !to()) return;
      const txt = from() && to() ? `${this.formatDate(from())} – ${this.formatDate(to())}`
        : from() ? `after ${this.formatDate(from())}` : `before ${this.formatDate(to())}`;
      chips.push({ label: `${label} ${txt}`, clear: () => { from.set(''); to.set(''); this.reload(); } });
    };
    range('Applied', this.appliedFrom, this.appliedTo);
    range('Updated', this.updatedFrom, this.updatedTo);
    return chips;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  visiblePages = computed(() => {
    const cur = this.page(), total = this.totalPages();
    const pages: number[] = [];
    const start = Math.max(1, cur - 2), end = Math.min(total, cur + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  itemRange = computed(() => {
    const p = this.page(), ps = this.pageSize(), total = this.totalItems();
    if (total === 0) return '0 of 0';
    const from = (p - 1) * ps + 1;
    const to = Math.min(p * ps, total);
    return `${from}–${to} of ${total}`;
  });

  activeFilterCount = computed(() => this.activeChips().length);

  toggleStatus = (s: ApplicationStatus) => this.selectedStatuses.update(set => {
    const next = new Set(set);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  togglePriority = (p: ApplicationPriority) => this.selectedPriorities.update(set => {
    const next = new Set(set);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });

  protected readonly STATUS_LABELS = STATUS_LABELS;
  protected readonly STATUS_COLORS = STATUS_COLORS;
  protected readonly PRIORITY_LABELS = PRIORITY_LABELS;
  protected readonly PRIORITY_COLORS = PRIORITY_COLORS;
  protected readonly ALL_STATUSES = STATUS_ORDER;
  protected readonly ALL_PRIORITIES = PRIORITY_ORDER;
  protected readonly Math = Math;

  ngOnInit() { this.loadData(); }

  private requestSeq = 0;

  async loadData() {
    const seq = ++this.requestSeq;
    // Keep current rows visible while refetching so typing doesn't flash the table.
    if (this.applications().length === 0) this.loading.set(true);
    try {
      const statusArr = this.selectedStatuses().size > 0 ? [...this.selectedStatuses()] : undefined;
      const priorityArr = this.selectedPriorities().size > 0 ? [...this.selectedPriorities()] : undefined;
      const [listRes, statsRes] = await Promise.all([
        this.appService.getAll({
          page: this.page(), pageSize: this.pageSize(),
          statuses: statusArr,
          priorities: priorityArr,
          search: this.searchQuery() || undefined,
          appliedFrom: this.appliedFrom() || undefined,
          appliedTo: this.appliedTo() || undefined,
          updatedFrom: this.updatedFrom() || undefined,
          updatedTo: this.updatedTo() || undefined,
          sortBy: this.sortKey(),
          sortDir: this.sortDir(),
        }),
        this.appService.getStatistics(),
      ]);
      if (seq !== this.requestSeq) return; // a newer request superseded this one
      if (listRes.success && listRes.data) {
        this.applications.set(listRes.data.items);
        this.totalItems.set(listRes.data.total);
      }
      if (statsRes.success && statsRes.data) this.statistics.set(statsRes.data);
    } catch (err) { console.error(err); }
    finally { this.loading.set(false); }
  }

  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Live search: refetch shortly after the user stops typing. */
  onSearchInput(value: string) {
    this.searchQuery.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 200);
  }

  /** Filters apply instantly; no separate Apply step. */
  reload() { this.page.set(1); this.loadData(); }

  setSort(value: string) {
    const [key, dir] = value.split(':') as [SortKey, SortDir];
    this.sortKey.set(key);
    this.sortDir.set(dir);
    this.reload();
  }

  clearFilters() {
    this.selectedStatuses.set(new Set());
    this.selectedPriorities.set(new Set());
    this.appliedFrom.set('');
    this.appliedTo.set('');
    this.updatedFrom.set('');
    this.updatedTo.set('');
    this.reload();
  }

  changePage(p: number) { if (p >= 1 && p <= this.totalPages()) { this.page.set(p); this.loadData(); } }
  changePageSize(value: string) {
    const ps = parseInt(value, 10);
    this.pageSize.set(ps);
    this.page.set(1);
    this.loadData();
  }

  async onDelete(id: string) {
    if (!confirm('Delete this application?')) return;
    try { await this.appService.delete(id); this.loadData(); } catch { }
  }

  async onInlineStatusChange(app: ApplicationResponseDto, value: string) {
    const newStatus = value as ApplicationStatus;
    try {
      const res = await this.appService.updateStatus(app.id, { status: newStatus });
      if (res.success) this.loadData();
    } catch { }
  }

  getStatusLabel(s: string) { return STATUS_LABELS[s as ApplicationStatus] || s; }

  priorityColor(p?: string): string {
    return PRIORITY_COLORS[p as ApplicationPriority] ?? PRIORITY_COLORS.MEDIUM;
  }

  formatDate(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  logoBg(name: string): string {
    const palette = [
      'oklch(0.93 0.04 250)', 'oklch(0.93 0.04 160)', 'oklch(0.93 0.04 65)',
      'oklch(0.93 0.04 300)', 'oklch(0.93 0.04 25)',  'oklch(0.94 0.02 80)',
    ];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }
}
