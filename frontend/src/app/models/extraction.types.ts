export interface ExtractorOutput {
  enterpriseName?: string;
  enterpriseDescription?: string;
  enterpriseLogoUrl?: string;
  jobRole?: string;
  rawDescription?: string;
  responsibilities: string[];
  requiredSkills: string[];
  softSkills: string[];
  requiredExperienceYears?: number;
  seniorityLevel?: string;
  employmentType?: string;
  location?: string;
  locationType?: string;
  salaryRange?: string;
  currency?: string;
  certifications: string[];
  languages: string[];
  educationRequirements?: string;
  benefits: string[];
  applicationDeadline?: string;
  contactEmail?: string;
  sourceUrl?: string;
  fieldConfidences: Record<string, number>;
  overallConfidence: number;
}

export interface ExtractionHistoryItem {
  id: string;
  jobRole: string;
  companyName: string;
  createdAt: string;
  overallConfidence: number;
  sourceType: string;
}

export interface AgentConfig {
  model: string;
  temperature: number;
  apiKey: string;
  defaultLanguage: string;
  confidenceThreshold: number;
  defaultExportFormat: 'json' | 'csv';
  autoSave: boolean;
}

export const DEFAULT_CONFIG: AgentConfig = {
  model: 'llama-3.1-8b-instant',
  temperature: 0,
  apiKey: '',
  defaultLanguage: 'en',
  confidenceThreshold: 0,
  defaultExportFormat: 'json',
  autoSave: true,
};
