import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '@app/services/auth.service';
import { APP_NAME } from '@app/app-name';
import { ExportDialogComponent } from '@app/shared/components/export-dialog/export-dialog.component';
import { SheetImportDialogComponent, type ImportType } from '@app/shared/components/sheet-import-dialog/sheet-import-dialog.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, ExportDialogComponent, SheetImportDialogComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  appName = APP_NAME;
  authService = inject(AuthService);
  router = inject(Router);

  pageName = 'Dashboard';

  isLoggedIn = computed(() => !!this.authService.currentUser());

  exportOpen = signal(false);
  importMenuOpen = signal(false);
  importType = signal<ImportType | null>(null);

  openImport(type: ImportType): void {
    this.importType.set(type);
    this.importMenuOpen.set(false);
  }

  private readonly ROUTE_NAMES: Record<string, string> = {
    '/applications/dashboard': 'Dashboard',
    '/applications/generate':  'Generate CV',
    '/applications/kanban':    'Applications',
    '/applications/list':      'Applications',
    '/applications/analytics': 'Analytics',
    '/applications/calendar':  'Calendar',
    '/my-career':              'My Career',
    '/agents-hub':             'Agents Hub',
    '/agents-hub/guide':       'Agent Guide',
    '/agents-hub/job-crawler': 'Job Crawler',
    '/agents-hub/template-agent': 'Template Agent',
    '/job-offers':             'Job Offers',
    '/companies':              'Companies',
    '/companies/:id':          'Company Details',
    '/company-research':       'Company Research',
    '/company-research/:id':   'Research Details',
    '/settings':               'Settings',
  };

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      const url: string = e.urlAfterRedirects || e.url;
      const match = Object.keys(this.ROUTE_NAMES)
        .sort((a, b) => b.length - a.length)
        .find(k => url.startsWith(k));
      this.pageName = match ? this.ROUTE_NAMES[match] : 'Dashboard';
    });
  }

  initials = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return '?';
    return (user.firstName[0] + user.lastName[0]).toUpperCase();
  });

  userFullName = computed(() => {
    const user = this.authService.currentUser();
    return user ? `${user.firstName} ${user.lastName}` : 'Guest';
  });

  logout(): void {
    this.authService.logout();
  }
}
