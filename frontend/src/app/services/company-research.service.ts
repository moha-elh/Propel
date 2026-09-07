import { Injectable, inject } from '@angular/core';
import { HttpService } from './http.service';
import { ApiResponse } from '../models/application.model';
import { CompanyDto } from './company.service';

export const COMPANY_RESEARCH_DATA_TYPES = [
  { key: 'emails', label: 'Emails', icon: 'ti ti-mail', desc: 'Contact email addresses' },
  { key: 'phones', label: 'Phones', icon: 'ti ti-phone', desc: 'Contact phone numbers' },
  { key: 'social', label: 'Social links', icon: 'ti ti-share', desc: 'LinkedIn, Twitter, Facebook, Instagram …' },
  { key: 'address', label: 'Address', icon: 'ti ti-map-pin', desc: 'Headquarters / office address' },
  { key: 'about', label: 'About', icon: 'ti ti-info-circle', desc: 'Short factual company summary' },
  { key: 'facts', label: 'Company facts', icon: 'ti ti-list-check', desc: 'Founded year, size, products, milestones' },
] as const;

export type CompanyResearchDataType = (typeof COMPANY_RESEARCH_DATA_TYPES)[number]['key'];

export interface CompanyResearchRequest {
  companyId: string;
  dataTypes: string[];
}

@Injectable({ providedIn: 'root' })
export class CompanyResearchService {
  private readonly http = inject(HttpService);

  /** Enrich one company from its homepage and save the result back to the company record. */
  research(companyId: string, dataTypes: string[]): Promise<ApiResponse<CompanyDto>> {
    return this.http.post<ApiResponse<CompanyDto>>('/api/company-research/research', { companyId, dataTypes } satisfies CompanyResearchRequest);
  }
}