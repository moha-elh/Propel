import { Injectable, inject } from '@angular/core';
import { HttpService } from './http.service';
import { ApiResponse } from '../models/application.model';
import {
  EmployeeDto, CreateEmployeeDto, UpdateEmployeeDto, EmployeeExtractResult,
} from '../models/employee.model';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly http = inject(HttpService);

  list(params?: { company?: string; search?: string }): Promise<ApiResponse<EmployeeDto[]>> {
    const qs = new URLSearchParams();
    if (params?.company) qs.set('company', params.company);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return this.http.get<ApiResponse<EmployeeDto[]>>(`/api/employees${query ? `?${query}` : ''}`);
  }

  get(id: string): Promise<ApiResponse<EmployeeDto>> {
    return this.http.get<ApiResponse<EmployeeDto>>(`/api/employees/${id}`);
  }

  create(dto: CreateEmployeeDto): Promise<ApiResponse<EmployeeDto>> {
    return this.http.post<ApiResponse<EmployeeDto>>('/api/employees', dto);
  }

  update(id: string, dto: UpdateEmployeeDto): Promise<ApiResponse<EmployeeDto>> {
    return this.http.put<ApiResponse<EmployeeDto>>(`/api/employees/${id}`, dto);
  }

  deleteById(id: string): Promise<void> {
    return this.http.delete<void>(`/api/employees/${id}`);
  }

  extract(rows: CreateEmployeeDto[]): Promise<ApiResponse<EmployeeExtractResult>> {
    return this.http.post<ApiResponse<EmployeeExtractResult>>('/api/employees/extract', rows);
  }
}