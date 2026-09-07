import { Component, inject, input, model, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ImageDto, ImageService } from '@app/services/image.service';
import { ToastService } from '@app/services/toast.service';

@Component({
  selector: 'app-image-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-picker.component.html',
  styleUrl: './image-picker.component.scss',
})
export class ImagePickerComponent {
  private readonly imageService = inject(ImageService);
  private readonly toast = inject(ToastService);

  /** Two-way bound visibility; parent uses [(open)]. */
  open = model(false);
  title = input('Choose an image');
  /** Initial tab when the picker opens (default 'library'). */
  initialMode = input<'library' | 'upload' | 'url'>('library');
  /** Allow uploading a new file straight from the picker (default true). */
  allowUpload = input(true);
  /** Allow pasting an external URL (default true). */
  allowUrl = input(true);
  /** Emits the chosen image (from the library, uploaded, or pasted URL). */
  selected = output<ImageDto>();

  images = signal<ImageDto[]>([]);
  total = signal(0);
  loading = signal(false);
  error = signal('');
  mode = signal<'library' | 'upload' | 'url'>('library');
  search = signal('');
  urlInput = signal('');
  uploading = signal(false);
  dragged = signal(false);
  searchTimer: ReturnType<typeof setTimeout> | null = null;

  openModal(): void {
    this.error.set('');
    this.mode.set(this.initialMode());
    this.load().then(() => undefined);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await this.imageService.list({ page: 1, pageSize: 200, search: this.search().trim() || undefined });
      this.images.set(res.data?.items ?? []);
      this.total.set(res.data?.total ?? 0);
    } catch {
      this.error.set('Failed to load your image library');
    } finally {
      this.loading.set(false);
    }
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  choose(image: ImageDto): void {
    this.selected.emit(image);
    this.open.set(false);
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.upload(input.files?.[0]);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragged.set(false);
    const file = event.dataTransfer?.files?.[0];
    this.upload(file);
  }

  async upload(file?: File): Promise<void> {
    if (!file) return;
    this.uploading.set(true);
    this.error.set('');
    try {
      const res = await this.imageService.upload(file);
      const img = res.data;
      if (!img) throw new Error('empty response');
      this.images.set([img, ...this.images()]);
      this.toast.success('Image uploaded');
      this.choose(img);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }

  async addFromUrl(): Promise<void> {
    const url = this.urlInput().trim();
    if (!/^https?:\/\//i.test(url)) {
      this.toast.error('Enter a valid http(s) image URL');
      return;
    }
    this.uploading.set(true);
    this.error.set('');
    try {
      const res = await this.imageService.fromUrl(url);
      const img = res.data;
      if (!img) throw new Error('empty response');
      this.images.set([img, ...this.images()]);
      this.toast.success('Image added');
      this.choose(img);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.toast.error(msg || 'Could not add image from URL');
    } finally {
      this.uploading.set(false);
    }
  }

  close(): void {
    this.open.set(false);
  }
}