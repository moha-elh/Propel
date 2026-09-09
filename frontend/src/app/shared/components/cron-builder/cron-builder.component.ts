import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';

type CronUnit = 'minute' | 'hour' | 'day' | 'week' | 'month';

@Component({
  selector: 'app-cron-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './cron-builder.component.html',
  styleUrl: './cron-builder.component.scss',
})
export class CronBuilderComponent implements OnInit {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  unit = signal<CronUnit>('week');
  interval = signal(1);
  minuteOfHour = signal(0);
  time = signal('09:00');
  weekdays = signal<number[]>([2]);
  monthDay = signal(1);
  raw = signal('');
  rawMode = signal(false);

  readonly weekdayOptions = [
    { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  ];
  readonly unitOptions: { value: CronUnit; label: string }[] = [
    { value: 'minute', label: 'Minutes' },
    { value: 'hour', label: 'Hours' },
    { value: 'day', label: 'Days' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];

  ngOnInit() {
    this.parse(this.value);
    this.emit();
  }

  private pad(n: number) { return n.toString().padStart(2, '0'); }
  private clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n || min)); }

  /** Best-effort reverse-parse of a 5-field cron into the builder controls. */
  private parse(cron: string) {
    const c = (cron || '').trim();
    if (!c) return;
    let m: RegExpExecArray | null;
    if ((m = /^(\d+)\s+\*\/(\d+)\s+\*\s+\*\s+\*$/.exec(c))) {
      this.unit.set('hour'); this.minuteOfHour.set(+m[1]); this.interval.set(+m[2]); return;
    }
    if ((m = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(c))) {
      this.unit.set('minute'); this.interval.set(+m[1]); return;
    }
    if ((m = /^(\d+)\s+(\d+)\s+\*\/(\d+)\s+\*\s+\*$/.exec(c))) {
      this.unit.set('day'); this.interval.set(+m[3]); this.time.set(`${this.pad(+m[2])}:${this.pad(+m[1])}`); return;
    }
    if ((m = /^(\d+)\s+(\d+)\s+\*\s+\*\s+([\d,]+)$/.exec(c))) {
      this.unit.set('week'); this.time.set(`${this.pad(+m[2])}:${this.pad(+m[1])}`);
      this.weekdays.set(m[3].split(',').map(Number).map(d => (d === 7 ? 0 : d))); return;
    }
    if ((m = /^(\d+)\s+(\d+)\s+(\d+)\s+\*\s+\*$/.exec(c))) {
      this.unit.set('month'); this.monthDay.set(+m[3]); this.time.set(`${this.pad(+m[2])}:${this.pad(+m[1])}`); return;
    }
    this.rawMode.set(true); this.raw.set(c);
  }

  buildCron(): string {
    switch (this.unit()) {
      case 'minute': return `*/${this.clamp(this.interval(), 1, 59)} * * * *`;
      case 'hour': return `${this.clamp(this.minuteOfHour(), 0, 59)} */${this.clamp(this.interval(), 1, 23)} * * *`;
      case 'day': { const [hh, mm] = this.time().split(':').map(Number); return `${mm} ${hh} */${this.clamp(this.interval(), 1, 365)} * *`; }
      case 'week': {
        const days = this.weekdays().slice().sort((a, b) => a - b);
        if (!days.length) return '';
        const [hh, mm] = this.time().split(':').map(Number);
        return `${mm} ${hh} * * ${days.join(',')}`;
      }
      case 'month': { const [hh, mm] = this.time().split(':').map(Number); return `${mm} ${hh} ${this.clamp(this.monthDay(), 1, 31)} * *`; }
      default: return this.raw();
    }
  }

  emit() { this.valueChange.emit(this.buildCron()); }

  onUnitChange(u: CronUnit) { this.unit.set(u); this.emit(); }
  onIntervalChange(n: number) { this.interval.set(n); this.emit(); }
  onMinuteChange(n: number) { this.minuteOfHour.set(n); this.emit(); }
  onTimeChange(t: string) { this.time.set(t); this.emit(); }
  onMonthDayChange(n: number) { this.monthDay.set(n); this.emit(); }
  onRawChange(r: string) { this.raw.set(r); this.emit(); }
  toggleWeekday(d: number) {
    const cur = this.weekdays();
    this.weekdays.set(cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort((a, b) => a - b));
    this.emit();
  }
}
