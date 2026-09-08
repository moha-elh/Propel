import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

const AUTH_TIMEOUT = 10_000;

// Single-user, no-auth app: populate the current user (for greeting/avatar) but
// never block navigation or redirect to a login page.
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  await Promise.race([
    authService.checkAuth(),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), AUTH_TIMEOUT)),
  ]);
  return true;
};
