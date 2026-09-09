import { Component, inject, signal, computed, ElementRef, ViewChild, AfterViewChecked, SecurityContext } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { BimeService } from '../../../services/bime.service';
import { LlmSettingsService } from '../../../services/llm-settings.service';
import type { BimeChatMessage, BimeConversationSummary } from '../../../models/bime.model';
import type { LlmProviderInfo } from '../../../models/llm-settings.model';

@Component({
  selector: 'app-bime-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './bime-chat.html',
  styleUrl: './bime-chat.scss',
})
export class BimeChatComponent implements AfterViewChecked {
  private readonly bime = inject(BimeService);
  private readonly llmSvc = inject(LlmSettingsService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;

  open = signal(false);
  loading = signal(false);
  sending = signal(false);
  view = signal<'chat' | 'history'>('chat');

  messages = signal<BimeChatMessage[]>([]);
  conversations = signal<BimeConversationSummary[]>([]);
  currentConversationId = signal<string | null>(null);

  providers = signal<LlmProviderInfo[]>([]);
  models = signal<string[]>([]);
  selectedProvider = signal('');
  selectedModel = signal('');
  modelPickerOpen = signal(false);
  modelsLoading = signal(false);

  inputText = signal('');
  private shouldScroll = false;

  greeting: BimeChatMessage = {
    role: 'assistant',
    content: "Hello! I'm BIME, your Propel assistant. Ask me about your applications, companies, or anything else.",
  };

  displayMessages = computed(() => {
    const msgs = this.messages();
    return msgs.length > 0 ? msgs : [this.greeting];
  });

  toggle() {
    this.open.update(v => !v);
    if (this.open() && this.messages().length === 0) {
      this.messages.set([this.greeting]);
      this.loadCatalog();
    }
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

  private async loadCatalog() {
    try {
      const [providers, settings] = await Promise.all([
        this.withTimeout(this.llmSvc.getProviders(), []),
        this.withTimeout(this.llmSvc.getSettings(), null),
      ]);
      this.providers.set(providers.filter(p => p.available));
      const initial = settings && settings.provider ? settings : null;
      if (initial && this.providers().some(p => p.name === initial.provider)) {
        this.selectedProvider.set(initial.provider);
        await this.loadModels(initial.provider, false);
        if (initial.model) this.selectedModel.set(initial.model);
      } else if (this.providers().length > 0) {
        this.selectedProvider.set(this.providers()[0].name);
        await this.loadModels(this.selectedProvider(), false);
      }
    } catch { /* ignore catalog load errors */ }
  }

  private async loadModels(provider: string, preserveModel: boolean) {
    const prev = this.selectedModel();
    this.modelsLoading.set(true);
    this.models.set([]);
    if (!preserveModel) this.selectedModel.set('');
    try {
      const models = await this.withTimeout(this.llmSvc.getModels(provider), []);
      this.models.set(models);
      if (!this.selectedModel() && models.length > 0) this.selectedModel.set(models[0]);
      else if (preserveModel && prev && models.includes(prev)) this.selectedModel.set(prev);
    } catch { /* ignore */ }
    finally { this.modelsLoading.set(false); }
  }

  onProviderChange(provider: string) {
    this.selectedProvider.set(provider);
    this.loadModels(provider, false);
  }

  activeModelLabel(): string {
    const p = this.providers().find(x => x.name === this.selectedProvider());
    const pLabel = p?.label ?? this.selectedProvider();
    return this.selectedModel() ? `${pLabel} · ${this.selectedModel()}` : `${pLabel}`;
  }

  async send() {
    const text = this.inputText().trim();
    if (!text || this.sending()) return;

    this.inputText.set('');
    this.messages.update(msgs => [...msgs, { role: 'user', content: text }]);
    this.sending.set(true);
    this.shouldScroll = true;

    try {
      const res = await this.bime.chat(
        text,
        this.currentConversationId() ?? undefined,
        this.selectedProvider() || undefined,
        this.selectedModel() || undefined,
      );
      this.currentConversationId.set(res.conversation_id);
      this.messages.update(msgs => [...msgs, { role: 'assistant', content: res.reply }]);
      this.shouldScroll = true;
    } catch {
      this.messages.update(msgs => [...msgs, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      this.sending.set(false);
    }
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  async openHistory() {
    this.view.set('history');
    this.loading.set(true);
    try {
      this.conversations.set(await this.bime.listConversations());
    } finally {
      this.loading.set(false);
    }
  }

  async loadConversation(id: string) {
    this.loading.set(true);
    this.view.set('chat');
    try {
      const detail = await this.bime.getConversation(id);
      this.currentConversationId.set(detail.id);
      this.messages.set(detail.messages);
      this.shouldScroll = true;
    } finally {
      this.loading.set(false);
    }
  }

  async newConversation() {
    this.currentConversationId.set(null);
    this.messages.set([this.greeting]);
    this.view.set('chat');
  }

  async refresh() {
    if (this.loading()) return;
    this.loading.set(true);
    const prevProvider = this.selectedProvider();
    const prevModel = this.selectedModel();
    try {
      const [providers, settings] = await Promise.all([
        this.withTimeout(this.llmSvc.getProviders(), []),
        this.withTimeout(this.llmSvc.getSettings(), null),
      ]);
      this.providers.set(providers.filter(p => p.available));

      const provider = prevProvider && this.providers().some(p => p.name === prevProvider)
        ? prevProvider
        : (settings?.provider && this.providers().some(p => p.name === settings.provider)
            ? settings.provider
            : (this.providers()[0]?.name ?? ''));
      if (!provider) return;

      this.selectedProvider.set(provider);
      await this.loadModels(provider, prevProvider === provider);
      if (prevProvider !== provider && settings?.model) this.selectedModel.set(settings.model);

      if (this.view() === 'history') {
        this.conversations.set(await this.bime.listConversations());
      } else {
        const convId = this.currentConversationId();
        if (convId) {
          const detail = await this.bime.getConversation(convId);
          this.messages.set(detail.messages);
          this.shouldScroll = true;
        }
      }
    } catch { /* ignore */ }
    finally { this.loading.set(false); }
  }

  async deleteConversation(id: string, e: Event) {
    e.stopPropagation();
    await this.bime.deleteConversation(id);
    this.conversations.update(cs => cs.filter(c => c.id !== id));
    if (this.currentConversationId() === id) this.newConversation();
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  renderMarkdown(text: string): SafeHtml {
    const html = marked.parse(text, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.shouldScroll = false;
      requestAnimationFrame(() => {
        const el = this.scrollContainer?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }
}
