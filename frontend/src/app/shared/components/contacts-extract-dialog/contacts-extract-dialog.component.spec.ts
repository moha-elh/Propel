import { parseAiContacts, DraftContact } from './contacts-extract-dialog.component';

describe('parseAiContacts', () => {
  it('parses person blocks from the company-contacts prompt format', () => {
    const text = `**Name**: Sophie Martin
**Position**: Talent Acquisition Lead
**Company**: Capgemini
**Email**: sophie.martin@capgemini.com
**Phone**: +33 1 47 54 50 00
**LinkedIn Profile**: https://www.linkedin.com/in/sophiemartin
**Notes**: speaks English & French

**Name**: Karim Benali
**Position**: Delivery Director
**Company**: Capgemini
**Email**: karim.benali@capgemini.com
**LinkedIn Profile**: https://www.linkedin.com/in/karimbenali`;

    const rows = parseAiContacts(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Sophie Martin',
      position: 'Talent Acquisition Lead',
      company: 'Capgemini',
      email: 'sophie.martin@capgemini.com',
      phone: '+33 1 47 54 50 00',
      linkedinUrl: 'https://www.linkedin.com/in/sophiemartin',
      notes: 'speaks English & French',
      selected: true,
      person: true,
    });
    expect(rows[1].email).toBe('karim.benali@capgemini.com');
    expect(rows[1].person).toBe(true);
  });

  it('synthesizes one contact per email for company-info blocks, name = company', () => {
    const text = `**Company Name**: Sopra Steria Morocco
**Website**: https://www.soprasteria.ma
**Sector**: IT services / consulting
**Emails**: recrutement.maroc@soprasteria.com; rh.contact@soprasteria.com
**Phones**: +212 5 22 00 00 00, +212 6 61 00 00 00
**Address**: Casablanca, Morocco
**LinkedIn URL**: https://www.linkedin.com/company/sopra-steria-morocco`;

    const rows = parseAiContacts(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Sopra Steria Morocco');
    expect(rows[0].position).toBe('Recruitment');
    expect(rows[0].email).toBe('recrutement.maroc@soprasteria.com');
    expect(rows[0].phone).toBe('+212 5 22 00 00 00');
    expect(rows[0].linkedinUrl).toBe('https://www.linkedin.com/company/sopra-steria-morocco');
    expect(rows[0].company).toBe('Sopra Steria Morocco');
    expect(rows[1].position).toBe('Recruitment');
    expect(rows.every(r => r.person === false)).toBe(true);
  });

  it('creates one contact per phone when the company block has no emails', () => {
    const text = `**Company Name**: Kooralik
**Phones**: +33 1 23 45 67 89, +33 6 98 76 54 32
**Address**: Paris, France
**LinkedIn URL**: https://www.linkedin.com/company/kooralik`;

    const rows = parseAiContacts(text);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.phone)).toEqual(['+33 1 23 45 67 89', '+33 6 98 76 54 32']);
    expect(rows[0].company).toBe('Kooralik');
    expect(rows[0].position).toBe('Contact');
  });

  it('falls back to the provided company when the block states none', () => {
    const text = `**Emails**: contact@acme.com
**Phones**: +1 555 000 1111`;

    const rows = parseAiContacts(text, 'Acme Corp');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Acme Corp');
    expect(rows[0].company).toBe('Acme Corp');
  });

  it('pulls the LinkedIn URL from Social Links when no LinkedIn URL field', () => {
    const text = `**Company Name**: Zeta Labs
**Emails**: hello@zeta.io
**Social Links**:
- LinkedIn: https://www.linkedin.com/company/zeta-labs
- GitHub: https://github.com/zeta-labs`;

    const rows = parseAiContacts(text);
    expect(rows[0].linkedinUrl).toBe('https://www.linkedin.com/company/zeta-labs');
  });

  it('prefers the passed company over the block company when opened from a company page', () => {
    const text = `Name: Mahmoud El-Tahan
Position: Director of Talent Acquisition
Company: Capgemini
Email: N/A
LinkedIn Profile: https://eg.linkedin.com/in/mahmoud-el-tahan-402a7930

**Company Name**: Capgemini
**Emails**: recruit@capgemini.com`;

    const rows = parseAiContacts(text, 'Capgemini Morocco');
    expect(rows).toHaveLength(2);
    expect(rows[0].company).toBe('Capgemini Morocco');
    expect(rows[1].company).toBe('Capgemini Morocco');
    expect(rows[0].person).toBe(true);
    expect(rows[1].person).toBe(false);
  });

  it('uses the block company when no company page context is given', () => {
    const text = `Name: Mahmoud El-Tahan
Company: Capgemini
LinkedIn Profile: https://eg.linkedin.com/in/mahmoud-el-tahan-402a7930`;

    const rows = parseAiContacts(text);
    expect(rows[0].company).toBe('Capgemini');
  });

  it('splits consecutive person records even when blank lines are stripped (repeated Name header)', () => {
    const text = `Name: Mahmoud El-Tahan
Position: Director of Talent Acquisition
Company: Capgemini
Email: N/A
Phone: N/A
LinkedIn Profile: https://eg.linkedin.com/in/mahmoud-el-tahan-402a7930
Notes: Oversees regional talent acquisition and recruitment strategy.
Name: Brajesh Singh
Position: Director of Talent Acquisition - Asia Pacific & Middle East
Company: Capgemini
Email: N/A
Phone: N/A
LinkedIn Profile: https://sg.linkedin.com/in/brajesh-singh-2229953
Notes: Leads talent management strategies.
Name: Aiman Ezzat
Position: Chief Executive Officer
Company: Capgemini
Email: N/A
Phone: N/A
Mobile: N/A
Fax: N/A
Address: N/A
LinkedIn Profile: N/A
Notes: Top decision-maker and overall lead of Capgemini Group operations.`;

    const rows = parseAiContacts(text);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.name)).toEqual(['Mahmoud El-Tahan', 'Brajesh Singh', 'Aiman Ezzat']);
    expect(rows[1].linkedinUrl).toBe('https://sg.linkedin.com/in/brajesh-singh-2229953');
    expect(rows[2].email).toBe('');
    expect(rows[2].phone).toBe('');
    expect(rows[2].linkedinUrl).toBe('');
    expect(rows.every(r => r.person === true)).toBe(true);
  });

  it('splits consecutive company records without blank lines', () => {
    const text = `Company Name: Acme Inc
Emails: hello@acme.com
LinkedIn URL: https://www.linkedin.com/company/acme
Company Name: Globex Corp
Phones: +1 555 111 2222
LinkedIn URL: https://www.linkedin.com/company/globex`;

    const rows = parseAiContacts(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe('hello@acme.com');
    expect(rows[0].company).toBe('Acme Inc');
    expect(rows[1].phone).toBe('+1 555 111 2222');
    expect(rows[1].company).toBe('Globex Corp');
  });

  it('skips N/A and empty-valued placeholder lines and unknown blocks', () => {
    const text = `**Name**: ...
**Email**: ...
**Notes**: ...`;

    expect(parseAiContacts(text)).toHaveLength(0);
    expect(parseAiContacts('**Company Name**: N/A\n**Emails**: N/A\n**Phones**: N/A')).toHaveLength(0);
    expect(parseAiContacts('Random paragraph without label structure.')).toHaveLength(0);
  });
});