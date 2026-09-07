import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@app/services/auth.service';
import { APP_NAME } from '@app/app-name';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  exact?: boolean;
  accent?: boolean;
  group: 'main' | 'library' | 'agents';
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  appName = APP_NAME;
  private router = inject(Router);
  private authService = inject(AuthService);

  collapsed = signal(false);

  constructor() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('sb-collapsed') === '1') {
        this.collapsed.set(true);
      }
    } catch {
      /* ignore */
    }
  }

  toggleSidebar(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem('sb-collapsed', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }


  navMain: NavItem[] = [
    { label: 'Dashboard',    route: '/applications/dashboard', icon: 'dashboard', exact: false, group: 'main' },
    { label: 'Generate CV',  route: '/applications/generate',  icon: 'sparkle',   exact: false, accent: true, group: 'main' },
    { label: 'Applications', route: '/applications/kanban',    icon: 'kanban',    exact: false, group: 'main' },
    { label: 'Apply',        route: '/applications/apply',      icon: 'send',      exact: false, accent: true, group: 'main' },
    { label: 'Analytics',    route: '/applications/analytics', icon: 'analytics', exact: false, group: 'main' },
    { label: 'Calendar',     route: '/applications/calendar',  icon: 'calendar',  exact: false, group: 'main' },
  ];

  navAgents: NavItem[] = [
    { label: 'Agents Hub', route: '/agents-hub', icon: 'grid', exact: false, group: 'agents' },
  ];

  navLibrary: NavItem[] = [
    { label: 'Mailbox', route: '/mailbox', icon: 'mailbox', exact: false, group: 'library' },
    { label: 'Documents', route: '/documents', icon: 'documents', exact: false, group: 'library' },
    { label: 'My Career', route: '/my-career', icon: 'user', exact: false, group: 'library' },
    { label: 'Job Offers', route: '/job-offers', icon: 'briefcase', exact: false, group: 'library' },
    { label: 'Companies', route: '/companies', icon: 'building', exact: false, group: 'library' },
    { label: 'Research', route: '/company-research', icon: 'research', exact: false, group: 'library' },
  ];

  user = computed(() => this.authService.currentUser());

  avatarUrl = computed(() => this.user()?.avatarUrl ?? null);

  initials = computed(() => {
    const user = this.user();
    if (!user) return '?';
    return (user.firstName[0] + user.lastName[0]).toUpperCase();
  });

  userFullName = computed(() => {
    const user = this.user();
    return user ? `${user.firstName} ${user.lastName}` : 'Guest';
  });

  userEmail = computed(() => {
    return this.user()?.email ?? '';
  });

  goToProfile(): void {
    this.router.navigate(['/profile']);
  }

  logout(): void {
    this.authService.logout();
  }
}
