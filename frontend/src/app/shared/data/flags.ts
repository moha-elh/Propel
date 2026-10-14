// Country name → flag image. Windows doesn't render flag emoji, so this uses flagcdn.com PNGs.
// Codes come from the browser's own region names (Intl), plus aliases for names that differ.

const ALIASES: Record<string, string> = {
  'united states': 'us', 'usa': 'us', 'united states of america': 'us', 'uk': 'gb', 'united kingdom': 'gb',
  'congo (brazzaville)': 'cg', 'congo (kinshasa)': 'cd', 'czech republic': 'cz', 'ivory coast': 'ci',
  "côte d'ivoire": 'ci', 'south korea': 'kr', 'north korea': 'kp', 'russia': 'ru', 'vatican city': 'va',
  'palestine': 'ps', 'myanmar': 'mm', 'burma': 'mm', 'cabo verde': 'cv', 'eswatini': 'sz', 'micronesia': 'fm',
  'east timor': 'tl', 'timor-leste': 'tl', 'macedonia': 'mk', 'north macedonia': 'mk', 'uae': 'ae',
};

let byName: Map<string, string> | null = null;

function index(): Map<string, string> {
  if (byName) return byName;
  byName = new Map(Object.entries(ALIASES));
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      // First code wins: retired codes like FX ("France") come later and must not shadow FR.
      if (name && name !== code && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), code.toLowerCase());
    }
  } catch { /* old browser: aliases only */ }
  return byName;
}

export function countryCode(country?: string | null): string | null {
  return country ? index().get(country.trim().toLowerCase()) ?? null : null;
}

/** 20px-wide flag PNG for a country name, or '' when unknown. */
export function flagUrl(country?: string | null): string {
  const code = countryCode(country);
  return code ? `https://flagcdn.com/w40/${code}.png` : '';
}
