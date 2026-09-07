import { Injectable, inject } from '@angular/core';
import { HttpService } from './http.service';
import { UserProfile, UpdateUserProfileDto } from '../models/user-profile.model';

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private http = inject(HttpService);

  async getMyProfile(): Promise<UserProfile | null> {
    const res = await this.http.get<ApiResponse<UserProfile>>('/api/users/me');
    return res.data ?? null;
  }

  async updateProfile(id: string, dto: UpdateUserProfileDto): Promise<UserProfile | null> {
    const res = await this.http.put<ApiResponse<UserProfile>>(`/api/users/${id}`, dto as object);
    return res.data ?? null;
  }

  /**
   * Applies a few profile fields without clobbering the rest: fetches the current
   * profile, re-serializes it to the full update DTO, then overrides the given fields.
   */
  async applyFields(fields: Partial<UpdateUserProfileDto>): Promise<UserProfile | null> {
    const p = await this.getMyProfile();
    if (!p) return null;
    const dto: UpdateUserProfileDto = {
      firstName: p.firstName,
      lastName: p.lastName,
      phoneNumber: p.phoneNumber,
      birthDate: p.birthDate,
      avatarUrl: p.avatarUrl,
      headline: p.headline,
      city: p.city,
      country: p.country,
      authorizedCountry: p.authorizedCountry,
      requiresVisaSponsorship: p.requiresVisaSponsorship,
      noticePeriod: p.noticePeriod,
      employmentTypes: Array.isArray(p.employmentTypes) ? JSON.stringify(p.employmentTypes) : p.employmentTypes,
      remotePreference: p.remotePreference,
      willingToRelocate: p.willingToRelocate,
      desiredJobTitle: p.desiredJobTitle,
      desiredSalaryMin: p.desiredSalaryMin,
      desiredSalaryMax: p.desiredSalaryMax,
      bio: p.bio,
      professionalTitles: Array.isArray(p.professionalTitles) ? JSON.stringify(p.professionalTitles) : p.professionalTitles,
      preferencesJson: p.preferencesJson,
      ...fields,
    };
    return this.updateProfile(p.id, dto);
  }
}
