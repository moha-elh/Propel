import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CompanyService, CompanyDto, CompanySocialLink } from '@app/services/company.service';
import { CompanyResearchService, COMPANY_RESEARCH_DATA_TYPES } from '@app/services/company-research.service';
import { ToastService } from '@app/services/toast.service';
import { extractError } from '@app/shared/error-utils';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';

const SOCIAL_ICONS: Record<string, string> = {
  linkedin: 'ti ti-brand-linkedin',
  twitter: 'ti ti-brand-x',
  x: 'ti ti-brand-x',
  facebook: 'ti ti-brand-facebook',
  instagram: 'ti ti-brand-instagram',
  youtube: 'ti ti-brand-youtube',
  github: 'ti ti-brand-github',
  tiktok: 'ti ti-brand-tiktok',
  behance: 'ti ti-brand-behance',
  dribbble: 'ti ti-brand-dribbble',
  website: 'ti ti-world',
  default: 'ti ti-share',
};

@Component({
  selector: 'app-company-research-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, RefreshButtonComponent],
  templateUrl: './company-research-detail.component.html',
  styleUrl: './company-research-detail.component.scss',
})
export class CompanyResearchDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly companiesApi = inject(CompanyService);
  private readonly researchApi = inject(CompanyResearchService);
  private readonly toast = inject(ToastService);

  company = signal<CompanyDto | null>(null);
  loading = signal(true);
  running = signal(false);
  refreshing = signal(false);

  hasResearch = computed(() => {
    const c = this.company();
    if (!c) return false;
    return c.researchSource === 'web-research' &&
      (!!c.address || (c.emails?.length ?? 0) > 0 || (c.phones?.length ?? 0) > 0 ||
        (c.socialLinks?.length ?? 0) > 0 || (c.companyFacts?.length ?? 0) > 0 || !!c.description);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) void this.load(id);
    });
  }

  async load(id?: string): Promise<void> {
    const companyId = id ?? this.route.snapshot.paramMap.get('id');
    if (!companyId) return;
    this.loading.set(true);
    try {
      const res = await this.companiesApi.getCompany(companyId);
      this.company.set(res.data ?? null);
    } catch {
      this.company.set(null);
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  onRefresh(): void {
    this.refreshing.set(true);
    void this.load();
  }

  socialIcon(link: CompanySocialLink): string {
    return SOCIAL_ICONS[link.key] ?? SOCIAL_ICONS['default'];
  }

  socialLabel(link: CompanySocialLink): string {
    return link.key.charAt(0).toUpperCase() + link.key.slice(1);
  }

  hostOf(url?: string | null): string {
    if (!url) return '';
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
  }

  displayLocation(c: CompanyDto): string {
    if (c.location && c.country) return `${c.location}, ${c.country}`;
    return c.location || c.country || '';
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  }

  avatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
    return `oklch(0.72 0.12 ${hash})`;
  }

  formatDateTime(iso?: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  async researchAgain(): Promise<void> {
    const c = this.company();
    if (!c || this.running()) return;
    this.running.set(true);
    try {
      const types = COMPANY_RESEARCH_DATA_TYPES.map(t => t.key);
      const res = await this.researchApi.research(c.id, types);
      this.company.set(res.data ?? this.company());
      this.toast.success(res.message ?? 'Research complete');
    } catch (e) {
      this.toast.error(extractError(e) || 'Research failed');
    } finally {
      this.running.set(false);
    }
  }

  openCompanyPage(): void {
    const c = this.company();
    if (c) void this.router.navigate(['/companies', c.id]);
  }
}