import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { LlmSettingsService } from '@app/services/llm-settings.service';
import type { LlmProviderInfo } from '@app/models/llm-settings.model';

@Component({
  selector: 'app-llm-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './llm-settings.component.html',
  styleUrl: './llm-settings.component.scss',
})
export class LlmSettingsComponent implements OnInit {
  private readonly llmSvc = inject(LlmSettingsService);

  providers = signal<LlmProviderInfo[]>([]);
  models = signal<string[]>([]);
  selectedProvider = signal('');
  selectedModel = signal('');
  loading = signal(true);
  modelsLoading = signal(false);
  saving = signal(false);
  error = signal('');
  showSuccess = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const [providers, settings] = await Promise.all([
        this.withTimeout(this.llmSvc.getProviders(), []),
        this.withTimeout(this.llmSvc.getSettings(), null),
      ]);
      const available = providers.filter(p => p.available);
      this.providers.set(providers);

      let initial = settings && settings.provider ? settings : null;
      if (!initial && available.length > 0) initial = { provider: available[0].name, model: '', updated_at: '' };

      if (initial) {
        this.selectedProvider.set(initial.provider);
        await this.loadModelsFor(initial.provider);
        if (settings?.model) this.selectedModel.set(settings.model);
      }
    } catch {
      this.error.set('Failed to load LLM configuration.');
    } finally {
      this.loading.set(false);
    }
  }

  async onProviderChange(provider: string): Promise<void> {
    this.selectedProvider.set(provider);
    this.selectedModel.set('');
    await this.loadModelsFor(provider);
  }

  private withTimeout<T>(promise: Promise<T>, fallback: T, ms = 15000): Promise<T> {
    return new Promise<T>(resolve => {
      const timer = setTimeout(() => resolve(fallback), ms);
      promise.then(
        v => { clearTimeout(timer); resolve(v); },
        () => { clearTimeout(timer); resolve(fallback); },
      );
    });
  }

  private async loadModelsFor(provider: string): Promise<void> {
    if (!provider) return;
    this.modelsLoading.set(true);
    this.models.set([]);
    try {
      const models = await this.withTimeout(this.llmSvc.getModels(provider), []);
      this.models.set(models);
      if (models.length === 0) {
        this.error.set(`No models returned for ${provider}.`);
      } else if (!this.selectedModel()) {
        this.selectedModel.set(models[0]);
      }
    } catch {
      this.error.set(`Failed to load models for ${provider}.`);
    } finally {
      this.modelsLoading.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.selectedProvider() || !this.selectedModel()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.llmSvc.setSettings(this.selectedProvider(), this.selectedModel());
      this.showSuccess.set(true);
      setTimeout(() => this.showSuccess.set(false), 2400);
    } catch {
      this.error.set('Failed to save LLM settings.');
    } finally {
      this.saving.set(false);
    }
  }
}
