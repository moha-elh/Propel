import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HttpService } from './http.service';
import { environment } from '@env/environment';
import { ApiResponse } from '../models/application.model';

export interface ImageDto {
  id: string;
  name: string;
  url: string;
  objectKey?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  source: 'upload' | 'web' | 'url';
  createdAt: string;
}

export interface ImageListResponse {
  items: ImageDto[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly http = inject(HttpService);
  private readonly httpClient = inject(HttpClient);

  list(params?: { page?: number; pageSize?: number; search?: string }): Promise<ApiResponse<ImageListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return this.http.get<ApiResponse<ImageListResponse>>(`/api/images${query ? `?${query}` : ''}`);
  }

  upload(file: File, name?: string): Promise<ApiResponse<ImageDto>> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (name && name.trim()) fd.append('name', name.trim());
    return this.http.post<ApiResponse<ImageDto>>('/api/images', fd);
  }

  fromUrl(url: string, name?: string): Promise<ApiResponse<ImageDto>> {
    return this.http.post<ApiResponse<ImageDto>>('/api/images/from-url', { url, name });
  }

  delete(id: string): Promise<void> {
    return this.http.delete<void>(`/api/images/${id}`);
  }

  // Raw bytes via the authenticated HTTP path, e.g. to build a data URL for a contact avatar.
  getFile(id: string): Promise<Blob> {
    const url = `${environment.apiUrl}/api/images/${id}/file`;
    return firstValueFrom(
      this.httpClient.get(url, {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  fileUrl(id: string, download = false): string {
    return `${environment.apiUrl}/api/images/${id}/file${download ? '?download=1' : ''}`;
  }

  formatSize(bytes?: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}