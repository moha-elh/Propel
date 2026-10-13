import { Component, OnInit, inject, output, signal } from '@angular/core';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { ApplicationService } from '@app/services/application.service';

/** Country picker shared by every applications/stats page. The choice lives in ApplicationService
 *  (and localStorage), so it survives opening an application and coming back. */
@Component({
  selector: 'app-country-filter',
  standalone: true,
  imports: [AppSelectComponent],
  template: `
    <app-select class="country-sel" [value]="appService.country()" (valueChange)="pick($event)" title="Filter by country">
      <option value="">All countries</option>
      @for (c of countries(); track c.country) {
        <option [value]="c.country">{{ c.country }} · {{ c.count }}</option>
      }
    </app-select>
  `,
  styles: [`:host { display: inline-block; } .country-sel { min-width: 170px; }`],
})
export class CountryFilterComponent implements OnInit {
  appService = inject(ApplicationService);
  countries = signal<{ country: string; count: number }[]>([]);
  changed = output<string>();

  async ngOnInit() {
    try {
      const res = await this.appService.getCountries();
      if (res.success && res.data) {
        this.countries.set(res.data);
        // A saved country that no longer has applications would silently empty every page.
        const cur = this.appService.country();
        if (cur && !res.data.some(c => c.country === cur)) this.pick('');
      }
    } catch { /* picker stays with "All countries" */ }
  }

  pick(c: string) {
    if (c === this.appService.country()) return;
    this.appService.setCountry(c);
    this.changed.emit(c);
  }
}
