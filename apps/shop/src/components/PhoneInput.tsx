import { useMemo, useState } from 'react';

export type PhoneCountry = {
  code: string;
  dial: string;
  digits: number;
  label: string;
  /** Groupes d’affichage du numéro national (ex. CI 10 chiffres → 2+2+2+2+2). */
  groups: number[];
  placeholder: string;
};

/** Formats nationaux en vigueur (UEMOA / proches). */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    code: 'CI',
    dial: '225',
    digits: 10,
    label: 'Côte d’Ivoire',
    groups: [2, 2, 2, 2, 2],
    placeholder: '07 00 00 00 00',
  },
  {
    code: 'SN',
    dial: '221',
    digits: 9,
    label: 'Sénégal',
    groups: [2, 3, 2, 2],
    placeholder: '77 000 00 00',
  },
  {
    code: 'BF',
    dial: '226',
    digits: 8,
    label: 'Burkina Faso',
    groups: [2, 2, 2, 2],
    placeholder: '70 00 00 00',
  },
  {
    code: 'ML',
    dial: '223',
    digits: 8,
    label: 'Mali',
    groups: [2, 2, 2, 2],
    placeholder: '70 00 00 00',
  },
  {
    code: 'GN',
    dial: '224',
    digits: 9,
    label: 'Guinée',
    groups: [3, 2, 2, 2],
    placeholder: '620 00 00 00',
  },
];

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatNational(digits: string, groups: number[]): string {
  const max = groups.reduce((a, b) => a + b, 0);
  let rest = digits.slice(0, max);
  const parts: string[] = [];
  for (const g of groups) {
    if (!rest) break;
    parts.push(rest.slice(0, g));
    rest = rest.slice(g);
  }
  return parts.join(' ');
}

/** E.164 : +225XXXXXXXXXX */
export function toE164(dial: string, nationalDigits: string): string {
  const n = digitsOnly(nationalDigits);
  if (!n) return '';
  return `+${dial}${n}`;
}

export function parseIncoming(
  value: string,
  fallback: PhoneCountry = PHONE_COUNTRIES[0]!,
): { country: PhoneCountry; national: string } {
  const raw = digitsOnly(value);
  if (!raw) return { country: fallback, national: '' };

  const match = PHONE_COUNTRIES.find(
    (c) => raw.startsWith(c.dial) && raw.length >= c.dial.length,
  );
  if (match) {
    return {
      country: match,
      national: raw.slice(match.dial.length).slice(0, match.digits),
    };
  }
  return { country: fallback, national: raw.slice(0, fallback.digits) };
}

export function isValidPhoneE164(value: string): boolean {
  if (!value) return false;
  const { country, national } = parseIncoming(value);
  return national.length === country.digits;
}

type Props = {
  value: string;
  onChange: (e164: string) => void;
  required?: boolean;
  id?: string;
};

export function PhoneInput({ value, onChange, required, id }: Props) {
  const initial = useMemo(() => parseIncoming(value), []);
  const [countryCode, setCountryCode] = useState(initial.country.code);
  const [national, setNational] = useState(initial.national);

  const country =
    PHONE_COUNTRIES.find((c) => c.code === countryCode) ?? PHONE_COUNTRIES[0]!;

  function emit(nextCountry: PhoneCountry, nextNational: string) {
    const clipped = digitsOnly(nextNational).slice(0, nextCountry.digits);
    setNational(clipped);
    onChange(toE164(nextCountry.dial, clipped));
  }

  function onCountryChange(code: string) {
    const next = PHONE_COUNTRIES.find((c) => c.code === code) ?? PHONE_COUNTRIES[0]!;
    setCountryCode(next.code);
    emit(next, national);
  }

  function onNationalChange(raw: string) {
    emit(country, raw);
  }

  const display = formatNational(national, country.groups);
  const complete = national.length === country.digits;
  const incomplete = national.length > 0 && !complete;

  return (
    <div className="phone-input">
      <div className="phone-input-row">
        <label className="phone-input-country">
          <span className="visually-hidden">Pays</span>
          <select
            value={country.code}
            onChange={(e) => onCountryChange(e.target.value)}
            aria-label="Indicatif pays"
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} +{c.dial}
              </option>
            ))}
          </select>
        </label>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          value={display}
          onChange={(e) => onNationalChange(e.target.value)}
          placeholder={country.placeholder}
          aria-invalid={incomplete || undefined}
          maxLength={country.groups.reduce((a, b) => a + b, 0) + country.groups.length}
        />
      </div>
      <p className={`phone-input-hint ${incomplete ? 'is-warn' : complete ? 'is-ok' : ''}`}>
        {country.label} · +{country.dial} · {country.digits} chiffres
        {incomplete
          ? ` · encore ${country.digits - national.length}`
          : complete
            ? ' · OK'
            : ''}
      </p>
    </div>
  );
}
