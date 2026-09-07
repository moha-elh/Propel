import { Component, inject, computed, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '@env/environment';
import { ENTITY_FIELDS, EntityType, FieldConfig } from '@app/models/user-content.models';
import { CategoryService } from '@app/services/category.service';
import { ToastService } from '@app/services/toast.service';
import { CategoryTreeComponent } from '@app/shared/components/category-tree/category-tree.component';
import { AutoFillDialogComponent } from '@app/shared/components/auto-fill-dialog/auto-fill-dialog.component';
import { AutofillField } from '@app/services/autofill.service';

@Component({
  selector: 'app-entity-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CategoryTreeComponent, AutoFillDialogComponent],
  templateUrl: './entity-form.component.html',
  styleUrl: './entity-form.component.css',
})
export class EntityFormComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private categoryService = inject(CategoryService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  entity: EntityType = 'projects';
  id: string | null = null;
  form: any = {};
  fields: any[] = [];
  fieldErrors: Record<string, string> = {};

  selectedCategoryIds = signal<string[]>([]);
  taxonomyOpen = signal(false);
  nameMap = signal<Map<string, string>>(new Map());
  saving = false;
  errorMessage: string | null = null;
  autofillOpen = signal(false);

  autofillFields = computed(() => this.fields);
  entityLabel: string = '';

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.entity = params.get('entity') as EntityType;
      this.id = params.get('id');
      this.fields = ENTITY_FIELDS[this.entity] || [];
      this.entityLabel = this.entity.replace(/s$/, '');
      this.loadCategoryNames();

      if (this.id) {
        this.initializeForm();
        this.loadData();
        this.loadTags();
      } else {
        this.initializeForm();
      }
    });
  }

  private loadCategoryNames(): void {
    this.categoryService
      .getTree(this.entity.toLowerCase())
      .then(nodes => {
        const map = new Map<string, string>();
        const walk = (list: any[]) => {
          for (const n of list) {
            map.set(n.id, n.name);
            if (n.children && n.children.length) walk(n.children);
          }
        };
        walk(nodes || []);
        this.nameMap.set(map);
      })
      .catch(() => this.nameMap.set(new Map<string, string>()));
  }

  categoryName(id: string): string {
    return this.nameMap().get(id) || id;
  }

  openTaxonomy(): void {
    this.taxonomyOpen.set(true);
  }

  closeTaxonomy(): void {
    this.taxonomyOpen.set(false);
  }

  initializeForm() {
    this.form = {};
    this.fields.forEach(field => {
      if (field.type === 'checkbox') {
        this.form[field.name] = false;
      } else if (field.type === 'select' && field.options) {
        this.form[field.name] = field.options[0];
      } else {
        this.form[field.name] = '';
      }
    });
  }

  loadData() {
    const url = `${environment.apiUrl}/api/user-content/${this.entity}/${this.id}`;
    this.http.get<any>(url, { withCredentials: true }).subscribe({
      next: (response) => {
        const data = response && response.data !== undefined ? response.data : response;
        if (data) {
          this.form = data;
          // <input type="date"> needs yyyy-MM-dd
          this.fields.forEach(field => {
            if (field.type === 'date' && this.form[field.name]) {
              const d = new Date(this.form[field.name]);
              if (!isNaN(d.getTime())) {
                this.form[field.name] = d.toISOString().slice(0, 10);
              }
            }
          });
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Load failed', err);
        this.cdr.detectChanges();
      },
    });
  }

  loadTags() {
    if (!this.id) return;
    this.categoryService
      .getTags(this.entity.toLowerCase(), this.id)
      .then(ids => this.selectedCategoryIds.set(ids))
      .catch(() => this.selectedCategoryIds.set([]));
  }

  onCategoryChange(ids: string[]): void {
    this.selectedCategoryIds.set(ids);
  }

  private sourceType(): string {
    return this.entity.toLowerCase();
  }

  openAutofill(): void {
    this.autofillOpen.set(true);
  }

  applyAutofill(values: Record<string, any>): void {
    this.fields.forEach((field: FieldConfig) => {
      if (values[field.name] === undefined) return;
      let value = values[field.name];
      if (field.type === 'number') {
        const n = Number(value);
        this.form[field.name] = isNaN(n) ? '' : n;
      } else if (field.type === 'date') {
        const s = String(value);
        this.form[field.name] = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
      } else if (field.type === 'select' && field.options) {
        const match = (field.options as string[]).find(o => o.toLowerCase() === String(value).toLowerCase());
        this.form[field.name] = match ?? String(value);
      } else if (field.type === 'checkbox') {
        this.form[field.name] = Boolean(value);
      } else {
        this.form[field.name] = String(value);
      }
    });
    this.cdr.detectChanges();
  }

  validate(): boolean {
    this.fieldErrors = {};
    let ok = true;
    for (const field of this.fields as FieldConfig[]) {
      const value = this.form[field.name];
      if (field.required) {
        const empty =
          value === undefined || value === null ||
          (field.type === 'checkbox' ? !value : String(value).trim() === '');
        if (empty) {
          this.fieldErrors[field.name] = `${field.label} is required.`;
          ok = false;
        }
      }
      if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
        this.fieldErrors[field.name] = `${field.label} must be at most ${field.maxLength} characters.`;
        ok = false;
      }
    }
    return ok;
  }

  clearFieldError(name: string): void {
    if (this.fieldErrors[name]) {
      delete this.fieldErrors[name];
    }
  }

  submit() {
    if (this.saving) return;
    if (!this.validate()) {
      this.toast.error('Please fix the highlighted fields before saving.');
      this.cdr.detectChanges();
      return;
    }
    this.saving = true;
    this.errorMessage = null;

    const payload: any = {};
    this.fields.forEach(field => {
      const value = this.form[field.name];
      if (field.type === 'date') {
        payload[field.name] = value && value !== '' ? new Date(value).toISOString() : null;
      } else if (field.type === 'number') {
        const n = value !== '' && value !== null ? Number(value) : 0;
        payload[field.name] = isNaN(n) ? 0 : n;
      } else if (field.type === 'checkbox') {
        payload[field.name] = Boolean(value);
      } else {
        payload[field.name] = value !== '' ? value : null;
      }
    });

    const finish = (savedId: string | null) => {
      const ids = this.selectedCategoryIds();
      if (!savedId || ids.length === 0) {
        this.saving = false;
        this.router.navigate(['/my-career', this.entity]);
        return;
      }
      this.categoryService
        .setTags({ sourceType: this.sourceType(), sourceId: savedId, nodeIds: ids })
        .then(() => {
          this.saving = false;
          this.router.navigate(['/my-career', this.entity]);
        })
        .catch(() => {
          this.saving = false;
          this.router.navigate(['/my-career', this.entity]);
        });
    };

    if (this.id) {
      const url = `${environment.apiUrl}/api/user-content/${this.entity}/${this.id}`;
      this.http.put<any>(url, payload, { withCredentials: true }).subscribe({
        next: () => finish(this.id),
        error: err => {
          console.error('Update failed', err);
          this.saveFailed(err);
        },
      });
    } else {
      const url = `${environment.apiUrl}/api/user-content/${this.entity}`;
      this.http.post<any>(url, payload, { withCredentials: true }).subscribe({
        next: resp => {
          const createdId = resp?.data?.id ?? resp?.data?.Id ?? null;
          finish(createdId ? String(createdId) : null);
        },
        error: err => {
          console.error('Create failed', err);
          this.saveFailed(err);
        },
      });
    }
  }

  private saveFailed(err: any): void {
    this.saving = false;
    const errBody = err?.error;
    const msg = errBody?.errors || errBody?.message || errBody || err?.message;
    if (typeof msg === 'string') {
      this.errorMessage = msg;
    } else if (msg && typeof msg === 'object') {
      try {
        const lines = Object.entries(msg)
          .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]))
          .map(x => String(x));
        this.errorMessage = lines.join(' ') || 'Save failed. Please check the form and try again.';
      } catch {
        this.errorMessage = 'Save failed. Please check the form and try again.';
      }
    } else {
      this.errorMessage = 'Save failed. Please check the form and try again.';
    }
    this.cdr.detectChanges();
  }

  cancel() {
    if (this.id) {
      this.router.navigate(['/my-career', this.entity, this.id]);
    } else {
      this.router.navigate(['/my-career', this.entity]);
    }
  }
}
