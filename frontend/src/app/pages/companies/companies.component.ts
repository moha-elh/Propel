import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { Router, RouterLink } from '@angular/router';
import { CompanyService, CompanyDto } from '@app/services/company.service';
import { ToastService } from '@app/services/toast.service';
import { SheetImportDialogComponent } from '@app/shared/components/sheet-import-dialog/sheet-import-dialog.component';
import { CompanyFormDialogComponent } from '@app/shared/components/company-form-dialog/company-form-dialog.component';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { COUNTRIES } from '@app/shared/data/geo-data';

@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RouterLink, SheetImportDialogComponent, CompanyFormDialogComponent, RefreshButtonComponent],
  templateUrl: './companies.component.html',
  styleUrl: './companies.component.scss',
})
export class CompaniesComponent implements OnInit {
  private readonly companyService = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  companies = signal<CompanyDto[]>([]);
  loading = signal(true);
  search = signal('');
  countryFilter = signal('');
  cityFilter = signal('');
  minAppsFilter = signal<number | null>(null);
  sortBy = signal<'name' | 'apps' | 'applied'>('name');
  sortDir = signal<'asc' | 'desc'>('asc');
  page = signal(1);
  total = signal(0);
  private readonly pageSize = 20;
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private cityDebounce: ReturnType<typeof setTimeout> | null = null;

  hasActiveFilters = computed(() =>
    !!this.search().trim() || !!this.countryFilter() || !!this.cityFilter().trim() ||
    (this.minAppsFilter() !== null && this.minAppsFilter() !== 0));

  dialogOpen = signal(false);
  editingCompany = signal<CompanyDto | null>(null);
  importOpen = signal(false);
  refreshing = signal(false);

  protected readonly COUNTRIES = COUNTRIES;

  async ngOnInit() {
    await this.loadCompanies();
  }

  async loadCompanies() {
    this.loading.set(true);
    try {
      const res = await this.companyService.getCompanies({
        search: this.search().trim() || undefined,
        country: this.countryFilter() || undefined,
        city: this.cityFilter().trim() || undefined,
        minApps: this.minAppsFilter() ?? undefined,
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.total.set(res.data?.total ?? 0);

      // Clamp the page if it fell off the end (e.g. after deleting the last row).
      const maxPage = Math.max(1, Math.ceil(this.total() / this.pageSize));
      if (this.page() > maxPage) {
        this.page.set(maxPage);
        this.loading.set(false);
        await this.loadCompanies();
        return;
      }

      this.companies.set(res.data?.items ?? []);
    } catch {
      this.toast.error('Failed to load companies');
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  onRefresh() {
    this.refreshing.set(true);
    this.loadCompanies();
  }

  onSearchInput(value: string) {
    this.search.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.page.set(1);
      void this.loadCompanies();
    }, 300);
  }

  onCityInput(value: string) {
    this.cityFilter.set(value);
    if (this.cityDebounce) clearTimeout(this.cityDebounce);
    this.cityDebounce = setTimeout(() => {
      this.page.set(1);
      void this.loadCompanies();
    }, 300);
  }

  onCountryFilterChange(value: string) {
    this.countryFilter.set(value);
    this.page.set(1);
    void this.loadCompanies();
  }

  onMinAppsChange(value: string) {
    const parsed = parseInt(value, 10);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (next === this.minAppsFilter()) return;
    this.minAppsFilter.set(next);
    this.page.set(1);
    void this.loadCompanies();
  }

  onSortByChange(value: 'name' | 'apps' | 'applied') {
    this.sortBy.set(value);
    // Sensible default direction per category; still toggleable afterwards.
    this.sortDir.set(value === 'name' ? 'asc' : 'desc');
    this.page.set(1);
    void this.loadCompanies();
  }

  toggleSortDir() {
    this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    void this.loadCompanies();
  }

  resetFilters() {
    this.search.set('');
    this.countryFilter.set('');
    this.cityFilter.set('');
    this.minAppsFilter.set(null);
    this.sortBy.set('name');
    this.sortDir.set('asc');
    this.page.set(1);
    void this.loadCompanies();
  }

  goToPage(target: number) {
    const clamped = Math.min(Math.max(1, target), this.pageCount());
    if (clamped === this.page()) return;
    this.page.set(clamped);
    void this.loadCompanies();
  }

  /** Windowed page numbers with -1 as an ellipsis marker. */
  visiblePages(): number[] {
    const count = this.pageCount();
    const current = this.page();
    if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
    const pages = new Set<number>([1, count, current - 1, current, current + 1]);
    if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
    if (current >= count - 2) [count - 3, count - 2, count - 1].forEach(p => pages.add(p));
    const sorted = [...pages].filter(p => p >= 1 && p <= count).sort((a, b) => a - b);
    const out: number[] = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev > 1) out.push(-1);
      out.push(p);
      prev = p;
    }
    return out;
  }

  openCreate() {
    this.editingCompany.set(null);
    this.dialogOpen.set(true);
  }

  openDetail(c: CompanyDto) {
    void this.router.navigate(['/companies', c.id]);
  }

  openEdit(c: CompanyDto) {
    this.editingCompany.set(c);
    this.dialogOpen.set(true);
  }

  async onDelete(c: CompanyDto) {
    if (!confirm(`Remove "${c.name}" from your list?`)) return;
    try {
      await this.companyService.deleteCompany(c.id);
      this.toast.success('Company removed');
      await this.loadCompanies();
    } catch {
      this.toast.error('Failed to delete company');
    }
  }

  hostOf(url?: string | null): string {
    if (!url) return '';
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
  }

  displayLocation(c: CompanyDto): string {
    if (c.location && c.country) return `${c.location}, ${c.country}`;
    return c.location || c.country || '—';
  }

  formatDate(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
