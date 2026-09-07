import { Component, inject, input } from '@angular/core';
import { ToastService } from '@app/services/toast.service';

/**
 * Three quick-action icon buttons for a person record:
 *  - LinkedIn → opens the profile in a new tab
 *  - Gmail   → copies the email address
 *  - Phone   → copies the phone number
 * Missing values hide the corresponding button.
 */
@Component({
  selector: 'app-contact-quick-actions',
  standalone: true,
  templateUrl: './contact-quick-actions.component.html',
  styleUrl: './contact-quick-actions.component.scss',
})
export class ContactQuickActionsComponent {
  private readonly toast = inject(ToastService);

  linkedinUrl = input<string | null | undefined>();
  email = input<string | null | undefined>();
  phone = input<string | null | undefined>();
  dense = input(false);

  openLinkedIn(): void {
    const url = this.linkedinUrl();
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  async copyEmail(): Promise<void> {
    const email = this.email();
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      this.toast.success(`Email copied: ${email}`);
    } catch {
      this.toast.error('Could not copy the email address');
    }
  }

  async copyPhone(): Promise<void> {
    const phone = this.phone();
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      this.toast.success(`Phone copied: ${phone}`);
    } catch {
      this.toast.error('Could not copy the phone number');
    }
  }
}