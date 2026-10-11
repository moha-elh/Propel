import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { APP_NAME } from '@app/app-name';

@Component({
  selector: 'app-reveal-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reveal-overlay.component.html',
  styleUrl: './reveal-overlay.component.scss',
})
export class RevealOverlayComponent implements OnInit, AfterViewInit {
  appName = APP_NAME;
  @ViewChild('curtainLeft') curtainLeft!: ElementRef<HTMLElement>;
  @ViewChild('curtainRight') curtainRight!: ElementRef<HTMLElement>;

  splitting = false;
  fading = false;
  visible = true;
  tagline = '';

  private readonly taglines = [
    'AI-Powered CVs.',
    'Land interviews faster.',
    'Your dream job awaits.',
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Play once per browser session; refreshes and deep links show the app immediately.
    let seen = false;
    try { seen = sessionStorage.getItem('reveal-seen') === '1'; sessionStorage.setItem('reveal-seen', '1'); } catch { /* storage blocked */ }
    if (seen) {
      this.visible = false;
      document.body.classList.add('page-revealed', 'reveal-skip');
      return;
    }

    document.body.classList.add('is-revealing');

    // Start typing the tagline after a short delay
    setTimeout(() => this.typeTagline(this.taglines[0], 0), 400);

    // Start the split sequence after 2.6s
    setTimeout(() => this.startSplit(), 2600);
  }

  ngAfterViewInit(): void {
    if (!this.visible) return;
    this.addParticles(this.curtainLeft.nativeElement, 18);
    this.addParticles(this.curtainRight.nativeElement, 18);
    this.cdr.detectChanges();
  }

  private typeTagline(text: string, charIndex: number): void {
    if (charIndex <= text.length) {
      this.tagline = text.slice(0, charIndex);
      this.cdr.detectChanges(); // Force update for typing
      setTimeout(() => this.typeTagline(text, charIndex + 1), 60);
    }
  }

  private startSplit(): void {
    // 1. Fade out the center logo
    this.fading = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      // 2. Split the curtains apart
      this.splitting = true;
      this.cdr.detectChanges();

      setTimeout(() => {
        // 3. Reveal the page content
        document.body.classList.remove('is-revealing');
        document.body.classList.add('page-revealed');
        this.cdr.detectChanges();

        // 4. Remove the overlay from the DOM
        setTimeout(() => {
          this.visible = false;
          this.cdr.detectChanges();
        }, 400);
      }, 700);
    }, 300);
  }

  private addParticles(parent: HTMLElement, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'curtain-particle';
      const size = Math.random() * 6 + 3;
      p.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        animation-duration: ${3 + Math.random() * 4}s;
        animation-delay: ${Math.random() * 2}s;
      `;
      parent.appendChild(p);
    }
  }
}