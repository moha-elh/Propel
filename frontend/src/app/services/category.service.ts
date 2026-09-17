import { Injectable, inject } from '@angular/core';
import { HttpService } from './http.service';
import { CategorySearchRequest, CategorySearchResult, CategoryTagRequest, TaxonomyNode } from '@app/models/category.model';
import { ApiResponse } from '@app/models/application.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpService);

  async getTree(scope: string): Promise<TaxonomyNode[]> {
    const res = await this.http.get<ApiResponse<TaxonomyNode[]>>(`/api/categories/tree?scope=${encodeURIComponent(scope)}`);
    return res.data ?? [];
  }

  async search(req: CategorySearchRequest): Promise<CategorySearchResult[]> {
    const res = await this.http.post<ApiResponse<CategorySearchResult[]>>('/api/categories/search', req);
    return res.data ?? [];
  }

  async getTags(sourceType: string, sourceId: string): Promise<string[]> {
    const res = await this.http.get<ApiResponse<string[]>>(
      `/api/categories/tags?sourceType=${encodeURIComponent(sourceType)}&sourceId=${encodeURIComponent(sourceId)}`,
    );
    return (res.data ?? []).map(String);
  }

  async setTags(req: CategoryTagRequest): Promise<unknown> {
    return this.http.put<unknown>('/api/categories/tags', req);
  }

  /** All tag groupings for a whole scope: [{ sourceId, nodeIds }]. */
  async getTagsForScope(sourceType: string): Promise<{ sourceId: string; nodeIds: string[] }[]> {
    const res = await this.http.get<ApiResponse<{ sourceId: string; nodeIds: string[] }[]>>(
      `/api/categories/tags/all?sourceType=${encodeURIComponent(sourceType)}`,
    );
    return res.data ?? [];
  }

  /** Build a nodeId -> name map for a scope (used to render category chips). */
  async getNodeNameMap(scope: string): Promise<Map<string, string>> {
    const nodes = await this.getTree(scope);
    const map = new Map<string, string>();
    const walk = (list: TaxonomyNode[]) => {
      for (const n of list) {
        map.set(n.id, n.name);
        if (n.children && n.children.length) walk(n.children);
      }
    };
    walk(nodes);
    return map;
  }

  /** Ask the backend to suggest categories for one entity (LLM + keyword), without saving. */
  async suggestTags(sourceType: string, sourceId: string): Promise<string[]> {
    const res = await this.http.post<ApiResponse<string[]>>('/api/categories/categorize/suggest', {
      sourceType,
      sourceId,
    });
    return res.data ?? [];
  }

  /** Create a root category node (container) for a scope. */
  async createNode(scope: string, name: string): Promise<ApiResponse<TaxonomyNode>> {
    return this.http.post<ApiResponse<TaxonomyNode>>('/api/categories', { scope, name });
  }

  /** Delete a category node and its tags. */
  async deleteNode(id: string): Promise<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`/api/categories/${id}`);
  }
}
