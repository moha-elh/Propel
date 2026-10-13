import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { AuthService } from '@app/services/auth.service';
import { StatisticsTrendsDto, ApplicationResponseDto, AWAITING_STATUSES, daysQuiet } from '@app/models/application.model';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';

interface FollowUpItem {
  id: string;
  company: string;
  role: string;
  timeAgo: string;
}


import { CountryFilterComponent } from '@app/shared/components/country-filter/country-filter.component';

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
  private sanitizer = inject(DomSanitizer);
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

  timeOfDay = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  });

  private dueFollowUps = computed(() => this.applications()
    .filter(a => AWAITING_STATUSES.includes(a.status) && daysQuiet(a) >= 7)
    .sort((a, b) => daysQuiet(b) - daysQuiet(a)));
  pendingFollowUps = computed(() => this.dueFollowUps().length);
  activeOffers = computed(() => this.s().offer);

  monthApplied = computed(() => {
    const now = new Date();
    const apps = this.applications();
    if (apps.length > 0) {
      return apps.filter(a => {
        if (!a.appliedAt) return false;
        const d = new Date(a.appliedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
    }
    const trends = this.trends()?.monthlyTrends ?? [];
    return trends.length ? trends[trends.length - 1].applied : 0;
  });

  /** Plain current numbers; no month-over-month badges (a partial month vs a full one misleads). */
  kpis = computed(() => {
    const s = this.s();
    const responded = s.screening + s.assessment + s.interview + s.offer + s.accepted + s.rejected;
    return [
      { label: 'Applications', value: String(s.total), sub: `${this.monthApplied()} this month`, route: '/applications/list' },
      { label: 'Waiting on a reply', value: String(s.applied + s.screening + s.assessment), sub: `${this.pendingFollowUps()} quiet for 7+ days`, route: '/applications/follow-ups' },
      { label: 'Interviews', value: String(s.interview), sub: `${s.offer} offers · ${s.accepted} accepted`, route: '/applications/kanban' },
      { label: 'Response rate', value: (s.total ? Math.round(responded / s.total * 100) : 0) + '%', sub: `${responded} of ${s.total} answered`, route: '/applications/analytics' },
    ];
  });

  followUpItems = computed<FollowUpItem[]>(() => this.dueFollowUps().slice(0, 5).map(a => ({
    id: a.id,
    company: a.companyName,
    role: a.positionTitle,
    timeAgo: `${daysQuiet(a)}d quiet`,
  })));

  hasPipelineData = computed(() => this.s().total > 0);

  pipelineSvg = computed<SafeHtml>(() => {
    const s = this.s();
    const total = s.total;
    const interview = s.interview;
    const offered = s.offer + s.accepted;
    const rejected = s.rejected;
    const applied = Math.max(0, total - s.saved - s.withdrawn - interview - offered - rejected);

    const W = 480, H = 150;
    const topPad = 26, labelPad = 26;
    const maxBarH = H - topPad - labelPad;
    const statuses = [
      { label: 'Applied', count: applied, color: 'oklch(0.68 0.015 250)' },
      { label: 'Interview', count: Math.max(0, interview), color: 'oklch(0.6 0.16 250)' },
      { label: 'Offer', count: Math.max(0, offered), color: 'oklch(0.62 0.15 155)' },
      { label: 'Rejected', count: Math.max(0, rejected), color: 'oklch(0.62 0.18 25)' },
    ];

    const maxCount = Math.max(...statuses.map(s => s.count), 1);
    const barW = 48, gap = (W - statuses.length * barW) / (statuses.length + 1);
    let svg = '';

    statuses.forEach((st, i) => {
      const x = gap + i * (barW + gap);
      const barH = Math.max(6, (st.count / maxCount) * maxBarH);
      const y = H - labelPad - barH;
      svg += `<rect x="${x}" y="${topPad}" width="${barW}" height="${maxBarH}" rx="6" fill="oklch(0.96 0.004 80)"/>`;
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="${st.color}" opacity="0.92"/>`;
      svg += `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="oklch(0.6 0.005 80)" font-family="inherit">${st.label}</text>`;
      svg += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="${st.color}" font-weight="600" font-family="inherit">${st.count}</text>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
    );
  });

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

  go(route: string) { this.router.navigate([route]); }
  goToGenerate() { this.router.navigate(['/applications/generate']); }
  addApplication() { this.router.navigate(['/applications/new']); }
  goToFollowUps() { this.router.navigate(['/applications/follow-ups']); }
}
