import { Component, inject, computed, signal, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
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

  // ── Inline sidebar search ──
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  query = signal('');

  // Deep-link targets beyond the top-level nav (My Career tabs, settings, docs).
  private extraTargets: { label: string; route: string; group: string }[] = [
    { label: 'Projects',       route: '/my-career/projects',       group: 'My Career' },
    { label: 'Skills',         route: '/my-career/skills',         group: 'My Career' },
    { label: 'Experience',     route: '/my-career/experiences',    group: 'My Career' },
    { label: 'Education',      route: '/my-career/educations',     group: 'My Career' },
    { label: 'Certifications', route: '/my-career/certifications', group: 'My Career' },
    { label: 'Languages',      route: '/my-career/languages',      group: 'My Career' },
    { label: 'Social Links',   route: '/my-career/sociallinks',    group: 'My Career' },
    { label: 'Interests',      route: '/my-career/interests',      group: 'My Career' },
    { label: 'CVs',            route: '/documents/cvs',            group: 'Documents' },
    { label: 'Templates',      route: '/documents/templates',      group: 'Documents' },
    { label: 'Images',         route: '/documents/images',         group: 'Documents' },
    { label: 'LLM Settings',   route: '/settings/llm',             group: 'Settings' },
    { label: 'Notifications',  route: '/settings/notifications',   group: 'Settings' },
  ];

  private searchTargets = computed(() => [
    ...this.navMain.map(i => ({ label: i.label, route: i.route, group: 'Main' })),
    ...this.navLibrary.map(i => ({ label: i.label, route: i.route, group: 'Library' })),
    ...this.extraTargets,
  ]);

  results = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.searchTargets();
    if (!q) return all;
    return all.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  });

  focusSearch(): void {
    if (this.collapsed()) this.toggleSidebar();
    // Wait for the input to be visible after any expand.
    setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
  }

  go(route: string): void {
    this.query.set('');
    this.searchInput?.nativeElement.blur();
    this.router.navigate([route]);
  }

  goFirst(): void {
    const first = this.results()[0];
    if (first) this.go(first.route);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.focusSearch();
    } else if (e.key === 'Escape' && this.query()) {
      this.query.set('');
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

  navLibrary: NavItem[] = [
    { label: 'Mailbox', route: '/mailbox', icon: 'mailbox', exact: false, group: 'library' },
    { label: 'Documents', route: '/documents', icon: 'documents', exact: false, group: 'library' },
    { label: 'My Career', route: '/my-career', icon: 'user', exact: false, group: 'library' },
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
