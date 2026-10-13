import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { ToastService } from '@app/services/toast.service';
import { ConfirmService } from '@app/services/confirm.service';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';
import {
  ApplicationResponseDto, ApplicationStatus, AWAITING_STATUSES, STATUS_LABELS, STATUS_COLORS, ATTEMPT_CHANNEL_LABELS, daysQuiet,
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
  private confirm = inject(ConfirmService);

  readonly THRESHOLDS = [7, 14, 30];
  // Loosely typed: the row template's context variable is `any`.
  readonly statusLabels: Record<string, string> = STATUS_LABELS;
  readonly statusColors: Record<string, string> = STATUS_COLORS;
  readonly daysQuiet = daysQuiet;

  apps = signal<ApplicationResponseDto[]>([]);
  /** SAVED: bookmarked but never applied to. */
  saved = signal<ApplicationResponseDto[]>([]);
  loading = signal(true);
  emailing = signal(false);
  closing = signal(false);
  busy = signal<string | null>(null);
  threshold = signal(7);
  /** Apply-channel filter: 'ALL', a channel key, or 'NONE' (no sent attempt logged). */
  channel = signal('ALL');

  /** Channels present among awaiting applications, most used first. */
  channelOptions = computed(() => {
    const counts = new Map<string, number>();
    for (const a of this.apps()) counts.set(a.applyChannel ?? 'NONE', (counts.get(a.applyChannel ?? 'NONE') ?? 0) + 1);
    return [...counts].sort((x, y) => y[1] - x[1]).map(([value, count]) => ({ value, count, label: this.channelLabel(value) }));
  });

  private filtered = computed(() => {
    const c = this.channel();
    return c === 'ALL' ? this.apps() : this.apps().filter(a => (a.applyChannel ?? 'NONE') === c);
  });

  channelLabel(c: string | null | undefined): string {
    return !c || c === 'NONE' ? 'Not logged' : (ATTEMPT_CHANNEL_LABELS as Record<string, string>)[c] ?? c;
  }

  due = computed(() => this.filtered()
    .filter(a => daysQuiet(a) >= this.threshold())
    .sort((a, b) => daysQuiet(b) - daysQuiet(a)));

  /** Quiet but not yet past the threshold, so the user sees what's coming. */
  soon = computed(() => this.filtered()
    .filter(a => daysQuiet(a) < this.threshold())
    .sort((a, b) => daysQuiet(b) - daysQuiet(a)));

  stale = computed(() => this.filtered().filter(a => daysQuiet(a) >= 30));
  savedByAge = computed(() => [...this.saved()].sort((a, b) => daysQuiet(b) - daysQuiet(a)));

  constructor() {
    effect(() => this.appService.dueFollowUps.set(this.apps().filter(a => daysQuiet(a) >= 7).length));
  }

  ngOnInit() { this.load(); }

  async load() {
    try {
      const res = await this.appService.getAll({ statuses: [...AWAITING_STATUSES, 'SAVED'], pageSize: 500 });
      if (res.success && res.data) {
        this.apps.set(res.data.items.filter(a => a.status !== 'SAVED'));
        this.saved.set(res.data.items.filter(a => a.status === 'SAVED'));
      }
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

  dropSaved(a: ApplicationResponseDto) {
    return this.act(a, 'WITHDRAWN', 'Never applied, dropped from follow-ups', `${a.companyName} dropped`);
  }

  async closeAllStale() {
    const list = this.stale();
    const ok = await this.confirm.confirm({
      title: `Close ${list.length} as ghosted?`,
      message: `Every application quiet for 30+ days moves to Rejected with the note "No response". You can still reopen any of them from its page.`,
      confirmText: `Close ${list.length}`,
      variant: 'danger',
    });
    if (!ok) return;
    this.closing.set(true);
    let failed = 0;
    for (const a of list) {
      // Sequential on purpose: keeps status history ordered and the API calm.
      if (!(await this.act(a, 'REJECTED', 'No response after 30+ days, bulk-closed from follow-ups', null))) failed++;
    }
    this.closing.set(false);
    failed ? this.toast.error(`${failed} of ${list.length} could not be closed`) : this.toast.success(`Closed ${list.length} quiet applications`);
  }

  async emailMe() {
    this.emailing.set(true);
    try {
      const res = await this.appService.sendFollowUpDigest();
      this.toast.success(res.message ?? 'Sent');
    } catch (e: any) {
      this.toast.error(e?.error?.message ?? 'Could not send the email');
    } finally { this.emailing.set(false); }
  }

  /** Returns whether it worked; `done` = null skips the per-item toast (bulk runs). */
  private async act(a: ApplicationResponseDto, status: ApplicationStatus, comment: string, done: string | null): Promise<boolean> {
    this.busy.set(a.id);
    try {
      const res = await this.appService.updateStatus(a.id, { status, comment });
      if (!res.success) throw new Error();
      const closed = status === 'REJECTED' || status === 'WITHDRAWN';
      this.apps.update(list => closed
        ? list.filter(x => x.id !== a.id)
        : list.map(x => x.id === a.id ? { ...x, updatedAt: new Date().toISOString() } : x));
      if (closed) this.saved.update(list => list.filter(x => x.id !== a.id));
      if (done) this.toast.success(done);
      return true;
    } catch {
      if (done) this.toast.error('Update failed');
      return false;
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
