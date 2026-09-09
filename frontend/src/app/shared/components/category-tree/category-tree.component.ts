import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { CategoryService } from '@app/services/category.service';
import { TaxonomyNode } from '@app/models/category.model';
import { CategoryTreeNodeComponent } from '../category-tree-node/category-tree-node.component';

@Component({
  selector: 'app-category-tree',
  standalone: true,
  imports: [CommonModule, CategoryTreeNodeComponent],
  templateUrl: './category-tree.component.html',
  styleUrl: './category-tree.component.scss',
})
export class CategoryTreeComponent implements OnChanges, OnDestroy {
  @Input() scope = '';
  @Input() mode: 'filter' | 'edit' = 'filter';
  @Input() multiple = true;
  @Input() selectedIds: string[] = [];
  @Input() showCounts = true;

  @Output() selectedIdsChange = new EventEmitter<string[]>();

  tree: TaxonomyNode[] = [];
  /** Actual selection: always leaf node ids (so later-added leaves under a picked parent are NOT included). */
  selected = new Set<string>();
  /** Display selection: leaf ids plus any ancestor whose leaves are all selected (so parents show checked). */
  displaySelected = new Set<string>();
  expanded = new Set<string>();
  searchText = '';
  loading = false;
  empty = false;

  private nodeById = new Map<string, TaxonomyNode>();
  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(private categoryService: CategoryService, private cdr: ChangeDetectorRef) {
    this.search$.pipe(debounceTime(180), takeUntil(this.destroy$)).subscribe((q) => {
      this.searchText = q;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scope'] && this.scope) {
      this.load();
    }
    if (changes['selectedIds']) {
      this.selected = new Set(this.selectedIds || []);
      this.recomputeDisplay();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.loading = true;
    this.empty = false;
    const timeout = new Promise<TaxonomyNode[]>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 15000),
    );
    Promise.race([this.categoryService.getTree(this.scope), timeout])
      .then((nodes) => {
        this.tree = nodes || [];
        this.empty = this.tree.length === 0;
        this.nodeById = new Map<string, TaxonomyNode>();
        const index = (list: TaxonomyNode[]) => {
          for (const n of list) {
            this.nodeById.set(n.id, n);
            if (n.children && n.children.length) index(n.children);
          }
        };
        index(this.tree);
        // Start collapsed; user expands branches (or a search reveals matches).
        this.expanded = new Set<string>();
        this.recomputeDisplay();
        this.loading = false;
        this.cdr.detectChanges();
      })
      .catch(() => {
        this.tree = [];
        this.empty = true;
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  /** All leaf descendants of a node (a leaf returns itself). */
  private getLeafIds(id: string): string[] {
    const node = this.nodeById.get(id);
    if (!node) return [];
    if (!node.children || node.children.length === 0) return [id];
    const leaves: string[] = [];
    const walk = (n: TaxonomyNode) => {
      if (!n.children || n.children.length === 0) leaves.push(n.id);
      else n.children.forEach(walk);
    };
    walk(node);
    return leaves;
  }

  /** Recompute the display set: add an ancestor when all of its leaves are selected. */
  private recomputeDisplay(): void {
    const disp = new Set(this.selected);
    const addIfComplete = (node: TaxonomyNode) => {
      const leaves = this.getLeafIds(node.id);
      if (leaves.length > 0 && leaves.every((l) => this.selected.has(l))) {
        disp.add(node.id);
        if (node.parentId != null) {
          const parent = this.nodeById.get(node.parentId);
          if (parent) addIfComplete(parent);
        }
      }
    };
    this.tree.forEach(addIfComplete);
    this.displaySelected = disp;
  }

  onSearch(value: string): void {
    this.search$.next(value);
  }

  clearSearch(): void {
    this.searchText = '';
    this.search$.next('');
  }

  isMatch(node: TaxonomyNode): boolean {
    const q = this.searchText.trim().toLowerCase();
    if (!q) return false;
    if (node.name.toLowerCase().includes(q)) return true;
    return (node.keywords || []).some((k) => k.toLowerCase().includes(q));
  }

  visibleTree(): TaxonomyNode[] {
    const q = this.searchText.trim();
    if (!q) return this.tree;
    const match = new Set<string>();
    const walk = (n: TaxonomyNode): boolean => {
      const hit = this.isMatch(n);
      let childHit = false;
      for (const c of n.children || []) {
        if (walk(c)) childHit = true;
      }
      if (hit || childHit) {
        match.add(n.id);
        return true;
      }
      return false;
    };
    this.tree.forEach(walk);
    const project = (list: TaxonomyNode[]): TaxonomyNode[] =>
      list
        .filter((n) => match.has(n.id))
        .map((n) => ({
          ...n,
          children: n.children ? (this.isMatch(n) ? n.children : project(n.children)) : [],
        }));
    return project(this.tree);
  }

  onSelectionChange(id: string): void {
    const leaves = this.getLeafIds(id);
    if (leaves.length === 0) return;
    const fully = leaves.every((l) => this.selected.has(l));
    const next = new Set(this.selected);
    if (fully) leaves.forEach((l) => next.delete(l));
    else leaves.forEach((l) => next.add(l));
    this.selected = next;
    this.recomputeDisplay();
    this.selectedIdsChange.emit([...next]);
  }

  /** While filtering, force every branch open so matched descendants are visible. */
  displayExpanded(): Set<string> {
    return this.searchText.trim() ? new Set(this.allBranchIds()) : this.expanded;
  }

  onExpandChange(id: string): void {
    const next = new Set(this.expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded = next;
  }

  clearSelection(): void {
    this.selected = new Set<string>();
    this.recomputeDisplay();
    this.selectedIdsChange.emit([]);
  }

  private allBranchIds(): string[] {
    const ids: string[] = [];
    this.nodeById.forEach((n) => {
      if (n.children && n.children.length) ids.push(n.id);
    });
    return ids;
  }

  get allExpanded(): boolean {
    const branches = this.allBranchIds();
    return branches.length > 0 && branches.every((id) => this.expanded.has(id));
  }

  toggleExpandAll(): void {
    this.expanded = this.allExpanded ? new Set<string>() : new Set(this.allBranchIds());
  }

  get selectedCount(): number {
    return this.selected.size;
  }
}
