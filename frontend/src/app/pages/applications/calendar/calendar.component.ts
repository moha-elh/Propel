import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSelectComponent } from '@app/shared/components/app-select/app-select.component';
import { ReminderService } from '@app/services/reminder.service';
import { AuthService } from '@app/services/auth.service';
import { ApplicationService } from '@app/services/application.service';
import { CalendarConfigurationService } from '@app/services/calendar-configuration.service';
import {
  CreateReminderDto,
  ReminderResultDto,
  ReminderOffsetType,
  REMINDER_OFFSET_OPTIONS,
} from '@app/models/reminder.model';
import { CalendarEventDto } from '@app/models/calendar-event.model';
import { CalendarConfigurationDto } from '@app/models/calendar-configuration.model';
import { STATUS_LABELS, STATUS_ORDER } from '@app/models/application.model';
import { RefreshButtonComponent } from '@app/shared/components/refresh-button/refresh-button.component';

interface CalendarEvent {
  id: string;
  date: Date;
  type: string;
  title: string;
  subtitle?: string;
  source: 'reminder' | 'application';
}

interface CalendarDay {
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

const MAX_VISIBLE_EVENTS = 3;
const STATUS_OPTIONS = STATUS_ORDER;

/** Fallback statuses so application events appear even before the user opens the config filter. */
const DEFAULT_APP_STATUSES = ['SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, AppSelectComponent, RefreshButtonComponent],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent implements OnInit {
  private reminderSvc = inject(ReminderService);
  private authSvc = inject(AuthService);
  private appSvc = inject(ApplicationService);
  private configSvc = inject(CalendarConfigurationService);

  currentMonth = signal(new Date());
  viewMode = signal<'month' | 'week'>('month');
  
  remindersList = signal<ReminderResultDto[]>([]);
  offsetOptions = REMINDER_OFFSET_OPTIONS;
  loading = signal(false);
  refreshing = signal(false);
  saving = signal(false);
  error = signal('');
  successMsg = signal('');

  config = signal<CalendarConfigurationDto | null>(null);
  appEvents = signal<CalendarEventDto[]>([]);
  showFilter = signal(false);
  configLoading = signal(false);
  popoverDay = signal<CalendarDay | null>(null);

  showForm = signal(false);
  form = {
    title: '',
    message: '',
    eventDate: '',
    reminderOffset: 'OneDay' as ReminderOffsetType,
  };

  statusOptions = STATUS_OPTIONS;
  statusLabels = STATUS_LABELS;

  async ngOnInit() {
    await Promise.all([
      this.loadReminders(),
      this.loadConfig(),
    ]);
  }

  calendarEvents = computed(() => {
    const cfg = this.config();
    const events: CalendarEvent[] = [];

    if (cfg?.showReminders !== false) {
      for (const r of this.remindersList()) {
        events.push({
          id: r.id,
          date: new Date(r.eventDate),
          type: this.getEventTypeFromTitle(r.title),
          title: r.title,
          subtitle: r.message,
          source: 'reminder',
        });
      }
    }

    const selected = cfg?.selectedStatuses ?? [];
    for (const e of this.appEvents()) {
      if (selected.length === 0 || this.isStatusInFilter(e.type, selected)) {
        events.push({
          id: e.applicationId,
          date: new Date(e.date + 'T00:00:00'),
          type: e.type,
          title: e.title,
          subtitle: `${e.companyName} - ${e.positionTitle}`,
          source: 'application',
        });
      }
    }

    return events;
  });

  eventsForDay(day: number, month?: number, year?: number): CalendarEvent[] {
    const d = this.currentMonth();
    const targetDate = new Date(year ?? d.getFullYear(), month ?? d.getMonth(), day);
    return this.calendarEvents().filter(ev =>
      ev.date.getFullYear() === targetDate.getFullYear() &&
      ev.date.getMonth() === targetDate.getMonth() &&
      ev.date.getDate() === targetDate.getDate()
    );
  }

  visibleEventsForDay(day: number, month?: number, year?: number): CalendarEvent[] {
    return this.eventsForDay(day, month, year).slice(0, MAX_VISIBLE_EVENTS);
  }

  hiddenCountForDay(day: number, month?: number, year?: number): number {
    const total = this.eventsForDay(day, month, year).length;
    return Math.max(0, total - MAX_VISIBLE_EVENTS);
  }

  private isStatusInFilter(type: string, statuses: string[]): boolean {
    return statuses.includes(type.toUpperCase());
  }

  showDayPopover(day: number, month?: number, year?: number) {
    const d = this.currentMonth();
    this.popoverDay.set({ day, month: month ?? d.getMonth(), year: year ?? d.getFullYear(), isCurrentMonth: true, isToday: false });
  }

  closeDayPopover() {
    this.popoverDay.set(null);
  }

  async loadReminders() {
    this.loading.set(true);
    this.error.set('');
    try {
      const user = this.authSvc.currentUser();
      if (user) {
        const data = await this.reminderSvc.getUserReminders();
        this.remindersList.set(data);
      }
    } catch (e: any) {
      this.error.set('Failed to load reminders');
      console.error(e);
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  onRefresh() {
    this.refreshing.set(true);
    Promise.all([this.loadReminders(), this.loadAppEvents()]).finally(() => this.refreshing.set(false));
  }

  async loadConfig() {
    this.configLoading.set(true);
    try {
      const user = this.authSvc.currentUser();
      if (!user) return;
      const res = await this.configSvc.getConfiguration();
      if (res.success && res.data) {
        this.config.set(res.data);
        await this.loadAppEvents();
      }
    } catch (e: any) {
      console.error('Failed to load config', e);
    } finally {
      this.configLoading.set(false);
    }
  }

  async loadAppEvents() {
    const d = this.currentMonth();
    const year = d.getFullYear();
    const month = d.getMonth();
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59);

    const selected = this.config()?.selectedStatuses;
    const statuses = selected && selected.length > 0 ? selected : DEFAULT_APP_STATUSES;

    try {
      const res = await this.appSvc.getCalendarEvents({
        from: from.toISOString(),
        to: to.toISOString(),
        statuses,
      });
      if (res.success && res.data) {
        this.appEvents.set(res.data);
      }
    } catch (e: any) {
      console.error('Failed to load app events', e);
    }
  }

  /** Number of application events (applies) on a given day — drives the per-day count badge. */
  appCountForDay(day: number, month?: number, year?: number): number {
    return this.eventsForDay(day, month, year).filter(ev => ev.source === 'application').length;
  }

  async saveConfig() {
    const cfg = this.config();
    if (!cfg) return;
    try {
      await this.configSvc.updateConfiguration({
        showReminders: cfg.showReminders,
        selectedStatuses: cfg.selectedStatuses,
      });
      await this.loadAppEvents();
    } catch (e: any) {
      console.error('Failed to save config', e);
    }
  }

  toggleFilter() {
    this.showFilter.update(v => !v);
  }

  closeFilter() {
    this.showFilter.set(false);
  }

  toggleReminderFilter() {
    this.config.update(cfg => {
      if (!cfg) return cfg;
      return { ...cfg, showReminders: !cfg.showReminders };
    });
    this.saveConfig();
  }

  toggleStatusFilter(status: string) {
    this.config.update(cfg => {
      if (!cfg) return cfg;
      const current = [...cfg.selectedStatuses];
      const idx = current.indexOf(status);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(status);
      }
      return { ...cfg, selectedStatuses: current };
    });
    this.saveConfig();
  }

  isStatusSelected(status: string): boolean {
    return this.config()?.selectedStatuses?.includes(status) ?? false;
  }

  getStatusLabel(status: string): string {
    return (this.statusLabels as Record<string, string>)[status] ?? status;
  }

  toggleForm() {
    this.showForm.update(v => !v);
    this.error.set('');
    this.successMsg.set('');
  }

  async submit() {
    if (!this.form.title || !this.form.eventDate) {
      this.error.set('Title and event date are required');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.successMsg.set('');

    try {
      const user = this.authSvc.currentUser();

      const dto: CreateReminderDto = {
        userId: user?.userId || '',
        userEmail: user?.email || '',
        userFirstName: user?.firstName || '',
        title: this.form.title,
        message: this.form.message || undefined,
        eventDate: new Date(this.form.eventDate).toISOString(),
        reminderOffset: this.form.reminderOffset,
      };

      await this.reminderSvc.create(dto);
      this.successMsg.set('Reminder created successfully!');
      this.resetForm();
      await this.loadReminders();
    } catch (e: any) {
      this.error.set('Failed to create reminder');
      console.error(e);
    } finally {
      this.saving.set(false);
    }
  }

  async cancelReminder(reminderId: string) {
    try {
      await this.reminderSvc.cancel(reminderId);
      await this.loadReminders();
    } catch (e: any) {
      this.error.set('Failed to cancel reminder');
      console.error(e);
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Pending': return 'badge-pending';
      case 'Sent': return 'badge-sent';
      case 'Cancelled': return 'badge-cancelled';
      case 'Failed': return 'badge-failed';
      default: return '';
    }
  }

  getOffsetLabel(offset: string): string {
    return this.offsetOptions.find(o => o.value === offset)?.label || offset;
  }

  private resetForm() {
    this.form = { title: '', message: '', eventDate: '', reminderOffset: 'OneDay' };
    this.showForm.set(false);
  }

  monthYear = computed(() => {
    const d = this.currentMonth();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });

  calendarDays = computed(() => {
    const d = this.currentMonth();
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();

    const cells: CalendarDay[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysInPrev - i, month: month - 1, year: month === 0 ? year - 1 : year, isCurrentMonth: false, isToday: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
      cells.push({ day, month, year, isCurrentMonth: true, isToday });
    }

    const remaining = 7 - (cells.length % 7 || 7);
    if (remaining < 7) {
      for (let day = 1; day <= remaining; day++) {
        cells.push({ day, month: month + 1, year: month === 11 ? year + 1 : year, isCurrentMonth: false, isToday: false });
      }
    }

    return cells;
  });

  goToToday() {
    this.currentMonth.set(new Date());
    this.loadAppEvents();
  }

  private getEventTypeFromTitle(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('interview')) return 'interview';
    if (t.includes('follow') || t.includes('follow-up')) return 'follow-up';
    if (t.includes('deadline') || t.includes('due')) return 'deadline';
    if (t.includes('apply') || t.includes('applied')) return 'applied';
    if (t.includes('review')) return 'reviewed';
    return 'reminder';
  }

  prevMonth() {
    const d = new Date(this.currentMonth());
    d.setMonth(d.getMonth() - 1);
    this.currentMonth.set(d);
    this.loadAppEvents();
  }

  nextMonth() {
    const d = new Date(this.currentMonth());
    d.setMonth(d.getMonth() + 1);
    this.currentMonth.set(d);
    this.loadAppEvents();
  }

  toggleView(view: 'month' | 'week') {
    this.viewMode.set(view);
  }
}
