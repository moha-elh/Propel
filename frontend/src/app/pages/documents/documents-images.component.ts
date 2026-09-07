import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImageDto, ImageService } from '@app/services/image.service';
import { UserProfileService } from '@app/services/user-profile.service';
import { ToastService } from '@app/services/toast.service';
import { ImagePickerComponent } from '@app/shared/components/image-picker/image-picker.component';

const PAGE_SIZE = 40;

@Component({
  selector: 'app-documents-images',
  standalone: true,
  imports: [CommonModule, FormsModule, ImagePickerComponent],
  templateUrl: './documents-images.component.html',
  styleUrl: './documents-images.component.scss',
})
export class DocumentsImagesComponent implements OnInit {
  private readonly imagesApi = inject(ImageService);
  private readonly profileSvc = inject(UserProfileService);
  private readonly toast = inject(ToastService);

  images = signal<ImageDto[]>([]);
  total = signal(0);
  loading = signal(true);
  uploadOpen = signal(false);
  uploadFile = signal<File | null>(null);
  uploading = signal(false);
  dragged = signal(false);
  search = signal('');
  searchTimer: ReturnType<typeof setTimeout> | null = null;
  pickerOpen = signal(false);

  ngOnInit() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.imagesApi.list({ page: 1, pageSize: PAGE_SIZE, search: this.search().trim() || undefined });
      this.images.set(res.data?.items ?? []);
      this.total.set(res.data?.total ?? 0);
    } catch {
      this.toast.error('Failed to load images');
    } finally {
      this.loading.set(false);
    }
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  toggleUpload(): void {
    this.uploadOpen.set(!this.uploadOpen());
    this.uploadFile.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.uploadFile.set(file ?? null);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragged.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadFile.set(file);
    if (file) this.uploadOpen.set(true);
  }

  async doUpload(): Promise<void> {
    const file = this.uploadFile();
    if (!file) {
      this.toast.error('Choose an image first');
      return;
    }
    this.uploading.set(true);
    try {
      const res = await this.imagesApi.upload(file, file.name);
      const img = res.data;
      if (!img) throw new Error('empty response');
      this.images.set([img, ...this.images()]);
      this.total.set(this.total() + 1);
      this.toast.success('Image uploaded');
      this.toggleUpload();
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }

  async onPicked(img: ImageDto): Promise<void> {
    this.uploadFile.set(null);
    this.images.set([img, ...this.images().filter(i => i.id !== img.id)]);
    if (!this.images().some(i => i.id === img.id)) this.total.set(this.total() + 1);
    this.toast.success('Image added');
  }

  async setCvPhoto(img: ImageDto): Promise<void> {
    if (!img.objectKey) {
      this.toast.error('URL-only images can\'t be used in the CV header — upload it or re-add it so it is downloaded');
      return;
    }
    try {
      await this.profileSvc.applyFields({ profilePhotoKey: img.objectKey });
      this.toast.success('CV profile photo set — it will appear in generated CV headers');
    } catch {
      this.toast.error('Failed to set CV photo');
    }
  }

  async setAvatar(img: ImageDto): Promise<void> {
    try {
      await this.profileSvc.applyFields({ avatarUrl: img.url });
      this.toast.success('Avatar updated');
    } catch {
      this.toast.error('Failed to update avatar');
    }
  }

  async copyUrl(img: ImageDto): Promise<void> {
    try {
      await navigator.clipboard.writeText(img.url);
      this.toast.success('URL copied');
    } catch {
      this.toast.error('Copy failed');
    }
  }

  async deleteImage(img: ImageDto): Promise<void> {
    if (!confirm(`Delete "${img.name}"?`)) return;
    try {
      await this.imagesApi.delete(img.id);
      this.images.set(this.images().filter(i => i.id !== img.id));
      this.total.set(this.total() - 1);
      this.toast.success('Image deleted');
    } catch {
      this.toast.error('Failed to delete image');
    }
  }

  imageUrl(img: ImageDto): string {
    return img.url;
  }

  srcLabel(source: ImageDto['source']): string {
    switch (source) {
      case 'upload': return 'Upload';
      case 'web': return 'Web';
      default: return 'URL';
    }
  }

  srcClass(source: ImageDto['source']): string {
    switch (source) {
      case 'upload': return 'upload';
      case 'web': return 'web';
      default: return 'url';
    }
  }
}