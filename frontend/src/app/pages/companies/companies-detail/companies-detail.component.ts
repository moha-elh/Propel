import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CompanyService, CompanyDto } from '@app/services/company.service';
import { ToastService } from '@app/services/toast.service';
import { CompanyFormDialogComponent } from '@app/shared/components/company-form-dialog/company-form-dialog.component';
import { ContactsExtractDialogComponent } from '@app/shared/components/contacts-extract-dialog/contacts-extract-dialog.component';
import { ContactQuickActionsComponent } from '@app/shared/components/contact-quick-actions/contact-quick-actions.component';
import { CompanyLogoComponent } from '@app/shared/components/company-logo/company-logo.component';
import { flagUrl } from '@app/shared/data/flags';
import {
  ApplicationResponseDto,
  StatusHistoryDto,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@app/models/application.model';
import { ContactDto } from '@app/models/mailbox.model';
import { ContactService } from '@app/services/contact.service';
import { EmployeeService } from '@app/services/employee.service';
import { EmployeeDto } from '@app/models/employee.model';

interface StatusCount { status: string; label: string; color: string; count: number; }
interface ActivityEntry { appId: string; position: string; entry: StatusHistoryDto; }

@Component({
  selector: 'app-companies-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CompanyFormDialogComponent, ContactsExtractDialogComponent, ContactQuickActionsComponent, CompanyLogoComponent],
  templateUrl: './companies-detail.component.html',
  styleUrl: './companies-detail.component.scss',
})
export class CompaniesDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly companyService = inject(CompanyService);
  private readonly contactService = inject(ContactService);
  private readonly employeeService = inject(EmployeeService);
  private readonly toast = inject(ToastService);

  companyId = '';
  company = signal<CompanyDto | null>(null);
  applications = signal<ApplicationResponseDto[]>([]);
  contacts = signal<ContactDto[]>([]);
  employees = signal<EmployeeDto[]>([]);
  loading = signal(true);
  refreshing = signal(false);

  dialogOpen = signal(false);
  editingCompany = signal<CompanyDto | null>(null);
  extractOpen = signal(false);
  tab = signal<'overview' | 'apps' | 'people' | 'research'>('overview');
  protected readonly flagUrl = flagUrl;

  /** First three people (contacts before employees) for the Overview. */
  peoplePreview = computed(() => [...this.contacts(), ...this.employees()].slice(0, 3)
    .map(p => ({ id: p.id, name: p.name, position: p.position })));

  statusCounts = computed<StatusCount[]>(() => {
    const counts = new Map<string, number>();
    for (const a of this.applications()) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    return [...counts.entries()]
      .map(([status, count]) => ({
        status,
        label: STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status,
        color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'var(--text-3)',
        count,
      }))
      .sort((a, b) => b.count - a.count);
  });

  activity = computed<ActivityEntry[]>(() => {
    const out: ActivityEntry[] = [];
    for (const app of this.applications()) {
      for (const entry of app.history ?? []) out.push({ appId: app.id, position: app.positionTitle, entry });
    }
    return out
      .sort((x, y) => new Date(y.entry.changedAt).getTime() - new Date(x.entry.changedAt).getTime())
      .slice(0, 8);
  });

  constructor() {
    this.companyId = this.route.snapshot.paramMap.get('id') ?? '';
    void this.loadAll();
  }

  async loadAll() {
    this.loading.set(true);
    try {
      const [companyRes, appsRes, contactsRes] = await Promise.all([
        this.companyService.getCompany(this.companyId),
        this.companyService.getCompanyApplications(this.companyId),
        this.companyService.getCompanyContacts(this.companyId),
      ]);
      this.company.set(companyRes.data ?? null);
      this.applications.set(appsRes.data ?? []);
      this.contacts.set(contactsRes.data ?? []);
      await this.loadEmployees(companyRes.data?.name);
    } catch {
      this.toast.error('Failed to load company');
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  private async loadEmployees(companyName?: string): Promise<void> {
    const name = companyName ?? this.company()?.name;
    this.employees.set(name ? (await this.employeeService.list({ company: name })).data ?? [] : []);
  }

  openEdit() {
    this.editingCompany.set(this.company());
    this.dialogOpen.set(true);
  }

  onSaved(_updated: CompanyDto) {
    // Refresh everything in case the rename changed which apps/contacts match.
    void this.loadAll();
  }

  async onDelete() {
    const c = this.company();
    if (!c || !confirm(`Remove "${c.name}" from your list?`)) return;
    try {
      await this.companyService.deleteCompany(c.id);
      this.toast.success('Company removed');
      void this.router.navigate(['/companies']);
    } catch {
      this.toast.error('Failed to delete company');
    }
  }

  async toggleFavorite(c: ContactDto) {
    try {
      const res = await this.contactService.toggleFavorite(c.id);
      if (res.data) {
        this.contacts.update(list => list.map(x => (x.id === c.id ? res.data! : x)));
      }
    } catch {
      this.toast.error('Failed to update favorite');
    }
  }

  async deleteEmployee(e: EmployeeDto) {
    if (!confirm(`Remove "${e.name}" from this company's employees?`)) return;
    try {
      await this.employeeService.deleteById(e.id);
      this.employees.update(list => list.filter(x => x.id !== e.id));
      this.toast.success('Employee removed');
    } catch {
      this.toast.error('Failed to remove employee');
    }
  }

  /** One-click: copies this company's existing contacts into employee records (no re-paste). */
  async copyContactsToEmployees(): Promise<void> {
    const company = this.company()?.name ?? '';
    const contacts = this.contacts();
    if (contacts.length === 0) {
      this.toast.error('No contacts linked to this company');
      return;
    }
    const existing = new Set(this.employees().map(e => e.name.trim().toLowerCase()));
    const todo = contacts.filter(ct => !existing.has(ct.name.trim().toLowerCase()));
    if (todo.length === 0) {
      this.toast.info('All contacts are already saved as employees');
      return;
    }

    let ok = 0;
    let failed = 0;
    await Promise.all(
      todo.map(async (ct) => {
        try {
          await this.employeeService.create({
            name: ct.name.trim(),
            position: ct.position || undefined,
            company: ct.company?.trim() || company || undefined,
            email: ct.email || undefined,
            phone: ct.phone || undefined,
            linkedinUrl: ct.linkedinUrl || undefined,
            notes: ct.notes || undefined,
          });
          ok++;
        } catch {
          failed++;
        }
      }),
    );
    if (ok > 0) {
      await this.loadEmployees();
      this.toast.success(`${ok} contact(s) saved as employees`);
    }
    if (failed > 0) this.toast.error(`${failed} contact(s) failed to save`);
  }

  // ── Note editor ────────────────────────────────────────────────────────────
  editingNote = signal(false);
  noteDraft = signal('');

  startEditNote() {
    this.noteDraft.set(this.company()?.note ?? '');
    this.editingNote.set(true);
  }

  cancelNote() {
    this.editingNote.set(false);
  }

  async saveNote() {
    const c = this.company();
    if (!c) return;
    try {
      const res = await this.companyService.updateCompany(c.id, { note: this.noteDraft().trim() || undefined });
      if (res.success && res.data) {
        this.company.set(res.data);
        this.toast.success('Note saved');
      }
      this.editingNote.set(false);
    } catch {
      this.toast.error('Failed to save note');
    }
  }

  // ── Description editor ─────────────────────────────────────────────────────
  editingDesc = signal(false);
  descDraft = signal('');

  startEditDesc() {
    this.descDraft.set(this.company()?.description ?? '');
    this.editingDesc.set(true);
  }

  cancelDesc() {
    this.editingDesc.set(false);
  }

  async saveDesc() {
    const c = this.company();
    if (!c) return;
    try {
      const res = await this.companyService.updateCompany(c.id, { description: this.descDraft().trim() || undefined });
      if (res.success && res.data) {
        this.company.set(res.data);
        this.toast.success('Description saved');
      }
      this.editingDesc.set(false);
    } catch {
      this.toast.error('Failed to save description');
    }
  }

  generateDesc() {
    const c = this.company();
    if (!c) return;
    // Generate a description using available company data
    const lines: string[] = [c.name];
    if (c.description) lines.push(c.description);
    const loc = c.location || c.country;
    if (loc) lines.push(`based in ${loc}`);
    this.descDraft.set(lines.join(' '));
    this.editingDesc.set(true);
  }

  statusColor(status: string): string {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'var(--text-3)';
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
  }

  /** "website, LinkedIn, sector" — whichever the company is missing. */
  missingFields(c: CompanyDto): string {
    return [!c.websiteUrl && 'website', !c.linkedinUrl && 'LinkedIn', !c.sector && 'sector'].filter(Boolean).join(', ');
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
}
