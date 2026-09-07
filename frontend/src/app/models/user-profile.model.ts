export interface ProfessionalTitle {
  id?: string;
  title: string;
  isDefault: boolean;
}

export interface UserProfile {
  id: string;
  keycloakId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  birthDate?: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
  aiProfileDataJson?: string;
  preferencesJson?: string;

  headline?: string;
  city?: string;
  country?: string;
  authorizedCountry?: string;
  requiresVisaSponsorship?: boolean;
  noticePeriod?: string;
  employmentTypes?: string[];
  remotePreference?: string;
  willingToRelocate?: string;
  desiredJobTitle?: string;
  desiredSalaryMin?: number;
  desiredSalaryMax?: number;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  personalWebsite?: string;
  bio?: string;
  professionalTitles?: ProfessionalTitle[];
  profilePhotoKey?: string;
}

export interface UpdateUserProfileDto {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  birthDate?: string;
  avatarUrl?: string;
  headline?: string;
  city?: string;
  country?: string;
  authorizedCountry?: string;
  requiresVisaSponsorship?: boolean;
  noticePeriod?: string;
  employmentTypes?: string;
  remotePreference?: string;
  willingToRelocate?: string;
  desiredJobTitle?: string;
  desiredSalaryMin?: number;
  desiredSalaryMax?: number;
  bio?: string;
  professionalTitles?: string;
  preferencesJson?: string;
  profilePhotoKey?: string;
}
