import { Component, Injectable, Input, computed, inject, signal } from '@angular/core';
import { HttpService } from '@app/services/http.service';
import { ApiResponse } from '@app/models/application.model';

const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Name → saved logo/website for the user's companies, so every <app-company-logo> that only
 * knows a company name (applications, kanban, calendar…) shows the logo stored on the company
 * instead of a guessed one. One request, cached; CompanyService invalidates it on create/update.
 */
@Injectable({ providedIn: 'root' })
export class CompanyLogoDirectory {
  private http = inject(HttpService);
  private byName = signal(new Map<string, { logoUrl: string | null; website: string | null }>());
  private loading: Promise<void> | null = null;

  lookup(name: string) {
    this.ensureLoaded();
    const key = normName(name);
    const map = this.byName();
    const exact = map.get(key);
    if (exact) return exact;
    // "Capgemini Engineering" → the "Capgemini" company: longest saved name that starts this one at a word boundary.
    let best: string | undefined;
    for (const k of map.keys()) {
      if (key.startsWith(k + ' ') && map.get(k)!.logoUrl && (!best || k.length > best.length)) best = k;
    }
    return best ? map.get(best) : undefined;
  }

  invalidate() { this.loading = null; this.ensureLoaded(); }

  private ensureLoaded() {
    // ponytail: loads up to 2000 companies in one call; page it if a user ever has more.
    this.loading ??= this.http
      .get<ApiResponse<{ items: { name: string; logoUrl?: string | null; websiteUrl?: string | null }[] }>>('/api/companies?pageSize=2000')
      .then(res => this.byName.set(new Map((res.data?.items ?? []).map(c =>
        [normName(c.name), { logoUrl: c.logoUrl || null, website: c.websiteUrl || null }]))))
      .catch(() => { this.loading = null; });
  }
}

const LEGAL_SUFFIXES = new Set([
  'inc', 'incorp', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'llc', 'sarl', 'gmbh', 'ag', 'sa', 'sas', 'plc', 'group',
  'holdings', 'holdingsinc', 'technologies', 'technology', 'tech', 'solutions',
  'solution', 'inds', 'industries', 'intl', 'international', 'pvt', 'srl',
  'bv', 'nv', 'as', 'pty', 'sc', 'spa', 'sl', 'ab', 'oy', 'pte',
]);

function identityTokens(name: string): string[] {
  const clean = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[®©™]/g, '')
    .replace(/[^a-z0-9&\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const raw = clean.split(/[\s.&]+/).filter(Boolean);
  while (raw.length && ['the', 'a', 'an'].includes(raw[raw.length - 1])) raw.pop();
  while (raw.length && LEGAL_SUFFIXES.has(raw[raw.length - 1])) raw.pop();
  return raw.slice(0, 3);
}

function domainFromName(name: string): string | null {
  const tokens = identityTokens(name);
  if (!tokens.length) return null;
  return `${tokens.join('')}.com`;
}

/** Pull a bare host (no protocol, no www, no path) from a stored website URL. */
export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/** Best-effort logo domain: a real website if we have one, else guessed from the name. */
export function logoDomain(website: string | null | undefined, name: string): string | null {
  return hostFromUrl(website) ?? (name ? domainFromName(name) : null);
}

@Component({
  selector: 'app-company-logo',
  standalone: true,
  imports: [],
  template: `
    @if (imgSrc() && !allFailed()) {
      <img
        class="cl-img"
        [src]="imgSrc()"
        [alt]="companyName"
        [title]="companyName"
        referrerpolicy="no-referrer"
        loading="lazy"
        (error)="onImgError()"
      />
    } @else {
      <div class="cl-fallback"
        [style.background]="'oklch(0.95 0.03 ' + hue() + ')'"
        [style.color]="'oklch(0.45 0.13 ' + hue() + ')'"
        [title]="companyName">{{ initials() }}</div>
    }
  `,
  styles: [
    `
      :host { display: flex; flex-shrink: 0; --cl-w: 28px; --cl-h: 28px; --cl-r: 7px; --cl-fs: 11px; }
      :host([size="sm"]) { --cl-w: 22px; --cl-h: 22px; --cl-r: 6px; --cl-fs: 9px; }
      :host([size="lg"]) { --cl-w: 52px; --cl-h: 52px; --cl-r: 14px; --cl-fs: 18px; }
      .cl-img {
        width: var(--cl-w);
        height: var(--cl-h);
        border-radius: var(--cl-r);
        border: 1px solid oklch(0 0 0 / 0.08);
        background: var(--surface, #fff);
        object-fit: cover;
        padding: 0;
      }
      .cl-fallback {
        width: var(--cl-w);
        height: var(--cl-h);
        border-radius: var(--cl-r);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--cl-fs);
        font-weight: 700;
        font-family: var(--font-display);
        flex-shrink: 0;
        box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.04);
      }
    `,
  ],
})
export class CompanyLogoComponent {
  private logoFailed = signal(false);
  private favFailed = signal(false);
  allFailed = signal(false);

  // Signal-backed so the computeds below follow input changes (e.g. live previews).
  private _name = signal('');
  private _logo = signal<string | null>(null);
  private _website = signal<string | null>(null);
  @Input() set companyName(v: string | null | undefined) { this._name.set(v ?? ''); this.logoFailed.set(false); this.favFailed.set(false); this.allFailed.set(false); }
  get companyName(): string { return this._name(); }
  @Input() set logoUrl(v: string | null | undefined) { this._logo.set(v || null); this.logoFailed.set(false); }
  get logoUrl(): string | null { return this._logo(); }
  /** The company's real website, when known — gives an accurate logo domain. */
  @Input() set website(v: string | null | undefined) { this._website.set(v || null); }
  get website(): string | null { return this._website(); }
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  private directory = inject(CompanyLogoDirectory);
  /** Explicit inputs win; otherwise use what's saved on the company with this name. */
  private saved = computed(() => this.companyName ? this.directory.lookup(this.companyName) : undefined);


  imgSrc = computed<string | null>(() => {
    const logo = this.logoUrl ?? this.saved()?.logoUrl;
    if (logo && !this.logoFailed()) return logo;
    const d = logoDomain(this.website ?? this.saved()?.website, this.companyName);
    if (d && !this.favFailed()) {
      // unavatar aggregates real brand logos; fallback=false returns 404 on a
      // miss so our initials chip shows instead of a generic placeholder image.
      return `https://unavatar.io/${encodeURIComponent(d)}?fallback=false`;
    }
    return null;
  });

  onImgError() {
    if ((this.logoUrl ?? this.saved()?.logoUrl) && !this.logoFailed()) {
      this.logoFailed.set(true);
    } else {
      this.favFailed.set(true);
      this.allFailed.set(true);
    }
  }

  initials = computed(() => {
    const n = this.companyName.trim();
    if (!n) return '?';
    const words = n.split(/[\s-]+/).filter(Boolean);
    const first = (w: string) => [...w][0] ?? '';
    if (words.length === 1) return n.slice(0, 2).toUpperCase();
    return (first(words[0]) + first(words[1])).toUpperCase();
  });

  hue = computed(() => {
    let h = 0;
    const n = this.companyName;
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return h % 360;
  });
}