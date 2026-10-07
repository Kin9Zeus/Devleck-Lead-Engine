// Utilidades compartidas de la interfaz: estado, API, iconos y helpers de render.

export const state = {
  config: null,
  settings: null,
  statuses: [],
  insights: null,
  leads: [],
  runs: [],
  system: null,
};

export const STATUS = {
  new: 'Nuevo',
  attempted: 'Intentado',
  callback: 'Volver a llamar',
  contacted: 'Contactado',
  meeting: 'Reunión agendada',
  proposal: 'Propuesta enviada',
  won: 'Ganado',
  lost: 'Perdido',
  not_fit: 'No califica',
  dnc: 'No contactar',
};
export const STATUS_COLOR = {
  new: '#5cb8ff', attempted: '#ffb547', callback: '#ffcf85', contacted: '#b18cff', meeting: '#d7ff1f',
  proposal: '#b8e000', won: '#3ddc84', lost: '#3a4048', not_fit: '#2d333b', dnc: '#ff5d5d',
};
export const OPEN_STATUSES = ['new', 'attempted', 'callback'];
export const ACTIVE_STATUSES = ['new', 'attempted', 'callback', 'contacted', 'meeting', 'proposal'];

export const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ---------- API ----------
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ---------- Escape / formato ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;
export const money = (n) => (n == null ? '' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
export const dealRange = (d) => (d?.min || d?.max ? [money(d.min), money(d.max)].filter(Boolean).join(' – ') : '—');
export const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString('es');
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Hora local del lead y si está en horario laboral (lun–vie 8–18). */
export function localInfo(tz) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour) % 24;
    const open = !['Sat', 'Sun'].includes(parts.weekday) && hour >= 8 && hour < 18;
    const days = { Mon: 'lun', Tue: 'mar', Wed: 'mié', Thu: 'jue', Fri: 'vie', Sat: 'sáb', Sun: 'dom' };
    return { open, hour, label: `${days[parts.weekday] || parts.weekday} ${String(hour).padStart(2, '0')}:${parts.minute}` };
  } catch {
    return { open: false, hour: 0, label: '' };
  }
}

/** Sustituye los marcadores {repName}, {repEmail}, {repPhone} con el perfil del trabajador. */
export function fill(text) {
  const s = state.settings || {};
  return String(text || '')
    .replace(/\{repName\}/g, s.repName || '[tu nombre]')
    .replace(/\{repEmail\}/g, s.repEmail || '[tu correo]')
    .replace(/\{repPhone\}/g, s.repPhone || '[tu teléfono]');
}

export const serviceById = (id) => (state.config?.services?.items || []).find((s) => s.id === id);
export const nicheById = (id) => (state.config?.niches?.items || []).find((n) => n.id === id);
export const nicheName = (id) => nicheById(id)?.name || id || '—';
export const serviceName = (id) => serviceById(id)?.name || id || '—';

// ---------- Componentes ----------
export const tierBadge = (l) => `<span class="tier tier-${esc(l.tier)}" title="Tier ${esc(l.tier)} · ${l.score}/100">${esc(l.tier)}</span>`;
export const statusPill = (s) => `<span class="st st-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
export const stars = (n = 0) => `<span class="stars" title="Prioridad ${n}/5">${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, 5 - n))}</span></span>`;
export function localPill(lead) {
  const li = localInfo(lead.business.timezone);
  return `<span class="small ${li.open ? 'open-now' : 'closed-now'}" title="Hora local del negocio"><span class="dot" style="background:currentColor"></span> ${esc(li.label)}</span>`;
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  sparkles: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3v4M21 5h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.tool}</svg>`;

// ---------- Toast / modal / portapapeles ----------
export function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' err' : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), isError ? 7000 : 3200);
}

export async function copy(text, label = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} ✓`);
  } catch {
    toast('No se pudo copiar', true);
  }
}

export function modal(html, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-backdrop')) close(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  onMount?.(root.querySelector('.modal'), close);
  return close;
}

export function download(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Construye un enlace mailto con asunto y cuerpo ya personalizados. */
export function mailto(to, subject, body) {
  return `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(fill(subject))}&body=${encodeURIComponent(fill(body))}`;
}

export async function refreshLeads() {
  const data = await api('/api/leads');
  state.leads = data.leads;
  return state.leads;
}

export function leadById(id) {
  return state.leads.find((l) => l.id === id);
}

/** Prioridad de la cola de llamadas: puntaje + abierto ahora + callbacks vencidos. */
export function queueRank(lead) {
  const li = localInfo(lead.business.timezone);
  const due = lead.nextActionAt && new Date(lead.nextActionAt) <= new Date();
  const attempts = (lead.activity || []).filter((a) => a.type === 'call').length;
  return lead.score + (li.open ? 15 : 0) + (due ? 30 : 0) + (lead.starred ? 10 : 0) - attempts * 4 + (lead.contacts.phones.length ? 0 : -40);
}

export function isQueueable(lead) {
  if (!OPEN_STATUSES.includes(lead.status)) return false;
  if (lead.nextActionAt && new Date(lead.nextActionAt) > new Date()) return false;
  return true;
}
