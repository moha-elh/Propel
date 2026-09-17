import { Injectable, signal } from '@angular/core';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

export interface ConfirmState extends ConfirmOptions {
  kind: 'confirm' | 'alert';
}

/**
 * App-wide replacement for the native `confirm()` / `alert()` dialogs.
 * Mount `<app-confirm-dialog />` in the app root and call:
 *
 *   const ok = await confirmService.confirm({ message: 'Delete this?', variant: 'danger' });
 *   if (!ok) return;
 *
 * `alert()` renders a single OK button and always resolves true.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);
  private resolver: ((value: boolean) => void) | null = null;

  confirm(options: ConfirmOptions): Promise<boolean> {
    return this.open({ ...options, kind: 'confirm' });
  }

  alert(options: ConfirmOptions): Promise<boolean> {
    return this.open({ ...options, kind: 'alert' });
  }

  /** Resolve the open dialog with a result (called by the dialog component). */
  resolve(value: boolean): void {
    const r = this.resolver;
    this.resolver = null;
    this.state.set(null);
    r?.(value);
  }

  private open(state: ConfirmState): Promise<boolean> {
    if (this.resolver) {
      this.resolver(false);
      this.resolver = null;
    }
    this.state.set(state);
    return new Promise<boolean>(resolve => {
      this.resolver = resolve;
    });
  }
}