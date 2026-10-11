import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { ToastService } from '@app/services/toast.service';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';
import {
  ApplicationResponseDto, ApplicationStatus, AWAITING_STATUSES, STATUS_LABELS, STATUS_COLORS, daysQuiet,
} from '@app/models/application.model';

@Component({
  selector: 'app-follow-ups',
  standalone: true,
  imports: [CommonModule, RouterLink, CompanyLogoComponent],
  templateUrl: './follow-ups.component.html',
  styleUrl: './follow-ups.component.scss',
})
export class FollowUpsComponent implements OnInit {
  private appService = inject(ApplicationService);
  private toast = inject(ToastService);

  readonly THRESHOLDS = [7, 14, 30];
  // Loosely typed: the row template's context variable is `any`.
  readonly statusLabels: Record<string, string> = STATUS_LABELS;
  readonly statusColors: Record<string, string> = STATUS_COLORS;
  readonly daysQuiet = daysQuiet;

  apps = signal<ApplicationResponseDto[]>([]);
  loading = signal(true);
  busy = signal<string | null>(null);
  threshold = signal(7);

  due = computed(() => this.apps()
    .filter(a => daysQuiet(a) >= this.threshold())
    .sort((a, b) => daysQuiet(b) - daysQuiet(a)));

  /** Quiet but not yet past the threshold, so the user sees what's coming. */
  soon = computed(() => this.apps()
    .filter(a => daysQuiet(a) < this.threshold())
    .sort((a, b) => daysQuiet(b) - daysQuiet(a)));

  ngOnInit() { this.load(); }

  async load() {
    try {
      const res = await this.appService.getAll({ statuses: AWAITING_STATUSES, pageSize: 500 });
      if (res.success && res.data) this.apps.set(res.data.items);
    } catch {
      this.toast.error('Could not load applications');
    } finally { this.loading.set(false); }
  }

  /** Follow-up done outside the mailbox: a self-transition resets the quiet clock and lands in the history. */
  markFollowedUp(a: ApplicationResponseDto) {
    return this.act(a, a.status, 'Follow-up sent', `Logged a follow-up for ${a.companyName}`);
  }

  markGhosted(a: ApplicationResponseDto) {
    return this.act(a, 'REJECTED', 'No response, closed from follow-ups', `${a.companyName} moved to Rejected`);
  }

  private async act(a: ApplicationResponseDto, status: ApplicationStatus, comment: string, done: string) {
    this.busy.set(a.id);
    try {
      const res = await this.appService.updateStatus(a.id, { status, comment });
      if (!res.success) throw new Error();
      this.apps.update(list => status === 'REJECTED'
        ? list.filter(x => x.id !== a.id)
        : list.map(x => x.id === a.id ? { ...x, updatedAt: new Date().toISOString() } : x));
      this.toast.success(done);
    } catch {
      this.toast.error('Update failed');
    } finally { this.busy.set(null); }
  }

  formatDate(d?: string) {
    return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  }

  urgency(a: ApplicationResponseDto): 'high' | 'mid' | 'low' {
    const d = daysQuiet(a);
    return d >= 21 ? 'high' : d >= 14 ? 'mid' : 'low';
  }
}
