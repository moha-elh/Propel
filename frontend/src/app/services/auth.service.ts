import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpService } from './http.service';

export interface User {
  userId: string;
  keycloakId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  avatarUrl?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: string;
    hasRefreshToken: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpService);

  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => this.currentUser() !== null);

  async checkAuth(): Promise<boolean> {
    try {
      const response = await this.http.get<ApiResponse<User>>('/api/auth/me');
      if (response.success && response.data) {
        this.currentUser.set(response.data);
        return true;
      }
    } catch {
      // Not authenticated or session expired
    }
    this.currentUser.set(null);
    return false;
  }

  async refreshUser(): Promise<void> {
    try {
      const response = await this.http.get<ApiResponse<User>>('/api/auth/me');
      if (response.success && response.data) {
        this.currentUser.set(response.data);
      }
    } catch {
      this.currentUser.set(null);
    }
  }

  async loginWithCredentials(email: string, password: string): Promise<User> {
    const response = await this.http.post<ApiResponse<User>>('/api/auth/login', { email, password });
    if (response.success && response.data) {
      this.currentUser.set(response.data);
      return response.data;
    }
    throw new Error(response.message || 'Login failed');
  }

  loginWithSso(provider?: string): void {
    const providerParam = provider ? `&provider=${encodeURIComponent(provider)}` : '';
    window.location.href = `${window.location.origin}/api/auth/login?returnUrl=${encodeURIComponent(window.location.origin + '/applications')}${providerParam}`;
  }

  logout(): void {
    this.currentUser.set(null);
    window.location.href = `${window.location.origin}/api/auth/logout`;
  }

  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.http.post<ApiResponse<object>>('/api/auth/register', data);
      if (response.success) {
        return { success: true, message: response.message || 'Registration successful' };
      }
      return { success: false, message: response.message || 'Registration failed' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Registration failed' };
    }
  }
}
