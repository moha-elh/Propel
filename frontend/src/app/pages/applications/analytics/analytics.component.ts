import { Component, signal, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DocumentsService } from '@app/services/documents.service';
import { CommonModule } from '@angular/common';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { ApplicationService } from '@app/services/application.service';
import {
  AnalyticsSummaryDto, MonthlyTrendDto, WeeklyTrendDto, DailyTrendDto, ApplicationStatus,
  STATUS_ORDER, STATUS_LABELS, STATUS_COLORS,
ATTEMPT_CHANNEL_LABELS, CvPerformanceDto, AttemptChannel,
  PRIORITY_ORDER, PRIORITY_LABELS, PRIORITY_COLORS,
  ORIGIN_ORDER, ORIGIN_LABELS, ORIGIN_COLORS,
} from '@app/models/application.model';
import { RouterLink } from '@angular/router';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CHANNEL_COLORS: Record<AttemptChannel, string> = {
  EMAIL_GMAIL: 'oklch(0.6 0.16 250)',
  EMAIL_SMTP: 'oklch(0.58 0.14 200)',
  WHATSAPP: 'oklch(0.58 0.15 160)',
  LINKEDIN_MESSAGE: 'oklch(0.52 0.15 280)',
  LINKEDIN_CONNECTION: 'oklch(0.5 0.14 310)',
  LINKEDIN_APPLY: 'oklch(0.55 0.15 230)',
  WEB_FORM: 'oklch(0.62 0.15 90)',
  IN_PERSON: 'oklch(0.6 0.17 35)',
  OTHER: 'oklch(0.5 0.02 70)',
};

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DAY_LABEL_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface KpiCard { label: string; value: string; sub: string; color: string; }
interface BarRow { label: string; count: number; pct: number; color: string; }
interface NameValue { name: string; value: number; }
interface ChannelRow extends NameValue { key: string; }
interface StatusSlice extends NameValue { color: string; }
type Granularity = 'day' | 'week' | 'month';

interface ContactBar { label: string; pct: number; color: string; }

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, NgxChartsModule, RefreshButtonComponent, RouterLink, CompanyLogoComponent],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private appService = inject(ApplicationService);
  private docs = inject(DocumentsService);
  private sanitizer = inject(DomSanitizer);

  // ── CV preview modal ────────────────────────────────────────────────────────
  previewCv = signal<CvPerformanceDto | null>(null);
  previewBlobUrl = signal<string | null>(null);
  previewError = signal(false);
  previewSrc = computed<SafeResourceUrl | null>(() => {
    const u = this.previewBlobUrl();
    return u ? this.sanitizer.bypassSecurityTrustResourceUrl(u) : null;
  });
  failedThumbs = signal<Set<string>>(new Set());

  thumbUrl(versionId: string) { return this.docs.versionThumbnailUrl(versionId); }
  fileUrl(versionId: string, download = false) { return this.docs.versionFileUrl(versionId, download); }
  onThumbError(id: string) { this.failedThumbs.update(s => new Set(s).add(id)); }

  async openCvPreview(p: CvPerformanceDto) {
    this.closeCvPreview();
    this.previewCv.set(p);
    try {
      const blob = await this.docs.getVersionFileBlob(p.versionId);
      if (this.previewCv()?.versionId !== p.versionId) return;
      this.previewBlobUrl.set(URL.createObjectURL(blob));
    } catch {
      this.previewError.set(true);
    }
  }

  closeCvPreview() {
    const u = this.previewBlobUrl();
    if (u) URL.revokeObjectURL(u);
    this.previewBlobUrl.set(null);
    this.previewError.set(false);
    this.previewCv.set(null);
  }

  ngOnDestroy() { this.closeCvPreview(); }


  summary = signal<AnalyticsSummaryDto | null>(null);
  loading = signal(true);
  refreshing = signal(false);
  granularity = signal<Granularity>('day');
  periodDays = signal(7);
  periodWeeks = signal(8);
  periodMonths = signal(6);

  ngOnInit() { this.load(); }

  async load() {
    try {
      const res = await this.appService.getAnalyticsSummary();
      if (res.success && res.data) this.summary.set(res.data);
    } catch { } finally { this.loading.set(false); this.refreshing.set(false); }
  }

  onRefresh() { this.refreshing.set(true); this.load(); }
  setGranularity(g: Granularity) { this.granularity.set(g); }
  setPeriod(n: number) {
    if (this.granularity() === 'week') this.periodWeeks.set(n);
    else if (this.granularity() === 'month') this.periodMonths.set(n);
    else this.periodDays.set(n);
  }

  stats = computed(() => this.summary()?.statistics ?? {
    total: 0, saved: 0, applied: 0, screening: 0, assessment: 0, interview: 0, offer: 0, accepted: 0, rejected: 0, withdrawn: 0,
  });
  avgTime = computed(() => this.summary()?.averageResponseTimeDays ?? null);

  private pct(a: number, b: number): number { return a > 0 ? Math.round((b / a) * 100) : 0; }

  kpis = computed<KpiCard[]>(() => {
    const s = this.stats();
    const responded = s.screening + s.assessment + s.interview + s.offer + s.accepted + s.rejected;
    const inPipeline = s.total - s.rejected - s.withdrawn - s.accepted;
    const companies = this.summary()?.distinctCompanies ?? 0;
    const avg = this.avgTime();
    return [
      { label: 'Total applications', value: String(s.total), sub: `${s.saved} saved`, color: 'oklch(0.6 0.16 250)' },
      { label: 'In pipeline', value: String(inPipeline), sub: 'active, not closed', color: 'oklch(0.55 0.16 160)' },
      { label: 'Response rate', value: this.pct(s.total, responded) + '%', sub: `${responded} responded`, color: 'oklch(0.55 0.16 200)' },
      { label: 'Companies reached', value: String(companies), sub: 'distinct', color: 'oklch(0.62 0.15 130)' },
      { label: 'Avg. response', value: avg != null ? avg.toFixed(1) + 'd' : '—', sub: 'to first change', color: 'oklch(0.55 0.14 280)' },
    ];
  });

  private statKeyFor(st: ApplicationStatus): number {
    return (this.stats() as unknown as Record<string, number>)[st.toLowerCase()] ?? 0;
  }

  statusPie = computed<StatusSlice[]>(() =>
    STATUS_ORDER
      .map(st => ({ name: STATUS_LABELS[st], value: this.statKeyFor(st), color: STATUS_COLORS[st] }))
      .filter(d => d.value > 0)
  );
  statusColors = computed(() => this.statusPie().map(d => ({ name: d.name, value: d.color })));

  topCompanyList = computed(() => this.summary()?.topCompanies ?? []);
  channelBreakdown = computed<ChannelRow[]>(() => {
    const c = this.summary()?.channelCounts ?? {};
    return Object.keys(c)
      .map(key => ({
        key,
        name: ATTEMPT_CHANNEL_LABELS[key as keyof typeof ATTEMPT_CHANNEL_LABELS] ?? key,
        value: c[key],
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  });
  // ── Priority / origin breakdown ──────────────────────────────────────────────
  private barRows(counts: Record<string, number>, order: readonly string[], labelOf: (k: string) => string, colorOf: (k: string) => string): BarRow[] {
    const total = this.stats().total;
    return order
      .map(k => ({ label: labelOf(k), count: counts[k] ?? 0, color: colorOf(k) }))
      .filter(b => b.count > 0)
      .map(b => ({ ...b, pct: total > 0 ? Math.round((b.count / total) * 100) : 0 }));
  }

  priorityBars = computed<BarRow[]>(() =>
    this.barRows(this.summary()?.priorityCounts ?? {}, PRIORITY_ORDER, k => PRIORITY_LABELS[k as keyof typeof PRIORITY_LABELS], k => PRIORITY_COLORS[k as keyof typeof PRIORITY_COLORS])
  );

  originBars = computed<BarRow[]>(() =>
    this.barRows(this.summary()?.originCounts ?? {}, ORIGIN_ORDER, k => ORIGIN_LABELS[k as keyof typeof ORIGIN_LABELS], k => ORIGIN_COLORS[k as keyof typeof ORIGIN_COLORS])
  );

  channelColor(c: string): string {
    return CHANNEL_COLORS[c as AttemptChannel] ?? 'oklch(0.6 0.01 80)';
  }

  totalChannels = computed(() => this.channelBreakdown().reduce((sum, c) => sum + c.value, 0));

  channelPct(value: number): number {
    const total = this.totalChannels();
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  filteredTrends = computed(() => {
    const granularity = this.granularity();
    if (granularity === 'week') {
      const trends = this.summary()?.weeklyTrends ?? [];
      const cutoff = this.periodWeeks();
      return cutoff > 0 ? trends.slice(-cutoff) : trends;
    }
    if (granularity === 'day') {
      const trends = this.summary()?.dailyTrends ?? [];
      const cutoff = this.periodDays();
      return cutoff > 0 ? trends.slice(-cutoff) : trends;
    }
    const trends = this.summary()?.monthlyTrends ?? [];
    const cutoff = this.periodMonths();
    return cutoff > 0 ? trends.slice(-cutoff) : trends;
  });

  monthlyStacked = computed(() =>
    (this.filteredTrends() as MonthlyTrendDto[]).map(d => ({
      name: MONTH_LABELS[d.month - 1] + (d.year !== new Date().getFullYear() ? ` ${d.year}` : ''),
      series: STATUS_ORDER.map(st => ({ name: STATUS_LABELS[st], value: (d as unknown as Record<string, number>)[st.toLowerCase()] ?? 0 })),
    }))
  );

  weeklyStacked = computed(() =>
    (this.filteredTrends() as WeeklyTrendDto[]).map(d => ({
      name: `W${d.week}` + (d.year !== new Date().getFullYear() ? ` ${d.year}` : ''),
      series: STATUS_ORDER.map(st => ({ name: STATUS_LABELS[st], value: (d as unknown as Record<string, number>)[st.toLowerCase()] ?? 0 })),
    }))
  );

  dailyStacked = computed(() => {
    const now = new Date();
    return (this.filteredTrends() as DailyTrendDto[]).map(d => ({
      name: new Date(d.date).getFullYear() !== now.getFullYear()
        ? DAY_LABEL_YEAR.format(new Date(d.date))
        : DAY_LABEL.format(new Date(d.date)),
      series: STATUS_ORDER.map(st => ({ name: STATUS_LABELS[st], value: (d as unknown as Record<string, number>)[st.toLowerCase()] ?? 0 })),
    }));
  });

  overTimeData = computed(() => {
    if (this.granularity() === 'week') return this.weeklyStacked();
    if (this.granularity() === 'month') return this.monthlyStacked();
    return this.dailyStacked();
  });

  // ── Contact coverage ────────────────────────────────────────────────────────
  contactCoverage = computed(() => this.summary()?.contactCoverage ?? null);
  contactBars = computed<ContactBar[]>(() => {
    const cc = this.contactCoverage();
    if (!cc || cc.total === 0) return [];
    const bars: ContactBar[] = [];
    if (cc.emailPct > 0) bars.push({ label: 'Email', pct: cc.emailPct, color: 'oklch(0.6 0.15 200)' });
    if (cc.phonePct > 0) bars.push({ label: 'Phone', pct: cc.phonePct, color: 'oklch(0.6 0.15 160)' });
    if (cc.linkedinPct > 0) bars.push({ label: 'LinkedIn', pct: cc.linkedinPct, color: 'oklch(0.6 0.15 260)' });
    if (cc.mobilePct > 0) bars.push({ label: 'Mobile', pct: cc.mobilePct, color: 'oklch(0.6 0.15 140)' });
    if (cc.faxPct > 0) bars.push({ label: 'Fax', pct: cc.faxPct, color: 'oklch(0.6 0.15 25)' });
    return bars;
  });
  contactCoverageTotal = computed(() => this.summary()?.contactCoverage?.total ?? 0);

  // ── Company distribution ────────────────────────────────────────────────────
  companyDistribution = computed(() => this.summary()?.companyDistribution ?? null);

  private topOf(map: Record<string, number> | undefined, n: number): NameValue[] {
    if (!map) return [];
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
  }

  sectorTop = computed(() => this.topOf(this.companyDistribution()?.sectorCounts, 8));
  companyDist = computed(() => this.summary()?.companyDistribution ?? null);

  geo = computed(() => {
    const locs = this.companyDistribution()?.locations ?? [];
    const total = locs.reduce((s, l) => s + l.count, 0);
    return locs.map(l => ({
      country: l.country,
      count: l.count,
      pct: total > 0 ? Math.round((l.count / total) * 100) : 0,
      cities: this.topOf(l.cities, 12),
      withoutCity: l.withoutCity,
    }));
  });

  /** One-sentence plain-language read of the geography data. */
  geoSummary = computed(() => {
    const g = this.geo();
    if (g.length === 0) return '';
    const [first, second] = g;
    let text = g.length === 1
      ? `All your companies are in ${first.country}.`
      : `Most of your companies are in ${first.country} (${first.pct}%), followed by ${second.country} (${second.pct}%)`
        + (g.length > 2 ? ` and ${g.length - 2} more ${g.length - 2 === 1 ? 'country' : 'countries'}.` : '.');
    const withCity = g.reduce((s, c) => s + c.count - c.withoutCity, 0);
    const total = g.reduce((s, c) => s + c.count, 0);
    if (withCity === 0) text += ' No company has a city set yet.';
    else if (withCity < total) {
      const top = g.flatMap(c => c.cities).sort((a, b) => b.value - a.value)[0];
      text += ` ${withCity} of ${total} have a city; ${top.name} leads with ${top.value}.`;
    }
    return text;
  });

  // ── Career inventory ────────────────────────────────────────────────────────
  // ── Response histogram ───────────────────────────────────────────────────────
  responseHistogram = computed<NameValue[]>(() =>
    (this.summary()?.responseTimeHistogram ?? []).map(b => ({ name: b.bucket, value: b.count }))
  );
  responseHistogramTotal = computed(() => this.responseHistogram().reduce((a, b) => a + b.value, 0));
  histPct(v: number): number {
    const max = Math.max(...this.responseHistogram().map(b => b.value), 0);
    return max > 0 ? Math.round((v / max) * 100) : 0;
  }

  hasData = computed(() => this.stats().total > 0);

  cvPerformance = computed<CvPerformanceDto[]>(() => this.summary()?.cvPerformance ?? []);

  private rate(n: number, of: number): number { return of > 0 ? Math.round((n / of) * 100) : 0; }

  /** CV versions ranked by interview rate, then volume. */
  cvRows = computed(() =>
    this.cvPerformance()
      .map(p => ({ ...p, interviewPct: this.rate(p.interviewCount, p.linkedApplications), offerPct: this.rate(p.offerCount, p.linkedApplications) }))
      .sort((a, b) => b.interviewPct - a.interviewPct || b.sentCount - a.sentCount)
  );

  pctOf(v: number): number { return this.rate(v, this.stats().total); }

  periodOptions = computed(() => {
    const g = this.granularity();
    const [vals, unit] = g === 'day' ? [[7, 14, 30], 'd'] : g === 'week' ? [[4, 8, 16], 'w'] : [[3, 6, 12], 'm'];
    return [...(vals as number[]).map(v => ({ value: v, label: v + unit })), { value: 0, label: 'All' }];
  });

  currentPeriod = computed(() =>
    this.granularity() === 'week' ? this.periodWeeks() : this.granularity() === 'month' ? this.periodMonths() : this.periodDays());
}
