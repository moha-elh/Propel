import { Component, Input, computed, signal } from '@angular/core';

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

function domainFor(name: string): string | null {
  const tokens = identityTokens(name);
  if (!tokens.length) return null;
  return `${tokens.join('')}.com`;
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
        object-fit: contain;
        padding: 3px;
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
  @Input() companyName = '';
  @Input() logoUrl: string | null = null;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  private logoFailed = signal(false);
  private favFailed = signal(false);
  allFailed = signal(false);

  imgSrc = computed<string | null>(() => {
    if (this.logoUrl && !this.logoFailed()) return this.logoUrl;
    const d = this.companyName ? domainFor(this.companyName) : null;
    if (d && !this.favFailed()) {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`;
    }
    return null;
  });

  onImgError() {
    if (this.logoUrl && !this.logoFailed()) {
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