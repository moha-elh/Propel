export type TemplateVarValues = Record<string, string | number | null | undefined>;

/** Resolve {{token}} placeholders (case- and whitespace-insensitive). Unknown tokens stay verbatim. */
export function resolveTemplateVars(text: string, values: TemplateVarValues): string {
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Unique lowercase {{token}} names used by a template (subject + body), in order of appearance. */
export function extractTemplateVars(...texts: Array<string | null | undefined>): string[] {
  const seen: string[] = [];
  const added = new Set<string>();
  const rx = /\{\{\s*([\w-]+)\s*\}\}/gi;
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(rx)) {
      const key = m[1].toLowerCase();
      if (!added.has(key)) {
        added.add(key);
        seen.push(key);
      }
    }
  }
  return seen;
}

/** Human-readable label for a supported variable token. */
export const TEMPLATE_VAR_LABELS: Record<string, string> = {
  company_name: 'Company name',
  company_description: 'Company description',
  recipient_name: 'Recipient name',
  recipient_greeting: 'Greeting',
  school: 'School',
  degree: 'Degree',
  research: 'Researching',
  offer_phrase: 'Applying to',
  my_name: 'Your name',
  my_email: 'Your email',
  my_phone: 'Your phone',
  domaine: 'Domaine',
  web_company: 'Company website',
};

/** Label lookup with a sensible fallback for custom tokens. */
export function templateVarLabel(token: string): string {
  return TEMPLATE_VAR_LABELS[token] ?? token.replace(/[-_]/g, ' ');
}

/**
 * Tokens that resolve fine even when left blank (auto-derived from profile/context
 * or optional by nature). Anything else must be filled before a template is inserted.
 */
export const TEMPLATE_AUTO_OPTIONAL: ReadonlySet<string> = new Set([
  'recipient_greeting',
  'school',
  'degree',
  'my_name',
  'my_email',
  'my_phone',
  'company_name',
  'company_description',
]);

export const CONTACT_GENDERS = ['male', 'female'] as const;
export type ContactGender = (typeof CONTACT_GENDERS)[number] | '';

/** French-correct salutation: "cher Prénom" / "chère Prénom", or plain name when gender is unknown. */
export function recipientGreeting(name: string, gender?: string | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const g = (gender || '').trim().toLowerCase();
  if (g === 'male') return `cher ${trimmed}`;
  if (g === 'female') return `chère ${trimmed}`;
  return trimmed;
}