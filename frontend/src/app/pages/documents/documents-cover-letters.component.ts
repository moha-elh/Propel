import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentsService } from '@app/services/documents.service';
import { CompanyService, CompanyDto } from '@app/services/company.service';
import { ToastService } from '@app/services/toast.service';
import { ConfirmService } from '@app/services/confirm.service';
import { extractError } from '@app/shared/error-utils';
import { CoverLetterDto, CoverLetterVersionDto } from '@app/models/document.model';

@Component({
  selector: 'app-documents-cover-letters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documents-cover-letters.component.html',
  styleUrl: './documents-cover-letters.component.scss',
})
export class DocumentsCoverLettersComponent implements OnInit, OnDestroy {
  protected readonly service = inject(DocumentsService);
  private readonly companiesService = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly sanitizer = inject(DomSanitizer);

  letters = signal<CoverLetterDto[]>([]);
  companies = signal<CompanyDto[]>([]);
  loading = signal(true);
  uploading = signal(false);

  uploadOpen = signal(false);
  uploadFile = signal<File | null>(null);
  uploadTitle = signal('');
  uploadCompanyId = signal<string | null>(null);

  creating = signal(false);
  createTitle = signal('');
  createCompanyId = signal<string | null>(null);
  createIsActive = signal(true);
  createText = signal('');
  createIncludeTitle = signal(true);

  editing = signal<CoverLetterDto | null>(null);
  editTitle = signal('');
  editCompanyId = signal<string | null>(null);
  editIsActive = signal(true);
  saving = signal(false);

  previewVersion = signal<CoverLetterVersionDto | null>(null);
  previewLoading = signal(false);
  pdfBlobUrl = signal<string | null>(null);

  previewUrl = computed<SafeResourceUrl | string>(() => {
    const url = this.pdfBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : '';
  });

  downloadUrl = computed(() => {
    const version = this.previewVersion();
    return version ? this.service.coverLetterVersionFileUrl(version.id, true) : '';
  });

  async ngOnInit() {
    await Promise.all([this.load(), this.loadCompanies()]);
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.service.listCoverLetters();
      this.letters.set(res.data ?? []);
    } catch (err) {
      this.toast.error(extractError(err, 'Failed to load cover letters'));
    } finally {
      this.loading.set(false);
    }
  }

  async loadCompanies() {
    try {
      const res = await this.companiesService.getCompanies({ pageSize: 300, sortBy: 'name', sortDir: 'asc' });
      this.companies.set(res.data?.items ?? []);
    } catch {
      // Non-fatal — letters still render with the company name the server sent.
    }
  }

  companyNameOf(id: string | null | undefined): string {
    if (!id) return 'General';
    return this.companies().find(c => c.id === id)?.name ?? '';
  }

  toggleUpload(): void {
    this.uploadOpen.update(v => !v);
  }

  openCreate(): void {
    this.createTitle.set('');
    this.createCompanyId.set(null);
    this.createIsActive.set(true);
    this.createText.set('');
    this.createIncludeTitle.set(true);
    this.creating.set(true);
  }

  closeCreate(): void {
    this.creating.set(false);
  }

  async doCreate(): Promise<void> {
    if (!this.createTitle().trim()) {
      this.toast.error('Title is required');
      return;
    }
    this.saving.set(true);
    try {
      const text = this.createText().trim();
      const res = await this.service.createCoverLetter({
        title: this.createTitle().trim(),
        companyId: this.createCompanyId() || null,
        isActive: this.createIsActive(),
        includeTitleInPdf: this.createIncludeTitle(),
        ...(text ? { text } : {}),
      });
      this.toast.success(res.message ?? 'Cover letter created');
      this.closeCreate();
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Create failed'));
    } finally {
      this.saving.set(false);
    }
  }

  previewVersionOf(letter: CoverLetterDto): CoverLetterVersionDto | null {
    return letter.versions.find(v => v.pdfUrl) ?? letter.versions[0] ?? null;
  }

  canPreview(letter: CoverLetterDto): boolean {
    return this.previewVersionOf(letter) !== null;
  }

  thumbSrc(letter: CoverLetterDto): string | null {
    const v = this.previewVersionOf(letter);
    if (!v) return null;
    return v.thumbnailUrl ?? this.service.coverLetterVersionThumbnailUrl(v.id);
  }

  onFileSelected(event: Event): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    this.uploadFile.set(file);
    this.uploadTitle.set(file.name.replace(/\.[^.]+$/, ''));
  }

  clearFileInput(): void {
    const el = document.getElementById('cl-file-input') as HTMLInputElement | null;
    if (el) el.value = '';
  }

  async doUpload(): Promise<void> {
    const file = this.uploadFile();
    if (!file) {
      this.toast.error('Choose a file first');
      return;
    }
    this.uploading.set(true);
    try {
      const res = await this.service.uploadCoverLetter(
        file,
        this.uploadTitle().trim() || file.name,
        this.uploadCompanyId() || null,
      );
      this.toast.success(res.message ?? 'Cover letter uploaded');
      this.uploadFile.set(null);
      this.uploadTitle.set('');
      this.uploadCompanyId.set(null);
      this.clearFileInput();
      this.uploadOpen.set(false);
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Upload failed'));
    } finally {
      this.uploading.set(false);
    }
  }

  openEdit(letter: CoverLetterDto): void {
    this.editing.set(letter);
    this.editTitle.set(letter.title);
    this.editCompanyId.set(letter.companyId ?? null);
    this.editIsActive.set(letter.isActive);
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  async doEdit(): Promise<void> {
    const letter = this.editing();
    if (!letter) return;
    if (!this.editTitle().trim()) {
      this.toast.error('Title is required');
      return;
    }
    this.saving.set(true);
    try {
      const res = await this.service.updateCoverLetter(letter.id, {
        title: this.editTitle().trim(),
        companyId: this.editCompanyId() || null,
        isActive: this.editIsActive(),
      });
      this.toast.success(res.message ?? 'Cover letter updated');
      this.closeEdit();
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Update failed'));
    } finally {
      this.saving.set(false);
    }
  }

  async openPreview(version: CoverLetterVersionDto): Promise<void> {
    const old = this.pdfBlobUrl();
    if (old) URL.revokeObjectURL(old);
    this.pdfBlobUrl.set(null);
    this.previewVersion.set(version);
    this.previewLoading.set(true);
    try {
      const blob = await this.service.getCoverLetterVersionFileBlob(version.id);
      if (this.previewVersion()?.id !== version.id) return;
      this.pdfBlobUrl.set(URL.createObjectURL(blob));
    } catch (err) {
      this.toast.error(extractError(err, 'Failed to load PDF preview'));
    } finally {
      this.previewLoading.set(false);
    }
  }

  closePreview(): void {
    const blob = this.pdfBlobUrl();
    if (blob) URL.revokeObjectURL(blob);
    this.pdfBlobUrl.set(null);
    this.previewVersion.set(null);
  }

  ngOnDestroy(): void {
    const blob = this.pdfBlobUrl();
    if (blob) URL.revokeObjectURL(blob);
  }

  async deleteLetter(letter: CoverLetterDto): Promise<void> {
    const confirmed = await this.confirm.confirm({
      message: `Delete cover letter "${letter.title}"? This removes all its versions.`,
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.service.deleteCoverLetter(letter.id);
      this.toast.success('Cover letter deleted');
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Delete failed'));
    }
  }
}