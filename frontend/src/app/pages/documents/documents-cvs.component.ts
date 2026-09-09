import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { DocumentsService } from '@app/services/documents.service';
import { ToastService } from '@app/services/toast.service';
import { extractError } from '@app/shared/error-utils';
import { CvDocumentDto, CvTemplateDto, CvVersionDto } from '@app/models/document.model';

@Component({
  selector: 'app-documents-cvs',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './documents-cvs.component.html',
  styleUrl: './documents-cvs.component.scss',
})
export class DocumentsCvsComponent implements OnInit, OnDestroy {
  private readonly service = inject(DocumentsService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  cvs = signal<CvDocumentDto[]>([]);
  templates = signal<CvTemplateDto[]>([]);
  loading = signal(true);
  uploading = signal(false);

  uploadOpen = signal(false);
  uploadFile = signal<File | null>(null);
  uploadTitle = signal('');

  editingCv = signal<CvDocumentDto | null>(null);
  editTitle = signal('');
  editTemplateId = signal('');
  editIsActive = signal(true);
  saving = signal(false);

  previewVersion = signal<CvVersionDto | null>(null);
  previewLoading = signal(false);
  pdfBlobUrl = signal<string | null>(null);

  previewUrl = computed<SafeResourceUrl | string>(() => {
    const url = this.pdfBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : '';
  });

  downloadUrl = computed(() => {
    const version = this.previewVersion();
    return version ? this.service.versionFileUrl(version.id, true) : '';
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [cvsRes, templatesRes] = await Promise.all([
        this.service.listCvs(),
        this.service.listTemplates(),
      ]);
      this.cvs.set(cvsRes.data ?? []);
      this.templates.set(templatesRes.data ?? []);
    } catch (err) {
      this.toast.error(extractError(err, 'Failed to load CVs'));
    } finally {
      this.loading.set(false);
    }
  }

  toggleUpload(): void {
    this.uploadOpen.update(v => !v);
  }

  templateName(id: string): string {
    if (!id) return '—';
    if (id === 'uploaded') return 'Uploaded';
    return this.templates().find(t => t.id === id)?.name ?? id;
  }

  previewVersionOf(cv: CvDocumentDto): CvVersionDto | null {
    return cv.versions.find(v => v.pdfUrl) ?? cv.versions[0] ?? null;
  }

  canPreview(cv: CvDocumentDto): boolean {
    return this.previewVersionOf(cv) !== null;
  }

  thumbVersionOf(cv: CvDocumentDto): CvVersionDto | null {
    return cv.versions.find(v => v.pdfUrl) ?? null;
  }

  thumbSrc(cv: CvDocumentDto): string | null {
    const v = this.thumbVersionOf(cv);
    if (!v) return null;
    return v.thumbnailUrl ?? this.service.versionThumbnailUrl(v.id);
  }

  openPreviewFor(cv: CvDocumentDto): void {
    const version = this.previewVersionOf(cv);
    if (version) this.openPreview(version);
  }

  onFileSelected(event: Event): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    this.uploadFile.set(file);
    this.uploadTitle.set(file.name.replace(/\.[^.]+$/, ''));
  }

  clearFileInput(): void {
    const el = document.getElementById('cv-file-input') as HTMLInputElement | null;
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
      const res = await this.service.uploadCv(file, this.uploadTitle().trim() || file.name);
      this.toast.success(res.message ?? 'CV uploaded');
      this.uploadFile.set(null);
      this.uploadTitle.set('');
      this.clearFileInput();
      this.uploadOpen.set(false);
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Upload failed'));
    } finally {
      this.uploading.set(false);
    }
  }

  openEdit(cv: CvDocumentDto): void {
    this.editingCv.set(cv);
    this.editTitle.set(cv.title);
    this.editTemplateId.set(cv.templateId);
    this.editIsActive.set(cv.isActive);
  }

  closeEdit(): void {
    this.editingCv.set(null);
  }

  async doEdit(): Promise<void> {
    const cv = this.editingCv();
    if (!cv) return;
    if (!this.editTitle().trim()) {
      this.toast.error('Title is required');
      return;
    }
    this.saving.set(true);
    try {
      const res = await this.service.updateCv(cv.id, {
        title: this.editTitle().trim(),
        templateId: this.editTemplateId() || null,
        isActive: this.editIsActive(),
      });
      this.toast.success(res.message ?? 'CV updated');
      this.closeEdit();
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Update failed'));
    } finally {
      this.saving.set(false);
    }
  }

  async openPreview(version: CvVersionDto): Promise<void> {
    const old = this.pdfBlobUrl();
    if (old) URL.revokeObjectURL(old);
    this.pdfBlobUrl.set(null);
    this.previewVersion.set(version);
    this.previewLoading.set(true);
    try {
      const blob = await this.service.getVersionFileBlob(version.id);
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

  async deleteCv(cv: CvDocumentDto): Promise<void> {
    const confirmed = window.confirm(`Delete CV "${cv.title}"? This removes all its versions.`);
    if (!confirmed) return;
    try {
      await this.service.deleteCv(cv.id);
      this.toast.success('CV deleted');
      await this.load();
    } catch (err) {
      this.toast.error(extractError(err, 'Delete failed'));
    }
  }
}