export interface CVProfile {
  id?: string;
  title: string; // Job title (ex: Senior Web Developer)
  summary: string; // Professional Bio
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  openToRelocate?: boolean;
  userId?: string;
}

export interface Project {
  id?: string;
  title: string;
  description?: string;
  role?: string;
  startDate: string;
  endDate?: string;
  repositoryUrl?: string;
  demoUrl?: string;
  status: string;
  skillsJson?: string;
  category?: string;
  teamSize?: number;
  sortOrder?: number;
  userId?: string;
}

export interface Skill {
  id?: string;
  name: string;
  level?: string;
  yearsOfExperience?: number;
  category?: string;
  subcategory?: string;
  lastUsedYear?: number;
  isCore?: boolean;
  sortOrder?: number;
  userId?: string;
}

export interface Experience {
  id?: string;
  company: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  status: string;
  location?: string;
  achievementsJson?: string;
  employmentType?: string;
  sortOrder?: number;
  userId?: string;
}

export interface Education {
  id?: string;
  institution?: string;
  institutionName?: string;
  degree?: string;
  degreeType?: string;
  fieldOfStudy?: string;
  specialization?: string;
  startDate: string;
  endDate?: string;
  grade?: string;
  description?: string;
  status?: string;
  country?: string;
  sortOrder?: number;
  city?: string;
  userId?: string;
  DiplomaFileUrl?: string;
}

export interface Certification {
  id?: string;
  name: string;
  issuingOrganization?: string; // Backend field name
  issueDate?: string;
  credentialUrl?: string;
  credentialId?: string;
  expiryDate?: string;
  sortOrder?: number;
  userId?: string;
}

export interface Language {
  id?: string;
  name: string;
  level: string;
  sortOrder?: number;
  userId?: string;
}

export interface Interest {
  id?: string;
  name: string;
  sortOrder?: number;
  userId?: string;
}

export interface SocialLink {
  id?: string;
  platform: string;
  url: string;
  sortOrder?: number;
  userId?: string;
}

export interface AcademicActivity {
  id?: string;
  title: string;
  organization?: string;
  role?: string;
  description?: string;
  startDate: string;
  endDate?: string;
  sortOrder?: number;
  userId?: string;
}

export interface Hackathon {
  id?: string;
  name: string;
  organization?: string; // Backend field name
  date?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  role?: string;
  result?: string; // Backend field name (e.g. "Winner", "Finalist")
  projectUrl?: string;
  sortOrder?: number;
  userId?: string;
}

export type EntityType = 
  | 'cvprofiles' 
  | 'projects' 
  | 'skills' 
  | 'experiences' 
  | 'educations' 
  | 'certifications' 
  | 'languages' 
  | 'interests' 
  | 'sociallinks' 
  | 'academicactivities' 
  | 'hackathons';

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  options?: string[];
  required?: boolean;
  /** Mirrors the backend [MaxLength] on the same field. */
  maxLength?: number;
}

export const ENTITY_FIELDS: Record<EntityType, FieldConfig[]> = {
  cvprofiles: [
    { name: 'title', label: 'Job Title', type: 'text', required: true, maxLength: 150, placeholder: 'e.g. Senior Web Developer' },
    { name: 'summary', label: 'Professional Summary', type: 'textarea', required: true },
    { name: 'email', label: 'Email', type: 'text', maxLength: 150 },
    { name: 'phone', label: 'Phone', type: 'text', maxLength: 50 },
    { name: 'location', label: 'Location', type: 'text', maxLength: 200 },
    { name: 'website', label: 'Website', type: 'text', maxLength: 300 },
    { name: 'linkedInUrl', label: 'LinkedIn URL', type: 'text', maxLength: 300 },
    { name: 'githubUrl', label: 'GitHub URL', type: 'text', maxLength: 300 },
    { name: 'openToRelocate', label: 'Open to Relocate', type: 'checkbox' },
  ],
  projects: [
    { name: 'title', label: 'Project Title', type: 'text', required: true, maxLength: 150 },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 3000 },
    { name: 'role', label: 'Your Role', type: 'text', maxLength: 50 },
    { name: 'status', label: 'Status', type: 'select', options: ['Ongoing', 'Completed', 'On Hold'] },
    { name: 'category', label: 'Category', type: 'text', maxLength: 100, placeholder: 'e.g. Web, Mobile, ML' },
    { name: 'teamSize', label: 'Team Size', type: 'number' },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true },
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'repositoryUrl', label: 'Repository URL', type: 'text', maxLength: 300 },
    { name: 'demoUrl', label: 'Demo URL', type: 'text', maxLength: 300 },
    { name: 'skillsJson', label: 'Skills ', type: 'textarea' },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  skills: [
    { name: 'name', label: 'Skill Name', type: 'text', required: true, maxLength: 100 },
    { name: 'category', label: 'Category', type: 'text', maxLength: 50, placeholder: 'e.g. Frontend, Soft Skill' },
    { name: 'subcategory', label: 'Subcategory', type: 'text', maxLength: 50, placeholder: 'e.g. React, Team Leadership' },
    { name: 'level', label: 'Level', type: 'select', maxLength: 20, options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
    { name: 'yearsOfExperience', label: 'Years of Experience', type: 'number' },
    { name: 'lastUsedYear', label: 'Last Used Year', type: 'number' },
    { name: 'isCore', label: 'Core Skill', type: 'checkbox' },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  experiences: [
    { name: 'company', label: 'Company', type: 'text', required: true, maxLength: 150 },
    { name: 'title', label: 'Job Title', type: 'text', required: true, maxLength: 150 },
    { name: 'status', label: 'Status', type: 'select', options: ['Ongoing', 'Completed'] },
    { name: 'employmentType', label: 'Employment Type', type: 'select', maxLength: 50, options: ['Full-time', 'Part-time', 'Internship', 'Contract', 'Freelance'] },
    { name: 'location', label: 'Location', type: 'text', maxLength: 150 },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true },
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 500 },
    { name: 'achievementsJson', label: 'Achievements (JSON)', type: 'textarea', maxLength: 2000 },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  educations: [
    { name: 'institutionName', label: 'Institution', type: 'text', required: true, maxLength: 150 },
    { name: 'degreeType', label: 'Degree Type', type: 'text', required: true, maxLength: 100 },
    { name: 'fieldOfStudy', label: 'Field of Study', type: 'text', required: true, maxLength: 100 },
    { name: 'specialization', label: 'Specialization', type: 'text', maxLength: 100 },
    { name: 'grade', label: 'Grade / GPA', type: 'text', maxLength: 50 },
    { name: 'country', label: 'Country', type: 'text', maxLength: 100 },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true },
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', options: ['Ongoing', 'Completed'] },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 1000 },
    { name: 'city', label: 'City', type: 'text', maxLength: 100 },
    { name: 'DiplomaFileUrl', label: 'Diploma File URL', type: 'text', maxLength: 300 },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  certifications: [
    { name: 'name', label: 'Certification Name', type: 'text', required: true, maxLength: 200 },
    { name: 'issuingOrganization', label: 'Issuing Organization', type: 'text', maxLength: 200 },
    { name: 'issueDate', label: 'Issue Date', type: 'date' },
    { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
    { name: 'credentialId', label: 'Credential ID', type: 'text', maxLength: 200 },
    { name: 'credentialUrl', label: 'Credential URL', type: 'text', maxLength: 300 },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  languages: [
    { name: 'name', label: 'Language', type: 'text', required: true, maxLength: 50 },
    { name: 'level', label: 'Level', type: 'select', maxLength: 20, options: ['Native', 'Fluent', 'Professional', 'Intermediate', 'Elementary'] },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  interests: [
    { name: 'name', label: 'Interest', type: 'text', required: true, maxLength: 100 },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  sociallinks: [
    { name: 'platform', label: 'Platform', type: 'text', required: true, maxLength: 50, placeholder: 'e.g. LinkedIn, GitHub' },
    { name: 'url', label: 'URL', type: 'text', required: true, maxLength: 300 },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  academicactivities: [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 200 },
    { name: 'organization', label: 'Organization', type: 'text' },
    { name: 'role', label: 'Role', type: 'text', maxLength: 150 },
    { name: 'startDate', label: 'Start Date', type: 'date', required: true },
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
  hackathons: [
    { name: 'name', label: 'Hackathon Name', type: 'text', required: true, maxLength: 200 },
    { name: 'organization', label: 'Organization', type: 'text' },
    { name: 'date', label: 'Date', type: 'date' },
    { name: 'startDate', label: 'Start Date', type: 'date' },
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'role', label: 'Your Role', type: 'text' },
    { name: 'result', label: 'Result', type: 'text', placeholder: 'e.g. Winner, Finalist' },
    { name: 'projectUrl', label: 'Project URL', type: 'text', maxLength: 300 },
    { name: 'sortOrder', label: 'Sort Order', type: 'number' },
  ],
};
