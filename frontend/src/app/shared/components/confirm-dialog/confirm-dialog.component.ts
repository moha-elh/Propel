import { Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '@app/services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly confirmService = inject(ConfirmService);
  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  constructor() {
    effect(() => {
      if (this.confirmService.state()) {
        setTimeout(() => this.confirmBtn()?.nativeElement.focus());
      }
    });
  }

  accept(): void {
    this.confirmService.resolve(true);
  }

  dismiss(): void {
    this.confirmService.resolve(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss();
    }
  }
}