import { Injectable, inject } from '@angular/core';
import { HttpService } from '../services/http.service';
import {
  ApplicationResponseDto,
  ApplicationListDto,
  ApplicationStatisticsDto,
  AnalyticsSummaryDto,
  StatisticsTrendsDto,
  ActivityFeedDto,
  CreateApplicationDto,
  UpdateStatusDto,
  UpdateApplicationDto,
  DuplicateCheckRequestDto,
  DuplicateCheckResponseDto,
  AttemptResponseDto,
  CreateAttemptDto,
  UpdateAttemptDto,
  ContactSummaryDto,
  ApiResponse,
} from '../models/application.model';
import { CalendarEventDto } from '@app/models/calendar-event.model';

@Injectable({
  providedIn: 'root',
})
export class ApplicationService {
  private http = inject(HttpService);

  async getAll(params?: {
    candidateId?: string;
    page?: number;
    pageSize?: number;
    statuses?: string[];
    search?: string;
    appliedFrom?: string;
    appliedTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sortBy?: string;
    sortDir?: string;
  }): Promise<ApiResponse<ApplicationListDto>> {
    const qs = new URLSearchParams();
    if (params?.candidateId) qs.set('candidateId', params.candidateId);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params?.statuses?.length) qs.set('statuses', params.statuses.join(','));
    if (params?.search) qs.set('search', params.search);
    if (params?.appliedFrom) qs.set('appliedFrom', params.appliedFrom);
    if (params?.appliedTo) qs.set('appliedTo', params.appliedTo);
    if (params?.updatedFrom) qs.set('updatedFrom', params.updatedFrom);
    if (params?.updatedTo) qs.set('updatedTo', params.updatedTo);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortDir) qs.set('sortDir', params.sortDir);
    const query = qs.toString();
    return this.http.get<ApiResponse<ApplicationListDto>>(
      `/api/applications${query ? `?${query}` : ''}`,
    );
  }

  async getById(id: string): Promise<ApiResponse<ApplicationResponseDto>> {
    return this.http.get<ApiResponse<ApplicationResponseDto>>(`/api/applications/${id}`);
  }

  async checkDuplicate(dto: DuplicateCheckRequestDto): Promise<ApiResponse<DuplicateCheckResponseDto>> {
    return this.http.post<ApiResponse<DuplicateCheckResponseDto>>('/api/applications/check-duplicate', dto);
  }

  async create(dto: CreateApplicationDto): Promise<ApiResponse<ApplicationResponseDto>> {
    return this.http.post<ApiResponse<ApplicationResponseDto>>('/api/applications', dto);
  }

  async updateStatus(id: string, dto: UpdateStatusDto): Promise<ApiResponse<ApplicationResponseDto>> {
    return this.http.patch<ApiResponse<ApplicationResponseDto>>(`/api/applications/${id}/status`, dto);
  }

  async update(id: string, dto: UpdateApplicationDto): Promise<ApiResponse<ApplicationResponseDto>> {
    return this.http.put<ApiResponse<ApplicationResponseDto>>(`/api/applications/${id}`, dto);
  }

  setLinkedEmail(id: string, emailMessageId: string | null): Promise<ApiResponse<ApplicationResponseDto>> {
    return this.http.put<ApiResponse<ApplicationResponseDto>>(`/api/applications/${id}/linked-email`, { emailMessageId });
  }

  async delete(id: string): Promise<void> {
    return this.http.delete<void>(`/api/applications/${id}`);
  }

  async getStatistics(params?: {
    candidateId?: string;
  }): Promise<ApiResponse<ApplicationStatisticsDto>> {
    const query = params?.candidateId ? `?candidateId=${params.candidateId}` : '';
    return this.http.get<ApiResponse<ApplicationStatisticsDto>>(`/api/applications/statistics${query}`);
  }

  async getTrends(params?: {
    candidateId?: string;
  }): Promise<ApiResponse<StatisticsTrendsDto>> {
    const query = params?.candidateId ? `?candidateId=${params.candidateId}` : '';
    return this.http.get<ApiResponse<StatisticsTrendsDto>>(`/api/applications/statistics/trends${query}`);
  }

  async getAnalyticsSummary(params?: {
    candidateId?: string;
  }): Promise<ApiResponse<AnalyticsSummaryDto>> {
    const query = params?.candidateId ? `?candidateId=${params.candidateId}` : '';
    return this.http.get<ApiResponse<AnalyticsSummaryDto>>(`/api/applications/analytics/summary${query}`);
  }

  async toggleSave(id: string): Promise<ApiResponse<boolean>> {
    return this.http.patch<ApiResponse<boolean>>(`/api/applications/${id}/toggle-save`, {});
  }

  async getCalendarEvents(params: {
    from: string;
    to: string;
    statuses?: string[];
  }): Promise<ApiResponse<CalendarEventDto[]>> {
    const qs = new URLSearchParams();
    qs.set('from', params.from);
    qs.set('to', params.to);
    if (params.statuses?.length) qs.set('statuses', params.statuses.join(','));
    const query = qs.toString();
    return this.http.get<ApiResponse<CalendarEventDto[]>>(`/api/applications/calendar-events?${query}`);
  }

  async getActivity(params?: {
    candidateId?: string;
    limit?: number;
  }): Promise<ApiResponse<ActivityFeedDto>> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.http.get<ApiResponse<ActivityFeedDto>>(`/api/applications/activity${query ? `?${query}` : ''}`);
  }

  // ── Attempts (apply / re-apply actions) ─────────────────────────────────────

  async getAttempts(applicationId: string): Promise<ApiResponse<AttemptResponseDto[]>> {
    return this.http.get<ApiResponse<AttemptResponseDto[]>>(`/api/applications/${applicationId}/attempts`);
  }

  async createAttempt(
    applicationId: string,
    dto: CreateAttemptDto,
  ): Promise<ApiResponse<AttemptResponseDto>> {
    return this.http.post<ApiResponse<AttemptResponseDto>>(`/api/applications/${applicationId}/attempts`, dto);
  }

  async updateAttempt(
    applicationId: string,
    attemptId: string,
    dto: UpdateAttemptDto,
  ): Promise<ApiResponse<AttemptResponseDto>> {
    return this.http.patch<ApiResponse<AttemptResponseDto>>(
      `/api/applications/${applicationId}/attempts/${attemptId}`,
      dto,
    );
  }

  /** Contacts matching the application's company (favorites first). */
  async getSuggestedContacts(applicationId: string): Promise<ApiResponse<ContactSummaryDto[]>> {
    return this.http.get<ApiResponse<ContactSummaryDto[]>>(`/api/applications/${applicationId}/suggested-contacts`);
  }

  /** Applications reached through a contact (null → contact not found). */
  async getApplicationsForContact(contactId: string): Promise<ApiResponse<ApplicationResponseDto[] | null>> {
    return this.http.get<ApiResponse<ApplicationResponseDto[] | null>>(`/api/contacts/${contactId}/applications`);
  }
}
