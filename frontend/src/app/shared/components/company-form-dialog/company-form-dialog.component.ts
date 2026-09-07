import { Component, computed, inject, input, model, OnChanges, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompanyService, CompanyDto, CreateCompanyDto } from '@app/services/company.service';
import { ToastService } from '@app/services/toast.service';
import { COUNTRIES, MOROCCO_CITIES } from '@app/shared/data/geo-data';
import { AutoFillDialogComponent } from '@app/shared/components/auto-fill-dialog/auto-fill-dialog.component';
import { AutofillField } from '@app/services/autofill.service';
import { ImagePickerComponent } from '@app/shared/components/image-picker/image-picker.component';
import { ImageDto, ImageService } from '@app/services/image.service';

@Component({
  selector: 'app-company-form-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoFillDialogComponent, ImagePickerComponent],
  templateUrl: './company-form-dialog.component.html',
  styleUrl: './company-form-dialog.component.scss',
})
export class CompanyFormDialogComponent implements OnChanges {
  private readonly companyService = inject(CompanyService);
  private readonly imagesApi = inject(ImageService);
  private readonly toast = inject(ToastService);

  /** Two-way bound visibility; parent uses [(open)]. */
  open = model(false);
  /** Company being edited, or null/undefined for create mode. */
  editing = input<CompanyDto | null>(null);
  /** Optional company name prefill for create mode (e.g. coming from a detail page CTA). */
  prefillName = input('');
  /** Emits the created/updated company so parents can refresh or update in place. */
  saved = output<CompanyDto>();

  saving = signal(false);
  formName = signal('');
  formWebsite = signal('');
  formLocation = signal('');
  formCountry = signal('Morocco');
  formLocationUrl = signal('');
  formRegion = signal('');
  formSector = signal('');
  formFoundedYear = signal('');
  formLinkedinUrl = signal('');
  formSize = signal('');
  formNote = signal('');
  formDescription = signal('');
  formLogoUrl = signal('');
  formLogoImageId = signal('');

  logoMenuOpen = signal(false);
  logoUrlMode = signal(false);
  logoUrlDraft = signal('');
  logoUploading = signal(false);
  imagePickerOpen = signal(false);

  protected readonly COUNTRIES = COUNTRIES;

  citySuggestions = computed(() =>
    this.formCountry() === 'Morocco' ? MOROCCO_CITIES : []);

  autofillOpen = signal(false);

  autofillFields: AutofillField[] = [
    { name: 'formName', label: 'Company name', type: 'text' },
    { name: 'formWebsite', label: 'Website URL', type: 'url' },
    { name: 'formLocation', label: 'City', type: 'text' },
    { name: 'formCountry', label: 'Country', type: 'text' },
    { name: 'formLocationUrl', label: 'Location URL', type: 'url' },
    { name: 'formRegion', label: 'Region', type: 'text' },
    { name: 'formSector', label: 'Industry / Sector', type: 'text' },
    { name: 'formFoundedYear', label: 'Founded year', type: 'number' },
    { name: 'formLinkedinUrl', label: 'LinkedIn URL', type: 'url' },
    { name: 'formSize', label: 'Employee size', type: 'text' },
    { name: 'formNote', label: 'Note', type: 'textarea' },
    { name: 'formDescription', label: 'Description', type: 'textarea' },
  ];

  openAutofill(): void {
    this.autofillOpen.set(true);
  }

  // ── Logo ──────────────────────────────────────────────────────────────
  initials = computed(() => {
    const name = this.formName().trim();
    if (!name) return 'L';
    return name.slice(0, 2).toUpperCase();
  });

  toggleLogoMenu(): void {
    this.logoUrlMode.set(false);
    this.logoMenuOpen.set(!this.logoMenuOpen());
  }

  async onLogoFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.uploadLogoFile(file);
  }

  async onLogoDropped(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.uploadLogoFile(file);
  }

  private async uploadLogoFile(file: File): Promise<void> {
    this.logoUploading.set(true);
    try {
      const res = await this.imagesApi.upload(file, file.name);
      const img = res.data;
      if (!img) throw new Error('empty response');
      this.formLogoUrl.set(img.url);
      this.formLogoImageId.set(img.id);
      this.logoMenuOpen.set(false);
      this.toast.success('Logo uploaded');
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Logo upload failed');
    } finally {
      this.logoUploading.set(false);
    }
  }

  startLogoUrlMode(): void {
    this.logoUrlDraft.set(this.formLogoUrl() && !this.formLogoImageId() ? this.formLogoUrl() : '');
    this.logoUrlMode.set(true);
  }

  saveLogoUrl(): void {
    const url = this.logoUrlDraft().trim();
    if (url && !/^https?:\/\//i.test(url)) {
      this.toast.error('Enter a valid http(s) URL');
      return;
    }
    this.formLogoUrl.set(url);
    this.formLogoImageId.set('');
    this.logoUrlMode.set(false);
    this.logoMenuOpen.set(false);
  }

  onLogoPicked(img: ImageDto): void {
    this.formLogoUrl.set(img.url);
    this.formLogoImageId.set(img.id);
    this.logoMenuOpen.set(false);
    this.toast.success('Logo selected');
  }

  removeLogo(): void {
    this.formLogoUrl.set('');
    this.formLogoImageId.set('');
    this.logoMenuOpen.set(false);
  }

  applyAutofill(values: Record<string, any>): void {
    if (values['formName'] !== undefined) this.formName.set(String(values['formName']));
    if (values['formWebsite'] !== undefined) this.formWebsite.set(String(values['formWebsite']));
    if (values['formLocation'] !== undefined) this.formLocation.set(String(values['formLocation']));
    if (values['formCountry'] !== undefined) {
      const country = String(values['formCountry']);
      const countries = new Set((COUNTRIES as string[]).map(c => c.toLowerCase()));
      this.formCountry.set(countries.has(country.toLowerCase()) ? country : 'Morocco');
    }
    if (values['formLocationUrl'] !== undefined) this.formLocationUrl.set(String(values['formLocationUrl']));
    if (values['formRegion'] !== undefined) this.formRegion.set(String(values['formRegion']));
    if (values['formSector'] !== undefined) this.formSector.set(String(values['formSector']));
    if (values['formFoundedYear'] !== undefined) this.formFoundedYear.set(String(values['formFoundedYear']));
    if (values['formLinkedinUrl'] !== undefined) this.formLinkedinUrl.set(String(values['formLinkedinUrl']));
    if (values['formSize'] !== undefined) this.formSize.set(String(values['formSize']));
    if (values['formNote'] !== undefined) this.formNote.set(String(values['formNote']));
    if (values['formDescription'] !== undefined) this.formDescription.set(String(values['formDescription']));
  }

  ngOnChanges(): void {
    if (!this.open()) return;
    const c = this.editing();
    if (c) {
      this.formName.set(c.name);
      this.formWebsite.set(c.websiteUrl ?? '');
      this.formLocation.set(c.location ?? '');
      this.formCountry.set(c.country || 'Morocco');
      this.formLocationUrl.set(c.locationUrl ?? '');
      this.formRegion.set(c.region ?? '');
      this.formSector.set(c.sector ?? '');
      this.formFoundedYear.set(c.foundedYear ? String(c.foundedYear) : '');
      this.formLinkedinUrl.set(c.linkedinUrl ?? '');
      this.formSize.set(c.size ?? '');
      this.formLogoUrl.set(c.logoUrl ?? '');
      this.formLogoImageId.set(c.logoImageId ?? '');
      this.formNote.set(c.note ?? '');
      this.formDescription.set(c.description ?? '');
    } else {
      this.formName.set(this.prefillName());
      this.formWebsite.set('');
      this.formLocation.set('');
      this.formCountry.set('Morocco');
      this.formLocationUrl.set('');
      this.formRegion.set('');
      this.formSector.set('');
      this.formFoundedYear.set('');
      this.formLinkedinUrl.set('');
      this.formSize.set('');
      this.formLogoUrl.set('');
      this.formLogoImageId.set('');
      this.formNote.set('');
      this.formDescription.set('');
    }
  }

  close() {
    this.open.set(false);
  }

  async save() {
    const name = this.formName().trim();
    if (!name) {
      this.toast.error('Company name is required');
      return;
    }
    this.saving.set(true);
    try {
      const dto: CreateCompanyDto = {
        name,
        websiteUrl: this.formWebsite().trim() || undefined,
        location: this.formLocation().trim() || undefined,
        country: this.formCountry(),
        locationUrl: this.formLocationUrl().trim() || undefined,
        region: this.formRegion().trim() || undefined,
        sector: this.formSector().trim() || undefined,
        foundedYear: this.formFoundedYear().trim() ? Number(this.formFoundedYear().trim()) : undefined,
        linkedinUrl: this.formLinkedinUrl().trim() || undefined,
        size: this.formSize().trim() || undefined,
        logoUrl: this.formLogoUrl().trim() || '',
        logoImageId: this.formLogoImageId() || undefined,
        note: this.formNote().trim() || undefined,
        description: this.formDescription().trim() || undefined,
      };
      const editing = this.editing();
      const result = editing
        ? await this.companyService.updateCompany(editing.id, dto)
        : await this.companyService.createCompany(dto);
      const saved = result.data;
      if (!saved) throw new Error('empty response');
      this.toast.success(editing ? 'Company updated' : 'Company added');
      this.open.set(false);
      this.saved.emit(saved);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Something went wrong');
    } finally {
      this.saving.set(false);
    }
  }
}
