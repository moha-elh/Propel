import { Component, inject, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { environment } from '@env/environment';
import { EntityCardComponent } from '@app/shared/components/entity-card/entity-card.component';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';
import { CategoryTreeComponent } from '@app/shared/components/category-tree/category-tree.component';
import { ExportDialogComponent } from '@app/shared/components/export-dialog/export-dialog.component';
import { SheetImportDialogComponent, type ImportType } from '@app/shared/components/sheet-import-dialog/sheet-import-dialog.component';
import { CategoryService } from '@app/services/category.service';

@Component({
  selector: 'app-entity-list',
  standalone: true,
  imports: [CommonModule, RouterModule, EntityCardComponent, RefreshButtonComponent, CategoryTreeComponent, ExportDialogComponent, SheetImportDialogComponent],
  templateUrl: './entity-list.component.html',
  styleUrl: './entity-list.component.css',
})
export class EntityListComponent implements OnInit {
    private route:ActivatedRoute = inject(ActivatedRoute);
    private http = inject(HttpClient);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private categoryService = inject(CategoryService);

    entity= '';
    exportOpen = signal(false);
    importOpen = signal(false);

    get importType(): ImportType {
      return this.entity as unknown as ImportType;
    }
    data: any[]=[];
    refreshing = signal(false);
    selectedCategoryIds = signal<string[]>([]);
    matchedIds = signal<Set<string> | null>(null);

    private readonly TAXONOMY_SCOPES = new Set([
      'projects', 'experiences', 'educations', 'certifications',
      'skills', 'languages', 'hackathons', 'interests', 'academicactivities',
    ]);

  goToDetail(id: string){
    this.router.navigate(['/my-career', this.entity, id]);
  }

  displayData(): any[] {
    const matched = this.matchedIds();
    if (!matched) return this.data;
    return this.data.filter((d) => matched.has(d.id));
  }

  onCategoryChange(ids: string[]): void {
    this.selectedCategoryIds.set(ids);
    if (!ids || ids.length === 0) {
      this.matchedIds.set(null);
      return;
    }
    this.categoryService
      .search({ nodeIds: ids, sourceTypes: [this.entity.toLowerCase()] })
      .then((results) => {
        this.matchedIds.set(new Set(results.map((r) => r.sourceId)));
      })
      .catch(() => {
        this.matchedIds.set(null);
      });
  }


    ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.entity = params.get('entity') || '';
      this.loadData();
    });
  }

  loadData(){
    const url = `${environment.apiUrl}/api/user-content/${this.entity}?t=${new Date().getTime()}`;
    
    this.http.get<any>(url, { withCredentials: true }).subscribe({
      next: (response) => {
        this.data = response.data || [];
        this.refreshing.set(false);
        this.loadCategoryTags();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(`[EntityList] Error fetching ${this.entity}:`, err);
        this.refreshing.set(false);
        this.cdr.detectChanges();
      }
    });
  }

  onRefresh() {
    this.refreshing.set(true);
    this.loadData();
  }

  /** Attach taxonomy category names to each item so cards can show them. */
  private loadCategoryTags(): void {
    const scope = this.entity.toLowerCase();
    if (!this.TAXONOMY_SCOPES.has(scope)) return;
    Promise.all([
      this.categoryService.getTagsForScope(scope),
      this.categoryService.getNodeNameMap(scope),
    ])
      .then(([tagGroups, nameMap]) => {
        const byId = new Map<string, string[]>();
        for (const g of tagGroups) {
          byId.set(g.sourceId, (g.nodeIds || []).map((id) => nameMap.get(id) || id));
        }
        for (const item of this.data) {
          item._categories = byId.get(item.id) || [];
        }
        this.cdr.detectChanges();
      })
      .catch(() => {
        /* taxonomy tags are non-critical; ignore failures */
      });
  }

  getCardData(item: any) {
    const e = this.entity.toLowerCase();
    switch(e) {
      case 'cvprofiles':
        return { title: item.title, subtitle: item.summary, typeLabel: 'Profile', meta: '', footer: '' };
      case 'projects':
        return { title: item.title, subtitle: item.role, typeLabel: 'Project', meta: item.status, footer: this.formatDate(item.startDate), isCompleted: item.status === 'Completed' };
      case 'skills':
        return { title: item.name, subtitle: item.category, typeLabel: 'Skill', meta: item.level, footer: item.yearsOfExperience ? `${item.yearsOfExperience} years` : '' };
      case 'experiences':
        return { title: item.title, subtitle: item.company, typeLabel: 'Experience', meta: item.location, footer: this.formatDate(item.startDate), isCompleted: item.status === 'Completed' };
      case 'educations':
        return { title: item.institutionName || item.institution, subtitle: item.degreeType || item.degree, typeLabel: 'Education', meta: item.fieldOfStudy, footer: this.formatDate(item.startDate), isCompleted: item.status === 'Completed' };
      case 'certifications':
        return { title: item.name, subtitle: item.issuingOrganization, typeLabel: 'Certification', meta: '', footer: this.formatDate(item.issueDate) };
      case 'languages':
        return { title: item.name, subtitle: item.level, typeLabel: 'Language' };
      case 'interests':
        return { title: item.name, typeLabel: 'Interest' };
      case 'sociallinks':
        return { title: item.platform, subtitle: item.url, typeLabel: 'Social Link' };
      case 'academicactivities':
        return { title: item.title, subtitle: item.organization, typeLabel: 'Academic', footer: this.formatDate(item.startDate) };
      case 'hackathons':
        return { title: item.name, subtitle: item.role, typeLabel: 'Hackathon', meta: item.organization, footer: this.formatDate(item.date) };
      default:
        return { title: item.name || item.title, typeLabel: this.entity };
    }
  }

  formatDate(dateStr: string) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
}
