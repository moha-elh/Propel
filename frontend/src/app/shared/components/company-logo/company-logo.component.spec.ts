import { hostFromUrl, logoDomain } from './company-logo.component';

describe('company-logo domain resolution', () => {
  it('extracts a bare host from a website URL', () => {
    expect(hostFromUrl('https://www.acme.com/careers')).toBe('acme.com');
    expect(hostFromUrl('acme.io')).toBe('acme.io');
    expect(hostFromUrl('  http://sub.acme.co.uk  ')).toBe('sub.acme.co.uk');
  });

  it('returns null for empty or unparseable input', () => {
    expect(hostFromUrl('')).toBeNull();
    expect(hostFromUrl(null)).toBeNull();
    expect(hostFromUrl('   ')).toBeNull();
  });

  it('prefers the real website over a name guess', () => {
    expect(logoDomain('https://stripe.com', 'Stripe Payments Inc')).toBe('stripe.com');
  });

  it('falls back to a name-guessed .com when no website', () => {
    expect(logoDomain(null, 'Goldman Sachs')).toBe('goldmansachs.com');
    expect(logoDomain(null, '')).toBeNull();
  });
});
