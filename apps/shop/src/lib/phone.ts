/** Indicatifs + masques nationaux pour l’inscription shop (marché CI + voisins). */

export type PhoneCountry = {
  iso: string;
  dial: string;
  label: string;
  /** X = chiffre ; espaces = séparateurs d’affichage */
  mask: string;
  /** Si true, un 0 national initial est accepté puis retiré en E.164 (ex. France). */
  trunkZero?: boolean;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'CI', dial: '225', label: 'Côte d’Ivoire', mask: 'XX XX XX XX XX' },
  { iso: 'SN', dial: '221', label: 'Sénégal', mask: 'XX XXX XX XX' },
  { iso: 'BF', dial: '226', label: 'Burkina Faso', mask: 'XX XX XX XX' },
  { iso: 'ML', dial: '223', label: 'Mali', mask: 'XX XX XX XX' },
  { iso: 'GN', dial: '224', label: 'Guinée', mask: 'XXX XX XX XX' },
  { iso: 'TG', dial: '228', label: 'Togo', mask: 'XX XX XX XX' },
  { iso: 'BJ', dial: '229', label: 'Bénin', mask: 'XX XX XX XX' },
  { iso: 'NE', dial: '227', label: 'Niger', mask: 'XX XX XX XX' },
  {
    iso: 'FR',
    dial: '33',
    label: 'France',
    mask: 'X XX XX XX XX',
    trunkZero: true,
  },
];

export function phoneDigitCount(mask: string): number {
  return (mask.match(/X/g) ?? []).length;
}

export function maxNationalDigits(country: PhoneCountry): number {
  return phoneDigitCount(country.mask) + (country.trunkZero ? 1 : 0);
}

export function formatPhoneNational(digits: string, country: PhoneCountry): string {
  const expected = phoneDigitCount(country.mask);
  let local = digits;
  let prefix = '';
  if (country.trunkZero && local.startsWith('0') && local.length > expected) {
    prefix = '0 ';
    local = local.slice(1);
  }
  let i = 0;
  let out = '';
  for (const ch of country.mask) {
    if (i >= local.length) break;
    if (ch === 'X') {
      out += local[i]!;
      i += 1;
    } else {
      out += ch;
    }
  }
  return `${prefix}${out}`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Numéro E.164 (+indicatif + national). */
export function toE164(country: PhoneCountry, nationalDigits: string): string {
  let local = nationalDigits;
  const expected = phoneDigitCount(country.mask);
  if (
    country.trunkZero &&
    local.startsWith('0') &&
    local.length === expected + 1
  ) {
    local = local.slice(1);
  }
  return `+${country.dial}${local}`;
}

export function isCompletePhone(
  country: PhoneCountry,
  nationalDigits: string,
): boolean {
  const expected = phoneDigitCount(country.mask);
  if (nationalDigits.length === expected) return true;
  return Boolean(
    country.trunkZero &&
      nationalDigits.startsWith('0') &&
      nationalDigits.length === expected + 1,
  );
}
