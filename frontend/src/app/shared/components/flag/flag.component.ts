import { Component, computed, input } from '@angular/core';
import { flagUrl } from '@app/shared/data/flags';

/** Small flag image for a country name; renders nothing when the country is unknown. */
@Component({
  selector: 'app-flag',
  standalone: true,
  template: `@if (src()) { <img [src]="src()" [alt]="country() + ' flag'" [title]="country()" loading="lazy"> }`,
  styles: [`:host { display: inline-flex; vertical-align: -1px; }
    img { width: 18px; height: 13px; object-fit: cover; border-radius: 2px; box-shadow: 0 0 0 1px oklch(0 0 0 / 0.08); }`],
})
export class FlagComponent {
  country = input<string | null | undefined>('');
  src = computed(() => flagUrl(this.country()));
}
