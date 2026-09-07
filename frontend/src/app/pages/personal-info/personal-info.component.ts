import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { APP_NAME } from '@app/app-name';
import { UserProfileService } from '@app/services/user-profile.service';
import { AuthService } from '@app/services/auth.service';
import { UserProfile, UpdateUserProfileDto, ProfessionalTitle } from '@app/models/user-profile.model';
import { ImagePickerComponent } from '@app/shared/components/image-picker/image-picker.component';
import { ImageDto } from '@app/services/image.service';

@Component({
  selector: 'app-personal-info',
  standalone: true,
  imports: [CommonModule, FormsModule, ImagePickerComponent],
  templateUrl: './personal-info.component.html',
  styleUrl: './personal-info.component.scss',
})
export class PersonalInfoComponent implements OnInit {
  private profileSvc = inject(UserProfileService);
  private authSvc = inject(AuthService);

  appName = APP_NAME;
  profile = signal<UserProfile | null>(null);
  loading = signal(true);
  saving = signal(false);
  saved = signal(false);
  error = signal<string | null>(null);
  avatarPickerOpen = signal(false);

  onAvatarPicked(img: ImageDto): void {
    const p = this.profile();
    if (!p) return;
    p.avatarUrl = img.url;
  }

  editingTitle = signal<ProfessionalTitle | null>(null);
  titleInput = signal('');
  showTitleForm = signal(false);

  employmentTypeOptions = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
  remoteOptions = ['Remote', 'Hybrid', 'On-site'];
  relocateOptions = ['Yes', 'No', 'Limited'];
  noticeOptions = ['Immediate', '1 week', '2 weeks', '1 month', '2 months', '3 months'];

  initials = computed(() => {
    const p = this.profile();
    if (!p) return '?';
    return (p.firstName[0] + p.lastName[0]).toUpperCase();
  });

  fullName = computed(() => {
    const p = this.profile();
    return p ? `${p.firstName} ${p.lastName}` : 'User';
  });

  ngOnInit() {
    this.loadProfile();
  }

  async loadProfile() {
    this.loading.set(true);
    try {
      const profile = await this.profileSvc.getMyProfile();
      if (profile) {
        profile.employmentTypes = this.parseJsonArray(profile.employmentTypes);
        profile.professionalTitles = this.parseJsonArray(profile.professionalTitles);
      }
      this.profile.set(profile);
      if (profile) {
        this.authSvc.currentUser.set({
          userId: profile.id,
          keycloakId: profile.keycloakId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          role: profile.role,
          isActive: profile.isActive,
          avatarUrl: profile.avatarUrl,
        });
      }
    } catch {
      this.error.set('Failed to load profile');
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    const p = this.profile();
    if (!p) return;

    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);

    try {
      const dto: UpdateUserProfileDto = {
        firstName: p.firstName,
        lastName: p.lastName,
        phoneNumber: p.phoneNumber,
        birthDate: p.birthDate,
        avatarUrl: p.avatarUrl,
        headline: p.headline,
        city: p.city,
        country: p.country,
        authorizedCountry: p.authorizedCountry,
        requiresVisaSponsorship: p.requiresVisaSponsorship,
        noticePeriod: p.noticePeriod,
        employmentTypes: JSON.stringify(p.employmentTypes),
        remotePreference: p.remotePreference,
        willingToRelocate: p.willingToRelocate,
        desiredJobTitle: p.desiredJobTitle,
        desiredSalaryMin: p.desiredSalaryMin,
        desiredSalaryMax: p.desiredSalaryMax,
        bio: p.bio,
        professionalTitles: JSON.stringify(p.professionalTitles),
      };

      const updated = await this.profileSvc.updateProfile(p.id, dto);
      if (updated) {
        updated.employmentTypes = this.parseJsonArray(updated.employmentTypes);
        updated.professionalTitles = this.parseJsonArray(updated.professionalTitles);
        this.profile.set(updated);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2500);
      }
    } catch {
      this.error.set('Failed to save profile');
    } finally {
      this.saving.set(false);
    }
  }

  toggleEmployment(type: string) {
    const p = this.profile();
    if (!p) return;
    const current = p.employmentTypes ?? [];
    if (current.includes(type)) {
      p.employmentTypes = current.filter(t => t !== type);
    } else {
      p.employmentTypes = [...current, type];
    }
  }

  setRemote(val: string) {
    const p = this.profile();
    if (!p) return;
    p.remotePreference = p.remotePreference === val ? undefined : val;
  }

  setRelocate(val: string) {
    const p = this.profile();
    if (!p) return;
    p.willingToRelocate = p.willingToRelocate === val ? undefined : val;
  }

  openTitleForm() {
    this.titleInput.set('');
    this.editingTitle.set(null);
    this.showTitleForm.set(true);
  }

  editTitle(title: ProfessionalTitle) {
    this.titleInput.set(title.title);
    this.editingTitle.set(title);
    this.showTitleForm.set(true);
  }

  cancelTitleForm() {
    this.showTitleForm.set(false);
    this.titleInput.set('');
    this.editingTitle.set(null);
  }

  saveTitle() {
    const p = this.profile();
    if (!p || !this.titleInput().trim()) return;
    const titles = p.professionalTitles ?? [];

    if (this.editingTitle()) {
      const idx = titles.indexOf(this.editingTitle()!);
      if (idx >= 0) {
        titles[idx] = { ...titles[idx], title: this.titleInput().trim() };
      }
    } else {
      titles.push({ id: crypto.randomUUID(), title: this.titleInput().trim(), isDefault: titles.length === 0 });
    }
    p.professionalTitles = [...titles];
    this.cancelTitleForm();
  }

  removeTitle(title: ProfessionalTitle) {
    const p = this.profile();
    if (!p) return;
    const titles = (p.professionalTitles ?? []).filter(t => t !== title);
    if (title.isDefault && titles.length > 0) {
      titles[0].isDefault = true;
    }
    p.professionalTitles = titles;
  }

  setDefaultTitle(title: ProfessionalTitle) {
    const p = this.profile();
    if (!p) return;
    p.professionalTitles = (p.professionalTitles ?? []).map(t => ({
      ...t,
      isDefault: t === title,
    }));
  }

  private parseJsonArray(val: unknown): any {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return undefined; }
    }
    return undefined;
  }

  formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }
}
