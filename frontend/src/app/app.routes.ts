import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'applications', pathMatch: 'full' },
  { path: 'about', loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent) },
  { path: 'contact', loadComponent: () => import('./pages/contact/contact-page.component').then(m => m.ContactPageComponent) },
  { path: 'profile', loadComponent: () => import('./pages/personal-info/personal-info.component').then(m => m.PersonalInfoComponent), canActivate: [authGuard] },
  {
    path: 'applications',
    loadComponent: () => import('./pages/applications/applications-layout.component').then(m => m.ApplicationsLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./pages/applications/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'generate', loadComponent: () => import('./pages/applications/generate-cv/template-workspace.component').then(m => m.TemplateWorkspaceComponent) },
      { path: 'generate/edit/:runId', loadComponent: () => import('./pages/applications/generate-cv/edit-cv.component').then(m => m.EditCvComponent) },
      { path: 'list', loadComponent: () => import('./pages/applications/list/applications-list.component').then(m => m.ApplicationsListComponent) },
      { path: 'kanban', loadComponent: () => import('./pages/applications/kanban/kanban.component').then(m => m.KanbanComponent) },
      { path: 'analytics', loadComponent: () => import('./pages/applications/analytics/analytics.component').then(m => m.AnalyticsComponent) },
      { path: 'calendar', loadComponent: () => import('./pages/applications/calendar/calendar.component').then(m => m.CalendarComponent) },
      { path: 'follow-ups', loadComponent: () => import('./pages/applications/follow-ups/follow-ups.component').then(m => m.FollowUpsComponent) },
    ],
  },
  { path: 'applications/new', loadComponent: () => import('./pages/applications/create/application-create.component').then(m => m.ApplicationCreateComponent), canActivate: [authGuard] },
  { path: 'applications/apply', loadComponent: () => import('./pages/applications/apply/apply-wizard.component').then(m => m.ApplyWizardComponent), canActivate: [authGuard] },
  { path: 'applications/:id', loadComponent: () => import('./pages/applications/detail/application-detail.component').then(m => m.ApplicationDetailComponent), canActivate: [authGuard] },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings-layout.component').then(m => m.SettingsLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'notifications', pathMatch: 'full' },
      { path: 'notifications', loadComponent: () => import('./pages/settings/notifications.component').then(m => m.NotificationsComponent) },
      { path: 'llm', loadComponent: () => import('./pages/settings/llm-settings.component').then(m => m.LlmSettingsComponent) },
    ],
  },
  {
    path: 'my-career',
    loadComponent: () => import('./pages/my-cv/my-cv.component').then(m => m.MyCvComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'projects', pathMatch: 'full' },
      { path: ':entity', loadComponent: () => import('./pages/entity-list/entity-list.component').then(m => m.EntityListComponent) },
      { path: ':entity/add', loadComponent: () => import('./shared/entity-form/entity-form.component').then(m => m.EntityFormComponent) },
      { path: ':entity/:id', loadComponent: () => import('./pages/entity-details/entity-details.component').then(m => m.EntityDetailsComponent) },
      { path: ':entity/:id/edit', loadComponent: () => import('./shared/entity-form/entity-form.component').then(m => m.EntityFormComponent) },
    ],
  },
  { path: 'mailbox', loadComponent: () => import('./pages/mailbox/mailbox.component').then(m => m.MailboxComponent), canActivate: [authGuard] },
  {
    path: 'documents',
    loadComponent: () => import('./pages/documents/documents-layout.component').then(m => m.DocumentsLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'cvs', pathMatch: 'full' },
      { path: 'cvs', loadComponent: () => import('./pages/documents/documents-cvs.component').then(m => m.DocumentsCvsComponent) },
      { path: 'letters', loadComponent: () => import('./pages/documents/documents-cover-letters.component').then(m => m.DocumentsCoverLettersComponent) },
      { path: 'templates', loadComponent: () => import('./pages/documents/documents-templates.component').then(m => m.DocumentsTemplatesComponent) },
      { path: 'images', loadComponent: () => import('./pages/documents/documents-images.component').then(m => m.DocumentsImagesComponent) },
    ],
  },
  { path: 'companies', loadComponent: () => import('./pages/companies/companies.component').then(m => m.CompaniesComponent), canActivate: [authGuard] },
  { path: 'companies/:id', loadComponent: () => import('./pages/companies/companies-detail/companies-detail.component').then(m => m.CompaniesDetailComponent), canActivate: [authGuard] },
  { path: 'company-research', loadComponent: () => import('./pages/company-research/company-research.component').then(m => m.CompanyResearchComponent), canActivate: [authGuard] },
  { path: 'company-research/:id', loadComponent: () => import('./pages/company-research-detail/company-research-detail.component').then(m => m.CompanyResearchDetailComponent), canActivate: [authGuard] },
  { path: 'skills', loadComponent: () => import('./pages/skills/skill-library.component').then(m => m.SkillLibraryComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: 'applications' },
];
