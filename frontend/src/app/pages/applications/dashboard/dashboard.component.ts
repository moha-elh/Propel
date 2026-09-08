import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ApplicationService } from '@app/services/application.service';
import { AuthService } from '@app/services/auth.service';
import { StatisticsTrendsDto, MonthlyTrendDto, ApplicationResponseDto } from '@app/models/application.model';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';

interface StatCard {
  label: string;
  displayValue: string;
  sub: string;
  change: number;
  dotColor: string;
  valueColor: string;
  bars: number[];
}

interface FollowUpItem {
  id: string;
  company: string;
  role: string;
  timeAgo: string;
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RefreshButtonComponent],
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
        this.appService.getAll({ page: 1, pageSize: 50 }),
      ]);
      if (trendsRes.success && trendsRes.data) this.trends.set(trendsRes.data);
      if (appsRes.success && appsRes.data) this.applications.set(appsRes.data.items);
    } catch { } finally { this.loading.set(false); this.refreshing.set(false); }
  }

  onRefresh() { this.refreshing.set(true); this.loadTrends(); }

  firstName = computed(() => this.authService.currentUser()?.firstName ?? 'there');
  s = computed(() => this.trends()?.current ?? { total: 0, saved: 0, applied: 0, screening: 0, interview: 0, offer: 0, accepted: 0, rejected: 0, withdrawn: 0 });

  private _monthlyValues = computed<{ total: number[]; interview: number[]; accepted: number[]; responseRate: number[] }>(() => {
    const data = this.trends()?.monthlyTrends ?? [];
    const total: number[] = [];
    const interview: number[] = [];
    const accepted: number[] = [];
    const responseRate: number[] = [];

    data.forEach(m => {
      const t = m.saved + m.applied + m.screening + m.interview + m.offer + m.accepted + m.rejected + m.withdrawn;
      total.push(t);
      interview.push(m.interview);
      accepted.push(m.accepted);
      responseRate.push(t > 0 ? Math.round(((m.screening + m.interview + m.offer + m.accepted + m.rejected) / t) * 100) : 0);
    });

    return { total, interview, accepted, responseRate };
  });

  private _monthOverMonthChange(values: number[]): number {
    if (values.length < 2) return 0;
    const prev = values[values.length - 2];
    const curr = values[values.length - 1];
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  private _scaleBars(values: number[]): number[] {
    const max = Math.max(...values, 1);
    return values.map(v => Math.max(4, (v / max) * 24));
  }

  timeOfDay = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  });

  todayLabel = computed(() => {
    const d = new Date();
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()}`;
  });

  pendingFollowUps = computed(() => this.s().applied);
  activeOffers = computed(() => this.s().offer);

  statCards = computed<StatCard[]>(() => {
    const s = this.s();
    const mv = this._monthlyValues();
    const pct = (a: number, b: number) => a > 0 ? Math.round((b / a) * 100) : 0;

    return [
      {
        label: 'Total applications',
        displayValue: String(s.total),
        sub: this.trends()?.monthlyTrends?.length
          ? `${MONTH_LABELS[this.trends()!.monthlyTrends[this.trends()!.monthlyTrends.length - 1].month - 1]} total ${mv.total[mv.total.length - 1] ?? ''}`
          : 'vs last month',
        change: this._monthOverMonthChange(mv.total),
        dotColor: 'oklch(0.22 0.01 80)',
        valueColor: 'var(--text)',
        bars: this._scaleBars(mv.total),
      },
      {
        label: 'Interviewing',
        displayValue: String(s.interview),
        sub: `${s.interview} active`,
        change: this._monthOverMonthChange(mv.interview),
        dotColor: 'oklch(0.6 0.16 250)',
        valueColor: 'oklch(0.5 0.16 250)',
        bars: this._scaleBars(mv.interview),
      },
      {
        label: 'Offers',
        displayValue: String(s.offer),
        sub: `${s.accepted} accepted`,
        change: this._monthOverMonthChange(mv.accepted),
        dotColor: 'oklch(0.62 0.15 155)',
        valueColor: 'oklch(0.45 0.14 155)',
        bars: this._scaleBars(mv.accepted),
      },
      {
        label: 'Response rate',
        displayValue: pct(s.total, s.screening + s.interview + s.offer + s.accepted + s.rejected) + '%',
        sub: 'industry avg 23%',
        change: this._monthOverMonthChange(mv.responseRate),
        dotColor: 'oklch(0.62 0.18 25)',
        valueColor: 'oklch(0.55 0.18 25)',
        bars: this._scaleBars(mv.responseRate),
      },
    ];
  });

  followUpItems = computed<FollowUpItem[]>(() => {
    const apps = this.applications();
    if (apps.length === 0) return [];

    const awaiting = apps.filter(a => a.status === 'APPLIED' || a.status === 'SCREENING');
    if (awaiting.length === 0) return [];

    return awaiting.slice(0, 5).map(a => ({
      id: a.id,
      company: a.companyName,
      role: a.positionTitle,
      timeAgo: this.relativeTime(a.updatedAt),
    }));
  });

  private relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  }

  hasPipelineData = computed(() => this.s().total > 0);

  pipelineSvg = computed<SafeHtml>(() => {
    const s = this.s();
    const total = s.total;
    const interview = s.interview;
    const offered = s.offer + s.accepted;
    const rejected = s.rejected;
    const applied = Math.max(0, total - s.saved - s.withdrawn - interview - offered - rejected);

    const W = 480, H = 120;
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
      const barH = Math.max(8, (st.count / maxCount) * 80);
      const y = H - 24 - barH;
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="5" fill="${st.color}" opacity="0.9"/>`;
      svg += `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="oklch(0.6 0.005 80)" font-family="inherit">${st.label}</text>`;
      svg += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="11" fill="${st.color}" font-weight="600" font-family="inherit">${st.count}</text>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 ${W} ${H}" width="100%" height="130" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
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

  goToGenerate() { this.router.navigate(['/applications/generate']); }
  addApplication() { this.router.navigate(['/applications/new']); }
  goToCalendar() { this.router.navigate(['/applications/calendar']); }
}
