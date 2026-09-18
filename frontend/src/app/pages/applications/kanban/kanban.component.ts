import { Component, signal, inject, OnInit, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import {
  ApplicationResponseDto,
  ApplicationStatus,
  ActivityItemDto,
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from '@app/models/application.model';
import { ApplicationsListComponent } from '../list/applications-list.component';
import { SheetImportDialogComponent } from '@app/shared/components/sheet-import-dialog/sheet-import-dialog.component';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';

interface Column {
  status: ApplicationStatus;
  label: string;
  colorVar: string;
  items: ApplicationResponseDto[];
}

const COLUMNS: { status: ApplicationStatus; label: string; colorVar: string }[] =
  STATUS_ORDER.map(status => ({
    status,
    label: STATUS_LABELS[status],
    colorVar: status.toLowerCase(),
  }));

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, RouterLink, ApplicationsListComponent, SheetImportDialogComponent, RefreshButtonComponent, CompanyLogoComponent],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.scss',
})
export class KanbanComponent implements OnInit {
  private appService = inject(ApplicationService);

  columns = signal<Column[]>(COLUMNS.map(c => ({ ...c, items: [] })));
  loading = signal(true);
  refreshing = signal(false);
  view = signal<'board' | 'list' | 'activity' | 'saved'>((localStorage.getItem('kanban-view') as 'board' | 'list' | 'activity' | 'saved') || 'board');

  constructor() {
    effect(() => localStorage.setItem('kanban-view', this.view()));
  }

  activityFeed = signal<ActivityItemDto[]>([]);
  importOpen = signal(false);
  activityTotal = signal(0);
  activityLoading = signal(false);

  totalApps = computed(() => this.columns().reduce((s, c) => s + c.items.length, 0));

  savedApps = computed(() =>
    this.columns().flatMap(c => c.items).filter(a => a.status === 'SAVED')
  );

  ngOnInit() { this.loadApps(); }

  async loadApps() {
    this.loading.set(true);
    try {
      const res = await this.appService.getAll({ pageSize: 200 });
      if (res.success && res.data) {
        const all = res.data.items;
        this.columns.set(COLUMNS.map(col => ({
          ...col,
          items: all.filter(a => a.status === col.status),
        })));
      }
    } catch { } finally { this.loading.set(false); this.refreshing.set(false); }
  }

  onRefresh() { this.refreshing.set(true); this.loadApps(); }

  async loadActivity() {
    if (this.activityFeed().length > 0) return;
    this.activityLoading.set(true);
    try {
      const res = await this.appService.getActivity({ limit: 50 });
      if (res.success && res.data) {
        this.activityFeed.set(res.data.items);
        this.activityTotal.set(res.data.total);
      }
    } catch { } finally { this.activityLoading.set(false); }
  }

  async toggleSave(app: ApplicationResponseDto, event: Event) {
    event.stopPropagation();
    try {
      await this.appService.toggleSave(app.id);
      await this.loadApps();
    } catch { }
  }

  savedDate(a: ApplicationResponseDto): string {
    return a.appliedAt ?? a.updatedAt;
  }

  onDragStart(event: DragEvent, app: ApplicationResponseDto) {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ id: app.id, status: app.status }));
    (event.target as HTMLElement).classList.add('dragging');
  }

  onDragEnd(event: DragEvent) {
    (event.target as HTMLElement).classList.remove('dragging');
  }

  onDragOver(event: DragEvent) { event.preventDefault(); }

  async onDrop(event: DragEvent, targetStatus: ApplicationStatus) {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;
    const { id, status: fromStatus } = JSON.parse(data);
    if (fromStatus === targetStatus) return;

    const col = this.columns().find(c => c.status === fromStatus);
    const app = col?.items.find(a => a.id === id);
    if (!app) return;

    this.columns.update(cols => cols.map(c => {
      if (c.status === fromStatus) return { ...c, items: c.items.filter(a => a.id !== id) };
      if (c.status === targetStatus) return { ...c, items: [{ ...app, status: targetStatus }, ...c.items] };
      return c;
    }));

    try {
      await this.appService.updateStatus(id, { status: targetStatus });
    } catch {
      this.loadApps();
    }
  }

  relativeTime(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
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

  logoText(name: string): string { return name.slice(0, 2).toUpperCase(); }

  protected readonly PRIORITY_LABELS = PRIORITY_LABELS;

  priorityColor(p?: string): string {
    return PRIORITY_COLORS[p as 'LOW' | 'MEDIUM' | 'HIGH'] ?? PRIORITY_COLORS.MEDIUM;
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getStatusLabel(s: string) { return STATUS_LABELS[s as ApplicationStatus] || s; }
}
