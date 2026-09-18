import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import { HttpService } from './http.service';
import { ApiResponse } from '../models/application.model';
import {
  CvDocumentDto,
  CvTemplateDto,
  CvTemplateInput,
  CvUpdateInput,
  CoverLetterDto,
  CoverLetterInput,
} from '../models/document.model';

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpService);
  private readonly httpClient = inject(HttpClient);

  // Raw bytes via the app's own authenticated HTTP path (cookies + interceptors).
  // Used to render a PDF from a blob: URL — iframe navigation can hit CORS /
  // browser-PDF-viewer walls that a same-origin fetch does not.
  getVersionFileBlob(versionId: string): Promise<Blob> {
    const url = `${environment.apiUrl}/api/cv/versions/${versionId}/file`;
    return firstValueFrom(
      this.httpClient.get(url, {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  // ── CVs ────────────────────────────────────────────────────────────────
  listCvs(): Promise<ApiResponse<CvDocumentDto[]>> {
    return this.http.get<ApiResponse<CvDocumentDto[]>>('/api/cv');
  }

  /**
   * CVs with versions whose PDF can actually be fetched right now.
   * Broken versions (missing storage objects) are dropped so pickers never
   * offer a CV that will fail to attach/preview.
   */
  async listUsableCvVersions(): Promise<CvDocumentDto[]> {
    const res = await this.listCvs();
    const docs = (res.success && res.data) ? res.data : [];
    const usable = new Set<string>();

    const probeUrl = async (url: string): Promise<boolean> => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(url, { method: 'GET', credentials: 'include', signal: ctrl.signal });
        r.body?.cancel();
        return r.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(t);
      }
    }

    const limiter = async (items: { versionId: string; key: string; cvId: string }[], limit: number) => {
      let i = 0;
      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
          const item = items[i++];
          const ok = await probeUrl(this.versionFileUrl(item.versionId));
          if (ok) usable.add(item.key);
        }
      });
      await Promise.all(workers);
    };

    const flat: { versionId: string; key: string; cvId: string }[] = [];
    for (const cv of docs) {
      for (const v of cv.versions) {
        if (!v.pdfUrl && !v.fileUrl) continue;
        flat.push({ versionId: v.id, key: `${cv.id}|${v.id}`, cvId: cv.id });
      }
    }
    await limiter(flat, 4);

    return docs
      .map(cv => ({
        ...cv,
        versions: cv.versions.filter(v => usable.has(`${cv.id}|${v.id}`)),
      }))
      .filter(cv => cv.versions.length > 0);
  }

  getCv(id: string): Promise<ApiResponse<CvDocumentDto>> {
    return this.http.get<ApiResponse<CvDocumentDto>>(`/api/cv/${id}`);
  }

  updateCv(id: string, dto: CvUpdateInput): Promise<ApiResponse<CvDocumentDto>> {
    return this.http.put<ApiResponse<CvDocumentDto>>(`/api/cv/${id}`, dto);
  }

  updateTags(id: string, tags: string[]): Promise<ApiResponse<CvDocumentDto>> {
    return this.http.patch<ApiResponse<CvDocumentDto>>(`/api/cv/${id}/tags`, { tags });
  }

  deleteCv(id: string): Promise<void> {
    return this.http.delete<void>(`/api/cv/${id}`);
  }

  uploadCv(file: File, title: string): Promise<ApiResponse<CvDocumentDto>> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('title', title);
    return this.http.post<ApiResponse<CvDocumentDto>>('/api/cv/upload', fd);
  }

  // Same-origin URL for inline PDF preview / download (the browser's PDF viewer
  // can't iframe the cross-origin MinIO URL directly — it needs CORS).
  versionFileUrl(versionId: string, download = false): string {
    return `${environment.apiUrl}/api/cv/versions/${versionId}/file${download ? '?download=1' : ''}`;
  }

  // Same-origin first-page PNG URL. When the version has no stored thumbnail
  // yet, this endpoint self-heals by generating one on first view (the saved
  // MinIO URL is preferred once it exists — public read, no request round-trip).
  versionThumbnailUrl(versionId: string): string {
    return `${environment.apiUrl}/api/cv/versions/${versionId}/thumbnail`;
  }

  // ── Templates ─────────────────────────────────────────────────────────
  listTemplates(): Promise<ApiResponse<CvTemplateDto[]>> {
    return this.http.get<ApiResponse<CvTemplateDto[]>>('/api/cv/templates');
  }

  createTemplate(input: CvTemplateInput): Promise<ApiResponse<CvTemplateDto>> {
    return this.http.post<ApiResponse<CvTemplateDto>>('/api/cv/templates', input);
  }

  updateTemplate(id: string, input: CvTemplateInput): Promise<ApiResponse<CvTemplateDto>> {
    return this.http.put<ApiResponse<CvTemplateDto>>(`/api/cv/templates/${id}`, input);
  }

  deleteTemplate(id: string): Promise<void> {
    return this.http.delete<void>(`/api/cv/templates/${id}`);
  }

  // ── Cover letters ───────────────────────────────────────────────────────

  listCoverLetters(): Promise<ApiResponse<CoverLetterDto[]>> {
    return this.http.get<ApiResponse<CoverLetterDto[]>>('/api/cover-letters');
  }

  createCoverLetter(input: CoverLetterInput): Promise<ApiResponse<CoverLetterDto>> {
    return this.http.post<ApiResponse<CoverLetterDto>>('/api/cover-letters', input);
  }

  updateCoverLetter(id: string, input: CoverLetterInput): Promise<ApiResponse<CoverLetterDto>> {
    return this.http.put<ApiResponse<CoverLetterDto>>(`/api/cover-letters/${id}`, input);
  }

  deleteCoverLetter(id: string): Promise<void> {
    return this.http.delete<void>(`/api/cover-letters/${id}`);
  }

  uploadCoverLetter(file: File, title: string, companyId?: string | null): Promise<ApiResponse<CoverLetterDto>> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('title', title);
    if (companyId) fd.append('companyId', companyId);
    return this.http.post<ApiResponse<CoverLetterDto>>('/api/cover-letters/upload', fd);
  }

  coverLetterVersionFileUrl(versionId: string, download = false): string {
    return `${environment.apiUrl}/api/cover-letters/versions/${versionId}/file${download ? '?download=1' : ''}`;
  }

  coverLetterVersionThumbnailUrl(versionId: string): string {
    return `${environment.apiUrl}/api/cover-letters/versions/${versionId}/thumbnail`;
  }

  getCoverLetterVersionFileBlob(versionId: string): Promise<Blob> {
    const url = `${environment.apiUrl}/api/cover-letters/versions/${versionId}/file`;
    return firstValueFrom(
      this.httpClient.get(url, { responseType: 'blob', withCredentials: true }),
    );
  }
}