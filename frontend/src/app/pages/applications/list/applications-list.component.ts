import { Component, signal, computed, inject, OnInit } from '@angular/core';
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
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from '@app/models/application.model';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';

@Component({
  selector: 'app-applications-list',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink, RefreshButtonComponent],
  templateUrl: './applications-list.component.html',
  styleUrl: './applications-list.component.scss',
})
export class ApplicationsListComponent implements OnInit {
  private appService = inject(ApplicationService);
  protected router = inject(Router);

  applications = signal<ApplicationResponseDto[]>([]);
  statistics = signal<ApplicationStatisticsDto>({ total: 0, saved: 0, applied: 0, screening: 0, interview: 0, offer: 0, accepted: 0, rejected: 0, withdrawn: 0 });
  loading = signal(true);
  page = signal(1);
  pageSize = signal(15);
  totalItems = signal(0);
  searchQuery = signal('');

  selectedStatuses = signal<Set<ApplicationStatus>>(new Set());
  appliedFrom = signal('');
  appliedTo = signal('');
  updatedFrom = signal('');
  updatedTo = signal('');

  filterOpen = signal(false);
  refreshing = signal(false);

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

  activeFilterCount = computed(() => {
    let count = this.selectedStatuses().size;
    if (this.appliedFrom()) count++;
    if (this.appliedTo()) count++;
    if (this.updatedFrom()) count++;
    if (this.updatedTo()) count++;
    return count;
  });

  toggleStatus = (s: ApplicationStatus) => this.selectedStatuses.update(set => {
    const next = new Set(set);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  protected readonly STATUS_LABELS = STATUS_LABELS;
  protected readonly PRIORITY_LABELS = PRIORITY_LABELS;
  protected readonly ALL_STATUSES = STATUS_ORDER;
  protected readonly Math = Math;

  ngOnInit() { this.loadData(); }

  async loadData() {
    this.loading.set(true);
    try {
      const statusArr = this.selectedStatuses().size > 0 ? [...this.selectedStatuses()] : undefined;
      const [listRes, statsRes] = await Promise.all([
        this.appService.getAll({
          page: this.page(), pageSize: this.pageSize(),
          statuses: statusArr,
          search: this.searchQuery() || undefined,
          appliedFrom: this.appliedFrom() || undefined,
          appliedTo: this.appliedTo() || undefined,
          updatedFrom: this.updatedFrom() || undefined,
          updatedTo: this.updatedTo() || undefined,
        }),
        this.appService.getStatistics(),
      ]);
      if (listRes.success && listRes.data) {
        this.applications.set(listRes.data.items);
        this.totalItems.set(listRes.data.total);
      }
      if (statsRes.success && statsRes.data) this.statistics.set(statsRes.data);
    } catch (err) { console.error(err); }
    finally { this.loading.set(false); this.refreshing.set(false); }
  }

  onRefresh() { this.refreshing.set(true); this.loadData(); }

  onSearch() { this.page.set(1); this.loadData(); this.filterOpen.set(false); }

  applyFilters() { this.page.set(1); this.loadData(); this.filterOpen.set(false); }

  clearFilters() {
    this.selectedStatuses.set(new Set());
    this.appliedFrom.set('');
    this.appliedTo.set('');
    this.updatedFrom.set('');
    this.updatedTo.set('');
    this.page.set(1);
    this.loadData();
    this.filterOpen.set(false);
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
