// Utilidades compartidas de la interfaz: estado, API, sistema de colores, iconos y helpers de render.

export const state = {
  config: null,
  settings: null,
  statuses: [],
  insights: null,
  leads: [],
  runs: [],
  system: null,
  pipeline: null,
};

// ---------- Sistema de colores (una sola fuente de verdad; la leyenda se genera desde aquí) ----------

/** Etapas del embudo. */
export const STATUS = {
  new: 'Nuevo',
  attempted: 'Intentado',
  callback: 'Volver a llamar',
  contacted: 'Interesado',
  meeting: 'Reunión agendada',
  proposal: 'Propuesta enviada',
  won: 'Ganado',
  lost: 'Perdido',
  not_fit: 'No califica',
  dnc: 'No contactar',
};
export const STATUS_COLOR = {
  new: '#5cb8ff', attempted: '#ffb547', callback: '#ff9447', contacted: '#b18cff', meeting: '#d7ff1f',
  proposal: '#2dd4bf', won: '#3ddc84', lost: '#6b7280', not_fit: '#4b5563', dnc: '#ff5d5d',
};
export const STATUS_HINT = {
  new: 'Encontrado por la IA, aún sin contactar.',
  attempted: 'Se llamó pero no se habló con nadie.',
  callback: 'Pidieron que volvamos a llamar.',
  contacted: 'Hubo conversación y mostró interés.',
  meeting: 'Tiene reunión agendada.',
  proposal: 'Se envió propuesta; esperando respuesta.',
  won: 'Cerrado: es cliente.',
  lost: 'No interesado.',
  not_fit: 'No encaja con lo que vendemos.',
  dnc: 'Pidió no ser contactado nunca más.',
};

/** Listas en las que se separan los leads (mismo orden que el embudo). */
export const GROUPS = [
  { id: 'todo', label: 'Por contactar', statuses: ['new'], color: STATUS_COLOR.new },
  { id: 'trying', label: 'En intento', statuses: ['attempted', 'callback'], color: STATUS_COLOR.attempted },
  { id: 'interested', label: 'Interesados', statuses: ['contacted'], color: STATUS_COLOR.contacted },
  { id: 'meeting', label: 'Reunión', statuses: ['meeting'], color: STATUS_COLOR.meeting },
  { id: 'proposal', label: 'Propuesta', statuses: ['proposal'], color: STATUS_COLOR.proposal },
  { id: 'won', label: 'Ganados', statuses: ['won'], color: STATUS_COLOR.won },
  { id: 'closed', label: 'Cerrados sin venta', statuses: ['lost', 'not_fit', 'dnc'], color: STATUS_COLOR.lost },
];
export const groupOf = (status) => GROUPS.find((g) => g.statuses.includes(status)) || GROUPS[0];

/** Escala de "temperatura": se usa para el interés del lead y para la cercanía al sí. */
export const INTEREST = [
  { level: 0, label: 'Sin evaluar', color: '#4b5563', hint: 'Aún no has hablado con el decisor.' },
  { level: 1, label: 'Frío', color: '#60a5fa', hint: 'Escuchó, pero no muestra interés.' },
  { level: 2, label: 'Tibio', color: '#2dd4bf', hint: 'Le interesa el tema, pero no ahora.' },
  { level: 3, label: 'Interesado', color: '#facc15', hint: 'Quiere más información.' },
  { level: 4, label: 'Caliente', color: '#fb923c', hint: 'Tiene el dolor claro y quiere avanzar.' },
  { level: 5, label: 'Listo para cerrar', color: '#3ddc84', hint: 'Solo faltan detalles para firmar.' },
];
export const closenessColor = (c) => (c >= 80 ? '#3ddc84' : c >= 60 ? '#fb923c' : c >= 40 ? '#facc15' : c >= 20 ? '#2dd4bf' : '#60a5fa');

export const PRIORITY = {
  high: { label: 'Alta', color: '#ff5d5d' },
  medium: { label: 'Media', color: '#ffb547' },
  low: { label: 'Baja', color: '#8b939c' },
};
export const FOLLOWUP = {
  overdue: { label: 'Vencido', color: '#ff5d5d' },
  today: { label: 'Hoy', color: '#ffb547' },
  soon: { label: 'Próximo', color: '#5cb8ff' },
  later: { label: 'Programado', color: '#8b939c' },
};

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
export const plural = (n, word, pl) => `${n} ${n === 1 ? word : pl || `${word}s`}`;

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

/** "hoy 15:00", "mañana 09:00", "hace 2 d", "vie 14 nov 10:00". */
export function whenLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400e3);
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `mañana ${time}`;
  if (diff === -1) return `ayer ${time}`;
  if (diff < -1) return `hace ${-diff} d`;
  return d.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
export const tierBadge = (l) => `<span class="tier tier-${esc(l.tier)}" title="Tier ${esc(l.tier)}: calidad del lead · ${l.score}/100">${esc(l.tier)}</span>`;
export const statusPill = (s) => `<span class="st" style="--c:${STATUS_COLOR[s] || '#8b939c'}" title="${attr(STATUS_HINT[s] || '')}">${esc(STATUS[s] || s)}</span>`;
export const stars = (n = 0) => `<span class="stars" title="Prioridad ${n}/5">${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, 5 - n))}</span></span>`;

export function localPill(lead) {
  const li = localInfo(lead.business.timezone);
  return `<span class="small ${li.open ? 'open-now' : 'closed-now'}" title="Hora local del negocio${li.open ? ' (abierto)' : ' (fuera de horario)'}"><span class="dot" style="background:currentColor"></span> ${esc(li.label)}</span>`;
}

/** Barra de cercanía al "sí" con el color de la escala de temperatura. */
export function closenessMeter(lead, { compact = false } = {}) {
  const c = lead.closeness ?? 0;
  const color = closenessColor(c);
  return `<span class="meter ${compact ? 'compact' : ''}" title="Cercanía al sí: ${c}% (etapa + interés + calidad del lead)"><span class="meter-track"><span class="meter-fill" style="width:${c}%;background:${color}"></span></span><b style="color:${color}">${c}%</b></span>`;
}

export function interestPill(level = 0) {
  const it = INTEREST[level] || INTEREST[0];
  return `<span class="pill-dot" style="--c:${it.color}" title="Interés: ${attr(it.label)} — ${attr(it.hint)}"><i></i>${esc(it.label)}</span>`;
}

export function priorityChip(p) {
  const pr = PRIORITY[p] || PRIORITY.low;
  return `<span class="prio" style="--c:${pr.color}" title="Prioridad ${attr(pr.label)}">${esc(pr.label)}</span>`;
}

export function followUpChip(lead) {
  if (!lead.nextActionAt || !FOLLOWUP[lead.followUp]) return '';
  const f = FOLLOWUP[lead.followUp];
  return `<span class="fu" style="--c:${f.color}" title="Seguimiento ${attr(f.label.toLowerCase())}">${icon('clock')} ${esc(whenLabel(lead.nextActionAt))}</span>`;
}

export function notePreview(lead, max = 110) {
  const n = lead.lastNote;
  if (!n) return '';
  const text = n.text.length > max ? `${n.text.slice(0, max)}…` : n.text;
  return `<div class="note-peek${n.pinned ? ' pinned' : ''}" title="${attr(`${n.by || ''} · ${fmtDateTime(n.at)}\n${n.text}`)}">${icon(n.pinned ? 'pin' : 'note')}<span>${esc(text)}</span></div>`;
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
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4M8 9h8M8 13h5"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>',
  checklist: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  palette: '<circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="7" r="1.5"/><circle cx="16" cy="10" r="1.5"/><path d="M12 22a3 3 0 0 1 0-6h2a2 2 0 0 0 0-4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.tool}</svg>`;

// ---------- Toast / modal / portapapeles ----------
export function toast(msg, isError = false, { action, onAction, sticky = false, duration } = {}) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn sm">${esc(action)}</button>` : ''}${sticky ? '<button class="btn sm ghost" aria-label="Cerrar">✕</button>' : ''}`;
  if (action) el.querySelector('.btn').addEventListener('click', () => { onAction?.(); el.remove(); });
  if (sticky) el.querySelector('.ghost').addEventListener('click', () => el.remove());
  document.getElementById('toasts').appendChild(el);
  if (!sticky) setTimeout(() => el.remove(), duration || (isError ? 7000 : 3200));
}

export async function copy(text, label = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} ✓`);
  } catch {
    toast('No se pudo copiar', true);
  }
}

export function modal(html, onMount, { wide = false } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-backdrop')) close(); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  onMount?.(root.querySelector('.modal'), close);
  return close;
}

/** Leyenda del sistema de colores, para que todo el equipo lea igual cada color. */
export function colorLegend() {
  const row = (color, label, hint) => `<div class="legend-row"><span class="swatch" style="background:${color}"></span><div><b>${esc(label)}</b>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}</div></div>`;
  modal(`
    <h2>Guía de colores</h2>
    <div class="grid g2" style="gap:22px">
      <div>
        <div class="section-title">Etapa del embudo</div>
        ${Object.keys(STATUS).map((s) => row(STATUS_COLOR[s], STATUS[s], STATUS_HINT[s])).join('')}
      </div>
      <div>
        <div class="section-title">Interés del lead (lo asignas tú) y cercanía al sí</div>
        ${INTEREST.map((i) => row(i.color, `${i.level ? `${i.level} · ` : ''}${i.label}`, i.hint)).join('')}
        <p class="small muted">La <b>cercanía al sí</b> (0–100%) combina la etapa, tu nivel de interés y la calidad del lead, y usa la misma escala: azul = lejos, verde = a punto de cerrar.</p>
        <div class="section-title">Seguimientos</div>
        ${Object.values(FOLLOWUP).map((f) => row(f.color, f.label)).join('')}
        <div class="section-title">Prioridad de tareas</div>
        ${Object.values(PRIORITY).map((p) => row(p.color, p.label)).join('')}
        <div class="section-title">Calidad del lead (tier)</div>
        ${row('#d7ff1f', 'Tier A', 'Puntaje ≥ 75: mejor encaje, necesidad y contactabilidad.')}
        ${row('#4d5c00', 'Tier B', 'Puntaje 55–74.')}
        ${row('#2d333b', 'Tier C', 'Puntaje < 55.')}
      </div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" data-close>Entendido</button></div>`, null, { wide: true });
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

/** Prioridad de la cola de llamadas: seguimientos vencidos, cercanía al sí, calidad y si están abiertos ahora. */
export function queueRank(lead) {
  const li = localInfo(lead.business.timezone);
  const fu = lead.followUp === 'overdue' ? 40 : lead.followUp === 'today' ? 25 : 0;
  const attempts = (lead.activity || []).filter((a) => a.type === 'call').length;
  return lead.score * 0.6 + (lead.closeness || 0) * 0.6 + fu + (li.open ? 15 : 0) + (lead.starred ? 10 : 0) - attempts * 4 + (lead.contacts.phones.length ? 0 : -40);
}

/** Entra a la cola: leads sin contactar o en intento sin cita futura, y cualquier lead activo con seguimiento vencido u hoy. */
export function isQueueable(lead) {
  if (!ACTIVE_STATUSES.includes(lead.status)) return false;
  if (['overdue', 'today'].includes(lead.followUp)) return true;
  if (!['new', 'attempted', 'callback'].includes(lead.status)) return false;
  return !lead.nextActionAt || new Date(lead.nextActionAt) <= new Date();
}

/** Seguimientos y tareas con fecha agrupados por urgencia, para la agenda y los recordatorios. */
export function agendaItems() {
  const items = [];
  for (const l of state.leads) {
    if (!ACTIVE_STATUSES.includes(l.status)) continue;
    for (const t of l.tasksOpen || []) items.push({ lead: l, task: t });
  }
  return items;
}

// ---------- Eliminar leads (con confirmación y "Deshacer") ----------
/**
 * Pregunta antes de eliminar uno o varios leads. Al terminar ofrece "Deshacer" durante unos segundos.
 * @param {object[]} leads  leads a eliminar
 * @param {Function} onDone  se llama después de eliminar o de deshacer (para repintar la pantalla)
 */
export function confirmDeleteLeads(leads, onDone) {
  if (!leads.length) return;
  const one = leads.length === 1;
  const names = leads.slice(0, 5).map((l) => `<li>${esc(l.business.name)} <span class="dim">· ${esc(l.business.city)}, ${esc(l.business.state)}</span></li>`).join('');
  const hasWork = leads.some((l) => l.notes?.length || ['meeting', 'proposal', 'won'].includes(l.status));
  modal(`
    <h2>${one ? 'Eliminar este lead' : `Eliminar ${leads.length} leads`}</h2>
    <ul class="list small" style="margin:6px 0 10px">${names}${leads.length > 5 ? `<li class="dim">…y ${leads.length - 5} más</li>` : ''}</ul>
    ${hasWork ? `<div class="callout warn small">${one ? 'Este lead tiene notas o está avanzado' : 'Algunos tienen notas o están avanzados'} en el embudo (reunión, propuesta o ganado). Se eliminará${one ? '' : 'n'} con todo su historial.</div>` : ''}
    <label class="check" style="margin:12px 0 4px"><input type="checkbox" id="del-forget" checked /> No volver a proponer ${one ? 'este negocio' : 'estos negocios'} en futuras búsquedas</label>
    <p class="small muted" style="margin:0">Podrás deshacerlo unos segundos después. Además se guarda una copia de seguridad en <span class="mono">workspace/backups/</span>.</p>
    <div class="row" style="justify-content:flex-end;margin-top:16px;gap:8px">
      <button class="btn ghost" data-close>Cancelar</button>
      <button class="btn danger" id="del-ok">${icon('trash')} Eliminar</button>
    </div>`, (m, close) => {
    m.querySelector('#del-ok').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const forget = m.querySelector('#del-forget').checked;
        const res = await api('/api/leads/delete', { method: 'POST', body: { ids: leads.map((l) => l.id), forget } });
        const gone = new Set(leads.map((l) => l.id));
        state.leads = state.leads.filter((l) => !gone.has(l.id));
        close();
        onDone?.();
        window.dispatchEvent(new Event('leads-changed'));
        toast(`${res.count} lead${res.count === 1 ? '' : 's'} eliminado${res.count === 1 ? '' : 's'}`, false, {
          action: 'Deshacer', sticky: false, duration: 9000,
          onAction: async () => {
            try {
              const back = await api('/api/leads/restore', { method: 'POST', body: { leads: res.removed } });
              state.leads.push(...back.leads);
              toast('Leads restaurados');
              onDone?.();
              window.dispatchEvent(new Event('leads-changed'));
            } catch (err) { toast(err.message, true); }
          },
        });
      } catch (err) { e.target.disabled = false; toast(err.message, true); }
    });
  });
}
