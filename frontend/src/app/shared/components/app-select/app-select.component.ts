import {
  Component, ElementRef, EventEmitter, Input, Output, ViewChild,
  AfterContentInit, OnDestroy, forwardRef, signal, HostListener, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

interface Opt { value: string; label: string; disabled: boolean; }

/**
 * Drop-in replacement for a native <select>. Keep the existing <option> markup
 * as projected content — this reads it (and re-reads on *ngFor changes), so a
 * swap is usually just renaming the tag. Supports [(ngModel)] and [value]/(valueChange).
 */
@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-select.component.html',
  styleUrl: './app-select.component.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AppSelectComponent), multi: true },
  ],
})
export class AppSelectComponent implements AfterContentInit, OnDestroy, ControlValueAccessor {
  @Input() placeholder = 'Select…';
  @Input() disabled = false;
  @Input()
  set value(v: string | null | undefined) { this._value = v == null ? '' : String(v); }
  get value(): string { return this._value; }
  private _value = '';

  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('optHost', { static: true }) optHost!: ElementRef<HTMLElement>;

  open = signal(false);
  options = signal<Opt[]>([]);
  panelStyle = signal<Record<string, string>>({});

  private observer?: MutationObserver;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {}

  ngAfterContentInit(): void {
    this.readOptions();
    this.observer = new MutationObserver(() => this.readOptions());
    this.observer.observe(this.optHost.nativeElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private readOptions(): void {
    const els = Array.from(this.optHost.nativeElement.querySelectorAll('option'));
    this.options.set(els.map((o) => ({
      value: o.value,
      label: (o.textContent || '').trim(),
      disabled: o.disabled,
    })));
    this.cdr.markForCheck();
  }

  selectedLabel(): string {
    const hit = this.options().find((o) => o.value === this._value);
    return hit ? hit.label : '';
  }

  toggle(): void {
    if (this.disabled) return;
    this.open() ? this.close() : this.openPanel();
  }

  openPanel(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.panelStyle.set({
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      'z-index': '5000',
    });
    this.open.set(true);
    this.onTouched();
  }

  close(): void {
    this.open.set(false);
  }

  pick(o: Opt): void {
    if (o.disabled) return;
    this._value = o.value;
    this.onChange(o.value);
    this.valueChange.emit(o.value);
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.open()) this.close(); }

  @HostListener('window:scroll', ['$event'])
  @HostListener('window:resize', ['$event'])
  onViewportChange(_e?: Event): void { if (this.open()) this.close(); }

  // ── ControlValueAccessor ──
  writeValue(v: string | null): void { this._value = v == null ? '' : String(v); this.cdr.markForCheck(); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled = isDisabled; }
}
