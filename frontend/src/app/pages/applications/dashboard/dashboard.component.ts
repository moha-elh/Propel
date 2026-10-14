import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { AuthService } from '@app/services/auth.service';
import { StatisticsTrendsDto, ApplicationResponseDto, AWAITING_STATUSES, daysQuiet, ApplicationStatus } from '@app/models/application.model';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';
import { CountryFilterComponent } from '@app/shared/components/country-filter/country-filter.component';

/** One colour per stage, used by every chart, tile and number on this page. */
const STAGES: { key: string; label: string; statuses: ApplicationStatus[]; color: string }[] = [
  { key: 'applied', label: 'Applied', statuses: ['APPLIED'], color: 'oklch(0.66 0.02 250)' },
  { key: 'seen', label: 'Seen', statuses: ['SCREENING'], color: 'oklch(0.62 0.11 200)' },
  { key: 'assessment', label: 'Assessment', statuses: ['ASSESSMENT'], color: 'oklch(0.6 0.15 290)' },
  { key: 'interview', label: 'Interview', statuses: ['INTERVIEW'], color: 'oklch(0.6 0.16 250)' },
  { key: 'offer', label: 'Offer', statuses: ['OFFER', 'ACCEPTED'], color: 'oklch(0.62 0.15 155)' },
  { key: 'rejected', label: 'Rejected', statuses: ['REJECTED'], color: 'oklch(0.62 0.18 25)' },
];
const COLOR = Object.fromEntries(STAGES.map(s => [s.key, s.color]));

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CountryFilterComponent, CommonModule, RefreshButtonComponent, CompanyLogoComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private appService = inject(ApplicationService);
  private authService = inject(AuthService);
  private router = inject(Router);

  trends = signal<StatisticsTrendsDto | null>(null);
  applications = signal<ApplicationResponseDto[]>([]);
  loading = signal(true);
  refreshing = signal(false);

  ngOnInit() { this.loadTrends(); }

  async loadTrends() {
    try {
      const [trendsRes, appsRes] = await Promise.all([
        this.appService.getTrends(),
        this.appService.getAll({ page: 1, pageSize: 500 }),
      ]);
      if (trendsRes.success && trendsRes.data) this.trends.set(trendsRes.data);
      if (appsRes.success && appsRes.data) this.applications.set(appsRes.data.items);
    } catch { } finally { this.loading.set(false); this.refreshing.set(false); }
  }

  onRefresh() { this.refreshing.set(true); this.loadTrends(); }

  firstName = computed(() => this.authService.currentUser()?.firstName ?? 'there');
  s = computed(() => this.trends()?.current ?? { total: 0, saved: 0, applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, accepted: 0, rejected: 0, withdrawn: 0 });
  timeOfDay = computed(() => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; });

  private dueFollowUps = computed(() => this.applications()
    .filter(a => AWAITING_STATUSES.includes(a.status) && daysQuiet(a) >= 7)
    .sort((a, b) => daysQuiet(b) - daysQuiet(a)));
  pendingFollowUps = computed(() => this.dueFollowUps().length);
  followUps = computed(() => this.dueFollowUps().slice(0, 6).map(a => ({ id: a.id, company: a.companyName, role: a.positionTitle, days: daysQuiet(a) })));
  /** Older silence reads hotter: grey under 2 weeks, amber under 3, red after. */
  quietColor(d: number) { return d >= 21 ? COLOR['rejected'] : d >= 14 ? 'oklch(0.62 0.14 65)' : 'var(--text-3)'; }

  sent = computed(() => this.s().total - this.s().saved);
  /** "Seen" (screening) is not a reply; a reply is an assessment onwards or a rejection. */
  replied = computed(() => { const s = this.s(); return s.assessment + s.interview + s.offer + s.accepted + s.rejected; });

  monthApplied = computed(() => {
    const now = new Date();
    return this.applications().filter(a => a.appliedAt && new Date(a.appliedAt).getMonth() === now.getMonth() && new Date(a.appliedAt).getFullYear() === now.getFullYear()).length;
  });

  kpis = computed(() => {
    const s = this.s(), sent = this.sent(), rr = sent ? Math.round(this.replied() / sent * 100) : 0;
    return [
      { label: 'Applications', value: String(s.total), sub: `${this.monthApplied()} this month`, color: 'var(--text)', route: '/applications/list' },
      { label: 'Waiting on a reply', value: String(s.applied), sub: `${this.pendingFollowUps()} quiet for 7+ days`, color: COLOR['applied'], route: '/applications/follow-ups' },
      { label: 'Seen', value: String(s.screening), sub: 'viewed, no reply yet', color: COLOR['seen'], route: '/applications/kanban' },
      { label: 'Interviews', value: String(s.interview), sub: `${s.assessment} in assessment · ${s.offer + s.accepted} offers`, color: COLOR['interview'], route: '/applications/kanban' },
      { label: 'Response rate', value: rr + '%', sub: `${this.replied()} of ${sent} replied`, color: COLOR['offer'], route: '/applications/analytics' },
    ];
  });

  /** Applications per week (Monday start), split by where they stand now; leading empty weeks trimmed. */
  weeks = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monday = new Date(today); monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
    const start = new Date(monday); start.setDate(monday.getDate() - 11 * 7);
    const rows = Array.from({ length: 12 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i * 7); return { start: d, counts: {} as Record<string, number>, total: 0 }; });
    for (const a of this.applications()) {
      if (!a.appliedAt) continue;
      const i = Math.floor((new Date(a.appliedAt).getTime() - start.getTime()) / (7 * 86_400_000));
      const st = STAGES.find(x => x.statuses.includes(a.status));
      if (i < 0 || i >= 12 || !st) continue;
      rows[i].counts[st.key] = (rows[i].counts[st.key] ?? 0) + 1; rows[i].total++;
    }
    const first = rows.findIndex(r => r.total);
    const kept = rows.slice(first < 0 ? 6 : Math.min(first, 6));
    const max = Math.max(1, ...kept.map(r => r.total));
    return kept.map(r => ({ start: r.start, total: r.total, h: r.total / max * 100,
      segs: STAGES.filter(x => r.counts[x.key]).map(x => ({ label: x.label, color: x.color, n: r.counts[x.key] })) }));
  });
  readonly STAGES = STAGES;

  go(route: string) { this.router.navigate([route]); }
  open(id: string) { this.router.navigate(['/applications', id]); }
  goToGenerate() { this.router.navigate(['/applications/generate']); }
  addApplication() { this.router.navigate(['/applications/new']); }
  goToFollowUps() { this.router.navigate(['/applications/follow-ups']); }
}
