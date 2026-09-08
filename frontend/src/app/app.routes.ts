import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

import { ApplicationsLayoutComponent } from './pages/applications/applications-layout.component';
import { DashboardComponent } from './pages/applications/dashboard/dashboard.component';
import { TemplateWorkspaceComponent } from './pages/applications/generate-cv/template-workspace.component';
import { EditCvComponent } from './pages/applications/generate-cv/edit-cv.component';
import { ApplicationsListComponent } from './pages/applications/list/applications-list.component';
import { KanbanComponent } from './pages/applications/kanban/kanban.component';
import { AnalyticsComponent } from './pages/applications/analytics/analytics.component';
import { CalendarComponent } from './pages/applications/calendar/calendar.component';
import { ResumesComponent } from './pages/applications/resumes/resumes.component';
import { ApplicationDetailComponent } from './pages/applications/detail/application-detail.component';
import { ApplicationCreateComponent } from './pages/applications/create/application-create.component';
import { ApplyWizardComponent } from './pages/applications/apply/apply-wizard.component';
import { SettingsLayoutComponent } from './pages/settings/settings-layout.component';
import { NotificationsComponent } from './pages/settings/notifications.component';
import { LlmSettingsComponent } from './pages/settings/llm-settings.component';
import { AboutComponent } from './pages/about/about.component';
import { ContactPageComponent } from './pages/contact/contact-page.component';
// Reminders removed as they are now in Calendar

import { MailboxComponent } from './pages/mailbox/mailbox.component';
import { CompaniesComponent } from './pages/companies/companies.component';
import { CompaniesDetailComponent } from './pages/companies/companies-detail/companies-detail.component';
import { CompanyResearchComponent } from './pages/company-research/company-research.component';
import { CompanyResearchDetailComponent } from './pages/company-research-detail/company-research-detail.component';
import { MyCvComponent } from './pages/my-cv/my-cv.component';
import { PersonalInfoComponent } from './pages/personal-info/personal-info.component';
import { DocumentsLayoutComponent } from './pages/documents/documents-layout.component';
import { DocumentsCvsComponent } from './pages/documents/documents-cvs.component';
import { DocumentsTemplatesComponent } from './pages/documents/documents-templates.component';
import { DocumentsImagesComponent } from './pages/documents/documents-images.component';
import { EntityDetailsComponent } from './pages/entity-details/entity-details.component';
import { EntityListComponent } from './pages/entity-list/entity-list.component';
import { EntityFormComponent } from './shared/entity-form/entity-form.component';

export const routes: Routes = [
  { path: '', redirectTo: 'applications', pathMatch: 'full' },
  { path: 'about', component: AboutComponent },
  { path: 'contact', component: ContactPageComponent },
  { path: 'profile', component: PersonalInfoComponent, canActivate: [authGuard] },
  {
    path: 'applications',
    component: ApplicationsLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'generate', component: TemplateWorkspaceComponent },
      { path: 'generate/edit/:runId', component: EditCvComponent },
      { path: 'list', component: ApplicationsListComponent },
      { path: 'kanban', component: KanbanComponent },
      { path: 'analytics', component: AnalyticsComponent },
      { path: 'calendar', component: CalendarComponent },
      { path: 'resumes', component: ResumesComponent },
    ],
  },
  { path: 'applications/new', component: ApplicationCreateComponent, canActivate: [authGuard] },
  { path: 'applications/apply', component: ApplyWizardComponent, canActivate: [authGuard] },
  { path: 'applications/:id', component: ApplicationDetailComponent, canActivate: [authGuard] },
  {
    path: 'settings',
    component: SettingsLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'notifications', pathMatch: 'full' },
      { path: 'notifications', component: NotificationsComponent },
      { path: 'llm', component: LlmSettingsComponent },
    ],
  },
  {
    path: 'my-career',
    component: MyCvComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'projects', pathMatch: 'full' },
      { path: ':entity', component: EntityListComponent },
      { path: ':entity/add', component: EntityFormComponent },
      { path: ':entity/:id', component: EntityDetailsComponent },
      { path: ':entity/:id/edit', component: EntityFormComponent },
    ],
  },
  { path: 'mailbox', component: MailboxComponent, canActivate: [authGuard] },
  {
    path: 'documents',
    component: DocumentsLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'cvs', pathMatch: 'full' },
      { path: 'cvs', component: DocumentsCvsComponent },
      { path: 'templates', component: DocumentsTemplatesComponent },
      { path: 'images', component: DocumentsImagesComponent },
    ],
  },
  { path: 'companies', component: CompaniesComponent, canActivate: [authGuard] },
  { path: 'companies/:id', component: CompaniesDetailComponent, canActivate: [authGuard] },
  { path: 'company-research', component: CompanyResearchComponent, canActivate: [authGuard] },
  { path: 'company-research/:id', component: CompanyResearchDetailComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'applications' },
];
