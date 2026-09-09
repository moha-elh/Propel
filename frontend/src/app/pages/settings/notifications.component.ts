import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { NotificationService } from '@app/services/notification.service';
import {
  NotificationPreference,
  UpdateNotificationPreferenceDto,
} from '@app/models/notification-preference.model';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private notifSvc = inject(NotificationService);

  preferences = signal<NotificationPreference | null>(null);
  loading = signal(true);
  saving = signal(false);
  showSuccess = signal(false);

  reminderOptions = [1, 2, 3, 5, 7];

  private backup: NotificationPreference | null = null;

  ngOnInit(): void {
    this.loadPreferences();
  }

  private async loadPreferences() {
    try {
      const res = await this.notifSvc.getPreferences();
      if (res.success && res.data) this.preferences.set(res.data);
    } catch {
      /* will show empty state */
    } finally {
      this.loading.set(false);
    }
  }

  toggleField(key: keyof NotificationPreference) {
    const prefs = this.preferences();
    if (!prefs) return;
    this.backup = { ...prefs };
    const updated = {
      ...prefs,
      [key]: !prefs[key] as boolean,
    };
    this.preferences.set(updated);
    this.savePreferences();
  }

  async savePreferences() {
    const prefs = this.preferences();
    if (!prefs) return;

    this.saving.set(true);
    try {
      const dto: UpdateNotificationPreferenceDto = {
        enableEmail: prefs.enableEmail,
        enableInApp: prefs.enableInApp,
        reminders: prefs.reminders,
        applicationUpdates: prefs.applicationUpdates,
        cvUpdates: prefs.cvUpdates,
        weeklyDigest: prefs.weeklyDigest,
        defaultReminderDaysBefore: prefs.defaultReminderDaysBefore,
      };
      const saved = await this.notifSvc.updatePreferences(dto);
      if (saved.success && saved.data) this.preferences.set(saved.data);
      this.showSuccessToast();
    } catch {
      if (this.backup) this.preferences.set(this.backup);
    } finally {
      this.saving.set(false);
    }
  }

  onReminderChange(value: string) {
    const prefs = this.preferences();
    if (!prefs) return;
    prefs.defaultReminderDaysBefore = Number(value);
    this.savePreferences();
  }

  private showSuccessToast() {
    this.showSuccess.set(true);
    setTimeout(() => this.showSuccess.set(false), 2400);
  }
}
