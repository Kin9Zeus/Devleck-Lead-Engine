// Normalización de datos de contacto y utilidades geográficas de USA.

export const US_STATES = {
  AL: ['Alabama', 'America/Chicago'], AK: ['Alaska', 'America/Anchorage'], AZ: ['Arizona', 'America/Phoenix'],
  AR: ['Arkansas', 'America/Chicago'], CA: ['California', 'America/Los_Angeles'], CO: ['Colorado', 'America/Denver'],
  CT: ['Connecticut', 'America/New_York'], DE: ['Delaware', 'America/New_York'], DC: ['District of Columbia', 'America/New_York'],
  FL: ['Florida', 'America/New_York'], GA: ['Georgia', 'America/New_York'], HI: ['Hawaii', 'Pacific/Honolulu'],
  ID: ['Idaho', 'America/Boise'], IL: ['Illinois', 'America/Chicago'], IN: ['Indiana', 'America/Indiana/Indianapolis'],
  IA: ['Iowa', 'America/Chicago'], KS: ['Kansas', 'America/Chicago'], KY: ['Kentucky', 'America/New_York'],
  LA: ['Louisiana', 'America/Chicago'], ME: ['Maine', 'America/New_York'], MD: ['Maryland', 'America/New_York'],
  MA: ['Massachusetts', 'America/New_York'], MI: ['Michigan', 'America/Detroit'], MN: ['Minnesota', 'America/Chicago'],
  MS: ['Mississippi', 'America/Chicago'], MO: ['Missouri', 'America/Chicago'], MT: ['Montana', 'America/Denver'],
  NE: ['Nebraska', 'America/Chicago'], NV: ['Nevada', 'America/Los_Angeles'], NH: ['New Hampshire', 'America/New_York'],
  NJ: ['New Jersey', 'America/New_York'], NM: ['New Mexico', 'America/Denver'], NY: ['New York', 'America/New_York'],
  NC: ['North Carolina', 'America/New_York'], ND: ['North Dakota', 'America/Chicago'], OH: ['Ohio', 'America/New_York'],
  OK: ['Oklahoma', 'America/Chicago'], OR: ['Oregon', 'America/Los_Angeles'], PA: ['Pennsylvania', 'America/New_York'],
  RI: ['Rhode Island', 'America/New_York'], SC: ['South Carolina', 'America/New_York'], SD: ['South Dakota', 'America/Chicago'],
  TN: ['Tennessee', 'America/Chicago'], TX: ['Texas', 'America/Chicago'], UT: ['Utah', 'America/Denver'],
  VT: ['Vermont', 'America/New_York'], VA: ['Virginia', 'America/New_York'], WA: ['Washington', 'America/Los_Angeles'],
  WV: ['West Virginia', 'America/New_York'], WI: ['Wisconsin', 'America/Chicago'], WY: ['Wyoming', 'America/Denver'],
};

const NAME_TO_CODE = Object.fromEntries(Object.entries(US_STATES).map(([code, [name]]) => [name.toLowerCase(), code]));

export function normalizeState(value) {
  if (!value) return '';
  const v = String(value).trim();
  if (US_STATES[v.toUpperCase()]) return v.toUpperCase();
  return NAME_TO_CODE[v.toLowerCase()] || '';
}

export function stateTimezone(state) {
  return US_STATES[state]?.[1] || 'America/New_York';
}

/** Devuelve { e164, display, digits } o null si no es un número de USA válido. */
export function normalizePhone(value) {
  if (!value) return null;
  const raw = String(value);
  const ext = raw.match(/(?:ext\.?|x|#)\s*(\d{1,6})\s*$/i)?.[1] || '';
  let digits = raw.replace(/(?:ext\.?|x|#)\s*\d{1,6}\s*$/i, '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // Códigos de área y centrales válidos en NANP empiezan entre 2 y 9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  if (/^(\d)\1{9}$/.test(digits) || digits.slice(3, 6) === '555' && digits.slice(6, 8) === '01') return null;
  const display = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${ext ? ` ext. ${ext}` : ''}`;
  return { e164: `+1${digits}`, display, digits, ext };
}

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const GENERIC_PREFIXES = ['info', 'contact', 'hello', 'office', 'admin', 'support', 'sales', 'team', 'frontdesk', 'reception', 'appointments', 'service', 'help', 'mail', 'inquiries', 'enquiries'];
const JUNK_DOMAINS = ['example.com', 'domain.com', 'email.com', 'sentry.io', 'wixpress.com', 'godaddy.com'];

export function normalizeEmail(value) {
  if (!value) return null;
  const email = String(value).trim().toLowerCase().replace(/^mailto:/, '').split('?')[0];
  if (!EMAIL_RE.test(email)) return null;
  const [local, domain] = email.split('@');
  if (JUNK_DOMAINS.includes(domain) || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(email)) return null;
  return { email, domain, generic: GENERIC_PREFIXES.includes(local.replace(/[^a-z]/g, '')) };
}

export function normalizeDomain(url) {
  if (!url) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function slug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(llc|inc|corp|co|ltd|pllc|pc|pa|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Hora local actual del lead y si está en horario laboral (lun–vie 8:00–18:00). */
export function localTimeInfo(state, now = new Date()) {
  const tz = stateTimezone(state);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24;
  const weekday = parts.weekday;
  const businessHours = !['Sat', 'Sun'].includes(weekday) && hour >= 8 && hour < 18;
  return { timezone: tz, hour, weekday, businessHours, label: `${weekday} ${String(hour).padStart(2, '0')}:${parts.minute}` };
}
