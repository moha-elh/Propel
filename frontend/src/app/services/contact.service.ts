import { Injectable, inject } from '@angular/core';
import { HttpService } from './http.service';
import { ApiResponse } from '../models/application.model';
import {
  ContactDto, CreateContactDto, UpdateContactDto, ContactListResponse,
  ContactHistoryResponse, ContactExtractResult,
} from '../models/mailbox.model';

@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly http = inject(HttpService);

  getContacts(params?: { page?: number; pageSize?: number; search?: string; favorite?: boolean }): Promise<ApiResponse<ContactListResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params?.search) qs.set('search', params.search);
    if (params?.favorite) qs.set('favorite', 'true');
    const query = qs.toString();
    return this.http.get<ApiResponse<ContactListResponse>>(`/api/contacts${query ? `?${query}` : ''}`);
  }

  getContact(id: string): Promise<ApiResponse<ContactDto>> {
    return this.http.get<ApiResponse<ContactDto>>(`/api/contacts/${id}`);
  }

  getApplicationsForContact(contactId: string): Promise<ApiResponse<import('../models/application.model').ApplicationResponseDto[]>> {
    return this.http.get<ApiResponse<import('../models/application.model').ApplicationResponseDto[]>>(`/api/contacts/${contactId}/applications`);
  }

  createContact(dto: CreateContactDto): Promise<ApiResponse<ContactDto>> {
    return this.http.post<ApiResponse<ContactDto>>('/api/contacts', dto);
  }

  updateContact(contactId: string, dto: UpdateContactDto): Promise<ApiResponse<ContactDto>> {
    return this.http.put<ApiResponse<ContactDto>>(`/api/contacts/${contactId}`, dto);
  }

  deleteContact(contactId: string): Promise<void> {
    return this.http.delete<void>(`/api/contacts/${contactId}`);
  }

  toggleFavorite(contactId: string): Promise<ApiResponse<ContactDto>> {
    return this.http.patch<ApiResponse<ContactDto>>(`/api/contacts/${contactId}/favorite`, {});
  }

  importCsv(csvContent: string): Promise<ApiResponse<{ imported: number; skipped: number }>> {
    return this.http.post<ApiResponse<{ imported: number; skipped: number }>>('/api/contacts/import-csv', { csvContent });
  }

  importFromOffers(): Promise<ApiResponse<{ imported: number; skipped: number }>> {
    return this.http.post<ApiResponse<{ imported: number; skipped: number }>>('/api/contacts/import-from-offers', {});
  }

  extractContacts(rows: CreateContactDto[]): Promise<ApiResponse<ContactExtractResult>> {
    return this.http.post<ApiResponse<ContactExtractResult>>('/api/contacts/extract', rows);
  }

  getContactHistory(contactId: string): Promise<ApiResponse<ContactHistoryResponse>> {
    return this.http.get<ApiResponse<ContactHistoryResponse>>(`/api/mailbox/contact-history/${contactId}`);
  }
}
