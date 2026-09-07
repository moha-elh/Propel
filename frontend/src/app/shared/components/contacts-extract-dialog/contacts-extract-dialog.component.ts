import { Component, inject, input, model, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContactService } from '@app/services/contact.service';
import { EmployeeService } from '@app/services/employee.service';
import { ToastService } from '@app/services/toast.service';
import { ContactExtractResult } from '@app/models/mailbox.model';
import { EmployeeExtractResult } from '@app/models/employee.model';

/** One parsed, reviewable contact row. */
export interface DraftContact {
  selected: boolean;
  /** True when the record was a person block (has a real name) — eligible to be saved as an employee too. */
  person: boolean;
  name: string;
  position: string;
  company: string;
  email: string;
  phone: string;
  mobile: string;
  fax: string;
  address: string;
  linkedinUrl: string;
  notes: string;
}

export interface ContactBlock {
  [key: string]: string;
}

/* ------------------------------------------------------------------------- */
/* Parser (pure — unit-testable)                                             */
/* ------------------------------------------------------------------------- */

const NA_RE = /^(n\/?a|na|nil|null|none|not provided|undefined|—|–|-|\.\.\.|…|…\.)$/i;

function clean(value: string): string {
  const v = (value ?? '').trim();
  return NA_RE.test(v) ? '' : v;
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const PERSON_ALIASES: Record<string, string[]> = {
  name: ['name'],
  position: ['position', 'job title', 'role'],
  company: ['company'],
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'tel'],
  mobile: ['mobile', 'gsm'],
  fax: ['fax'],
  address: ['address'],
  linkedinUrl: ['linkedin profile', 'linkedin url', 'linkedin', 'profile'],
  notes: ['notes', 'note'],
};

const COMPANY_ALIASES: Record<string, string[]> = {
  companyName: ['company name'],
  website: ['website', 'website url'],
  linkedinUrl: ['linkedin url', 'linkedin'],
  description: ['description'],
  sector: ['sector'],
  region: ['region'],
  country: ['country'],
  city: ['city'],
  foundedYear: ['founded year', 'founded'],
  employeeSize: ['employee size', 'size'],
  address: ['address'],
  emails: ['emails'],
  phones: ['phones'],
  socialLinks: ['social links'],
};

const LABEL_RE = /^(\*\*)?([A-Za-z][A-Za-z0-9 /()'’.\-]*?)(\*\*)?\s*[:：]\s*(.*)$/;

function indexAliases(aliases: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [field, keys] of Object.entries(aliases)) {
    for (const k of keys) map.set(normKey(k), field);
  }
  return map;
}

const PERSON_KEYS = indexAliases(PERSON_ALIASES);
const COMPANY_KEYS = indexAliases(COMPANY_ALIASES);

/** Splits pasted text into `Field: value` records.
 *  Records are separated by blank lines OR by a repeated header label
 *  (a single record never repeats a field, so a second `Name:` / `Company Name:`
 *  while already inside a block starts the next record). */
function parseBlocks(text: string): ContactBlock[] {
  const blocks: ContactBlock[] = [];
  let block: ContactBlock | null = null;
  let current: string | null = null;
  const flush = () => {
    if (block && Object.keys(block).length > 0) blocks.push(block);
    block = null;
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const m = LABEL_RE.exec(line);
    if (m) {
      const key = normKey(m[2]);
      if (!block) block = {};
      if (key in block) flush(); // duplicate header (blank lines stripped) → next record
      if (!block) block = {};
      current = key;
      block[key] = m[4];
    } else if (current && block) {
      block[current] = (block[current] ? block[current] + '\n' : '') + line.trim();
    }
  }
  flush();
  return blocks;
}

/** Splits a comma/semicolon/newline separated value into non-empty entries. */
function splitList(value: string): string[] {
  return (value ?? '')
    .split(/[,;\n]/)
    .map((s) => clean(s))
    .filter(Boolean);
}

function titleCase(s: string): string {
  const words = s.replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Contact';
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Contact';
}

/** Turns an e-mail local-part into a plausible job title (e.g. recrutement → Recruitment). */
function roleFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').toLowerCase();
  if (/recruit|recrut|rh\b|hr\b|careers?|jobs?|emploi|offres?|hiring/.test(local)) return 'Recruitment';
  if (/contact|info|\bhi\b|support|admin/.test(local)) return 'Contact';
  if (/ventes?|sales|commercial|commerce/.test(local)) return 'Sales';
  if (/facturation|billing|finance|compta/.test(local)) return 'Finance';
  if (/gestion|management|directeur|manager|lead/.test(local)) return 'Management';
  return titleCase(local.split('.')[0] ?? 'Contact');
}

function toWebUrl(value: string): string {
  const v = clean(value);
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : 'https://' + v;
}

function findSocialLinkedin(socialValue: string): string {
  const line = (socialValue ?? '')
    .split(/\r?\n/)
    .find((l) => /linkedin/i.test(l));
  if (!line) return '';
  const url = line.replace(/^[-*]\s*/i, '').replace(/^linkedin\s*:?\s*:?\s*/i, '').trim();
  return toWebUrl(url) || '';
}

function emptyDraft(over: Partial<DraftContact> = {}): DraftContact {
  return {
    selected: true,
    person: false,
    name: '',
    position: '',
    company: '',
    email: '',
    phone: '',
    mobile: '',
    fax: '',
    address: '',
    linkedinUrl: '',
    notes: '',
    ...over,
  };
}

/**
 * Parses an AI-tool response into reviewable draft contacts.
 * Handles two prompt output shapes:
 *  - person blocks (`**Name**: ...`) → one draft per block
 *  - company-info blocks (`**Company Name**:` + `**Emails**:`/`**Phones**:`) →
 *    one draft per e-mail (or per phone when no e-mail), name synthesized from the company
 *
 * When `fallbackCompany` is non-empty (the dialog was opened from a company detail page),
 * that company is AUTHORITATIVE and is applied to every row, overriding the company stated
 * in each block — the batch belongs to the page the user is working on.
 */
export function parseAiContacts(text: string, fallbackCompany = ''): DraftContact[] {
  const drafts: DraftContact[] = [];
  for (const block of parseBlocks(text)) {
    const person = new Map<string, string>();
    for (const [k, field] of PERSON_KEYS) {
      const v = block[k];
      if (v !== undefined) person.set(field, clean(v));
    }
    const name = person.get('name') ?? '';
    if (name) {
      drafts.push(
        emptyDraft({
          person: true,
          name,
          position: person.get('position') ?? '',
          company: fallbackCompany || (person.get('company') ?? ''),
          email: person.get('email') ?? '',
          phone: person.get('phone') ?? '',
          mobile: person.get('mobile') ?? '',
          fax: person.get('fax') ?? '',
          address: person.get('address') ?? '',
          linkedinUrl: person.get('linkedinUrl') ?? '',
          notes: person.get('notes') ?? '',
        }),
      );
      continue;
    }

    const co = new Map<string, string>();
    for (const [k, field] of COMPANY_KEYS) {
      const v = block[k];
      if (v !== undefined) co.set(field, clean(v));
    }
    const companyName = fallbackCompany || co.get('companyName') || '';
    if (!companyName) continue;

    const emails = splitList(co.get('emails') ?? '');
    const phones = splitList(co.get('phones') ?? '');
    const linkedin = co.get('linkedinUrl') || findSocialLinkedin(block[normKey('Social Links')] ?? '');
    const phone = emails.length > 0 ? phones[0] ?? '' : '';
    const notes = co.get('description')
      ? `Company contact — ${co.get('sector') ? `${co.get('sector')}; ` : ''}${co.get('description')}`
      : '';

    if (emails.length > 0) {
      for (const email of emails) {
        drafts.push(
          emptyDraft({
            name: companyName,
            position: roleFromEmail(email),
            company: companyName,
            email,
            phone: phone || undefined,
            address: co.get('address') ?? '',
            linkedinUrl: linkedin,
            notes,
          }),
        );
      }
    } else {
      for (const ph of phones) {
        drafts.push(
          emptyDraft({
            name: companyName,
            position: 'Contact',
            company: companyName,
            phone: ph,
            address: co.get('address') ?? '',
            linkedinUrl: linkedin,
            notes,
          }),
        );
      }
    }
  }
  return drafts;
}

/* ------------------------------------------------------------------------- */

@Component({
  selector: 'app-contacts-extract-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contacts-extract-dialog.component.html',
  styleUrl: './contacts-extract-dialog.component.scss',
})
export class ContactsExtractDialogComponent {
  private readonly contactApi = inject(ContactService);
  private readonly employeeApi = inject(EmployeeService);
  private readonly toast = inject(ToastService);

  /** Two-way bound visibility. */
  open = model(false);
  /** Company to attribute parsed contacts to when the pasted text doesn't state one. */
  company = input('');

  /** Emits the total number of saved records (contacts + employees) after each successful save. */
  saved = output<number>();

  sourceText = signal('');
  phase = signal<'input' | 'review' | 'result'>('input');
  rows = signal<DraftContact[]>([]);
  saving = signal(false);
  saveMode = signal<'contacts' | 'both' | 'employees'>('contacts');
  resultSections = signal<SaveResultSection[]>([]);

  openModal(): void {
    this.resetState();
  }

  private resetState(): void {
    this.phase.set('input');
    this.sourceText.set('');
    this.rows.set([]);
    this.saving.set(false);
    this.saveMode.set('contacts');
    this.resultSections.set([]);
  }

  /** A row can be saved as a contact only when it carries contact info (email/phone/LinkedIn). */
  canContact(row: DraftContact): boolean {
    return !!(row.email || row.phone || row.linkedinUrl);
  }

  /** Count of selected rows that can be saved as contacts. */
  contactCount(): number {
    return this.rows().filter((r) => r.selected && this.canContact(r)).length;
  }

  /** Count of selected person rows (those that can be saved as employees). */
  personCount(): number {
    return this.rows().filter((r) => r.selected && r.person).length;
  }

  /** What a row will be saved as in "Contacts + Employees" mode. */
  kind(row: DraftContact): { label: string; cls: string } {
    const contact = this.canContact(row);
    if (row.person && contact) return { label: 'contact & employee', cls: 'both' };
    if (row.person) return { label: 'employee only', cls: 'employee' };
    if (contact) return { label: 'contact', cls: 'contact' };
    return { label: 'skip', cls: 'none' };
  }

  selectedCount(): number {
    return this.rows().filter((r) => r.selected).length;
  }

  parse(): void {
    const drafts = parseAiContacts(this.sourceText(), this.company());
    if (drafts.length === 0) {
      this.toast.error('No contacts found. Make sure the response uses **Name**: / **Emails**: style blocks.');
      return;
    }
    this.rows.set(drafts);
    this.phase.set('review');
  }

  backToInput(): void {
    this.phase.set('input');
  }

  toggleAll(checked: boolean): void {
    this.rows.update((rs) => rs.map((r) => ({ ...r, selected: checked })));
  }

  async saveSelected(): Promise<void> {
    const selected = this.rows().filter((r) => r.selected);
    if (selected.length === 0) {
      this.toast.error('Select at least one row to save');
      return;
    }

    const mode = this.saveMode();
    const asEmployees = mode !== 'contacts';
    const asContacts = mode !== 'employees';

    const toContact = (r: DraftContact) => ({
      name: r.name,
      email: r.email,
      phone: r.phone || undefined,
      mobile: r.mobile || undefined,
      fax: r.fax || undefined,
      address: r.address || undefined,
      company: r.company || undefined,
      position: r.position || undefined,
      linkedinUrl: r.linkedinUrl || undefined,
      notes: r.notes || undefined,
    });
    const toEmployee = (r: DraftContact) => ({
      name: r.name,
      position: r.position || undefined,
      company: r.company || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
      linkedinUrl: r.linkedinUrl || undefined,
      notes: r.notes || undefined,
    });

    // Per-row routing: contact-eligible = has email/phone/LinkedIn; employee-eligible = real name.
    // In "both" mode a person row WITHOUT contact info goes to employees only (never a dead contact).
    const contactRows = asContacts
      ? selected.filter((r) => this.canContact(r)).map(toContact)
      : [];
    const employeeRows = asEmployees
      ? selected.filter((r) => r.person).map(toEmployee)
      : [];

    if (contactRows.length === 0 && employeeRows.length === 0) {
      const msg = mode === 'employees'
        ? 'No selected rows have a person name to save as employees'
        : mode === 'contacts'
          ? 'No selected rows have contact info (email, phone or LinkedIn) to save as contacts'
          : 'No selected rows can be saved as contacts or employees';
      this.toast.error(msg);
      return;
    }

    this.saving.set(true);
    this.resultSections.set([]);
    try {
      const sections = await this.saveRemote(contactRows, employeeRows);
      this.resultSections.set(sections);
      this.phase.set('result');
      const imported = sections.reduce((sum, s) => sum + s.imported, 0);
      if (imported > 0) {
        this.saved.emit(imported);
        this.toast.success(`${imported} record(s) saved`);
      }
    } catch {
      this.toast.error('Saving failed. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private async saveRemote(
    contactRows: Record<string, unknown>[],
    employeeRows: Record<string, unknown>[],
  ): Promise<SaveResultSection[]> {
    const sections: SaveResultSection[] = [];
    const jobs: Promise<void>[] = [];

    if (contactRows.length > 0) {
      jobs.push(
        this.contactApi.extractContacts(contactRows as never)
          .then((res) => {
            const d = res.data ?? { imported: 0, skipped: 0, errors: ['No response body'] };
            sections.push({ label: 'Contacts', imported: d.imported, skipped: d.skipped, errors: d.errors });
          }),
      );
    }
    if (employeeRows.length > 0) {
      jobs.push(
        this.employeeApi.extract(employeeRows as never)
          .then((res) => {
            const d = res.data ?? { imported: 0, skipped: 0, errors: ['No response body'] };
            sections.push({ label: 'Employees', imported: d.imported, skipped: d.skipped, errors: d.errors });
          }),
      );
    }

    await Promise.all(jobs);
    return sections;
  }

  close(): void {
    this.open.set(false);
  }

  /** After showing the result, let the user start again or just close. */
  restart(): void {
    this.resetState();
  }
}

export interface SaveResultSection {
  label: string;
  imported: number;
  skipped: number;
  errors: string[];
}