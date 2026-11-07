// Embudo de ventas: etapas, nivel de interés, cercanía al "sí", tareas sugeridas,
// ediciones manuales y migración de leads guardados con versiones anteriores.
// Todo es determinista y compartido por el servidor, la interfaz (vía API) y los tests.
import { normalizePhone, normalizeEmail, normalizeUrl, normalizeState, stateTimezone } from './normalize.mjs';
import { dedupeKeys, computeScore, STATUSES } from './leads.mjs';

/** Etapas del embudo: probabilidad base de cierre y grupo de lista. */
export const STAGES = {
  new: { label: 'Nuevo', prob: 5, group: 'todo' },
  attempted: { label: 'Intentado', prob: 8, group: 'trying' },
  callback: { label: 'Volver a llamar', prob: 15, group: 'trying' },
  contacted: { label: 'Interesado', prob: 30, group: 'interested' },
  meeting: { label: 'Reunión agendada', prob: 50, group: 'meeting' },
  proposal: { label: 'Propuesta enviada', prob: 70, group: 'proposal' },
  won: { label: 'Ganado', prob: 100, group: 'won' },
  lost: { label: 'Perdido', prob: 0, group: 'closed' },
  not_fit: { label: 'No califica', prob: 0, group: 'closed' },
  dnc: { label: 'No contactar', prob: 0, group: 'closed' },
};

/** Listas en las que se separan los leads (en orden del embudo). */
export const GROUPS = [
  { id: 'todo', label: 'Por contactar', statuses: ['new'] },
  { id: 'trying', label: 'En intento', statuses: ['attempted', 'callback'] },
  { id: 'interested', label: 'Interesados', statuses: ['contacted'] },
  { id: 'meeting', label: 'Reunión', statuses: ['meeting'] },
  { id: 'proposal', label: 'Propuesta', statuses: ['proposal'] },
  { id: 'won', label: 'Ganados', statuses: ['won'] },
  { id: 'closed', label: 'Cerrados sin venta', statuses: ['lost', 'not_fit', 'dnc'] },
];

/** Nivel de interés (aprobación) que asigna el vendedor después de hablar con el lead. */
export const INTEREST = [
  { level: 0, label: 'Sin evaluar' },
  { level: 1, label: 'Frío' },
  { level: 2, label: 'Tibio' },
  { level: 3, label: 'Interesado' },
  { level: 4, label: 'Caliente' },
  { level: 5, label: 'Listo para cerrar' },
];

/** Interés por defecto según la etapa, para leads que aún no tienen uno asignado. */
const DEFAULT_INTEREST = { contacted: 3, meeting: 4, proposal: 4, won: 5, lost: 1 };

export const PRIORITIES = ['high', 'medium', 'low'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const DAY = 86400e3;
const str = (v, max = 2000) => (v == null ? '' : String(v).trim().slice(0, max));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Completa campos que no existían en versiones anteriores. No borra ni cambia datos existentes:
 * así un trabajador que actualiza la herramienta conserva todos sus leads, notas y actividad.
 */
export function migrateLead(lead) {
  lead.notes ||= [];
  lead.activity ||= [];
  lead.tasks ||= [];
  lead.manualFields ||= [];
  lead.contacts ||= { phones: [], emails: [], decisionMakers: [] };
  lead.contacts.phones ||= [];
  lead.contacts.emails ||= [];
  lead.contacts.decisionMakers ||= [];
  for (const n of lead.notes) n.id ||= `N${new Date(n.at || Date.now()).getTime().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  if (lead.interest == null) lead.interest = DEFAULT_INTEREST[lead.status] || 0;
  if (!lead.statusChangedAt) {
    const last = [...lead.activity].reverse().find((a) => a.type === 'status');
    lead.statusChangedAt = last?.at || lead.createdAt || new Date().toISOString();
  }
  return lead;
}

/** Cercanía al "sí" (0–100): etapa del embudo + interés del vendedor + calidad del lead + inercia. */
export function closeness(lead, now = Date.now()) {
  if (lead.status === 'won') return 100;
  const stage = STAGES[lead.status] || STAGES.new;
  if (stage.prob === 0) return 0;
  const interestP = lead.interest > 0 ? lead.interest * 20 : stage.prob;
  let c = 0.6 * stage.prob + 0.4 * interestP + ((lead.score ?? 60) - 60) / 8;
  // Un seguimiento muy vencido o una oportunidad estancada enfría el lead.
  if (lead.nextActionAt && now - new Date(lead.nextActionAt).getTime() > 3 * DAY) c -= 5;
  if (['contacted', 'meeting', 'proposal'].includes(lead.status) && now - new Date(lead.statusChangedAt || now).getTime() > 21 * DAY) c -= 5;
  return Math.round(clamp(c, 1, 99));
}

/** Urgencia del seguimiento: overdue · today · soon (≤7 días) · later · none. */
export function followUpState(lead, now = new Date()) {
  if (!lead.nextActionAt) return 'none';
  const due = new Date(lead.nextActionAt);
  if (due <= now) return 'overdue';
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
  if (due <= endToday) return 'today';
  if (due - now <= 7 * DAY) return 'soon';
  return 'later';
}

const hasActivitySince = (lead, type, since) => lead.activity.some((a) => a.type === type && (!since || a.at >= since));
const who = (lead) => lead.contacts.decisionMakers[0]?.name || lead.business.name;

/**
 * Tareas del lead ordenadas por prioridad: las automáticas salen del estado del lead
 * (desaparecen solas cuando se cumplen) y las manuales las crea el vendedor.
 */
export function computeTasks(lead, now = new Date()) {
  const tasks = [];
  const add = (key, title, priority, extra = {}) => tasks.push({ id: `auto:${key}`, kind: 'auto', title, priority, ...extra });
  const s = lead.status;
  const open = ['new', 'attempted', 'callback', 'contacted', 'meeting', 'proposal'].includes(s);
  const fu = followUpState(lead, now);
  const phone = lead.contacts.phones[0];
  const email = lead.contacts.emails.find((e) => e.confidence !== 'pattern');

  if (open && fu === 'overdue') add('overdue', `Seguimiento vencido: contactar a ${who(lead)}`, 'high', { due: lead.nextActionAt });
  else if (open && fu === 'today') add('today', `Seguimiento de hoy con ${who(lead)}`, 'high', { due: lead.nextActionAt });

  if (s === 'new') {
    if (phone) add('first-call', `Primera llamada a ${who(lead)}`, lead.tier === 'A' ? 'high' : 'medium');
    else add('find-phone', 'Conseguir un teléfono de contacto', 'high');
  }
  if (s === 'attempted' && lead.contacts.emails.length && !hasActivitySince(lead, 'email', lead.statusChangedAt)) {
    add('send-email', 'Enviar el correo preparado después del intento de llamada', 'medium');
  }
  if (s === 'callback' && fu === 'none') add('schedule-callback', 'Agendar la fecha para volver a llamar', 'high');
  if (s === 'contacted') add('book-meeting', 'Enviar información y agendar la reunión', 'high');
  if (s === 'meeting') {
    if (fu === 'soon' || fu === 'today') add('prep-meeting', 'Preparar la reunión (usa "Preparar con IA")', 'high', { due: lead.nextActionAt });
    if (fu === 'overdue' || fu === 'none') add('meeting-outcome', 'Registrar el resultado de la reunión y enviar la propuesta', 'high');
  }
  if (s === 'proposal' && now - new Date(lead.statusChangedAt || now).getTime() > 3 * DAY) add('proposal-follow', 'Hacer seguimiento a la propuesta', 'high');
  if (s === 'won') add('kickoff', 'Coordinar el inicio del proyecto y pedir un referido', 'low');

  if (open && !['won'].includes(s)) {
    if (!lead.contacts.decisionMakers.length) add('find-dm', 'Identificar al decisor (nombre y cargo)', s === 'new' ? 'low' : 'medium');
    if (!email) add('find-email', 'Conseguir o confirmar un correo verificado', 'low');
  }

  for (const t of lead.tasks || []) {
    if (t.done) continue;
    tasks.push({ id: t.id, kind: 'manual', title: t.title, priority: t.priority, due: t.due || null, createdBy: t.by });
  }
  return tasks.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity));
}

/** Datos derivados que la interfaz necesita para ordenar y colorear. */
export function decorate(lead, now = new Date()) {
  migrateLead(lead);
  const tasks = computeTasks(lead, now);
  const notes = [...lead.notes].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.at).localeCompare(String(a.at)));
  return {
    ...lead,
    closeness: closeness(lead, now.getTime()),
    followUp: followUpState(lead, now),
    tasksOpen: tasks,
    topPriority: tasks[0]?.priority || null,
    lastNote: notes[0] || null,
  };
}

// ---------------------------------------------------------------------------------------------
// Ediciones manuales
// ---------------------------------------------------------------------------------------------

const EDITABLE_BUSINESS = ['name', 'category', 'website', 'address', 'city', 'state', 'zip', 'googleMapsUrl', 'employees', 'locations', 'description', 'instagram', 'facebook', 'linkedin'];

export class EditError extends Error {}

function rescore(lead, config) {
  lead.dedupeKeys = dedupeKeys(lead);
  if (config) Object.assign(lead, computeScore(lead, config));
}

/**
 * Aplica una edición hecha por el vendedor. Devuelve el lead modificado.
 * `body` admite: status, outcome, interest, note, pinNote, deleteNote, nextActionAt, logCall, logEmail, starred,
 * business{}, addPhone{}, addEmail{}, addPerson{}, updatePerson{}, removeContact{}, addTask{}, completeTask, reopenTask, deleteTask.
 */
export function applyLeadUpdate(lead, body, { by = '', byName = '', config = null, now = new Date() } = {}) {
  migrateLead(lead);
  const at = now.toISOString();
  const log = (type, text) => lead.activity.push({ at, type, by, text });
  let touchedContacts = false;

  if (body.status && body.status !== lead.status) {
    if (!STATUSES.includes(body.status)) throw new EditError('Estado inválido');
    log('status', `${lead.status} → ${body.status}${body.outcome ? ` · ${body.outcome}` : ''}`);
    lead.status = body.status;
    lead.statusChangedAt = at;
    // Al avanzar de etapa, el interés nunca queda por debajo del mínimo razonable para esa etapa.
    const min = DEFAULT_INTEREST[body.status];
    if (min && body.interest == null && (lead.interest || 0) < min && body.status !== 'lost') lead.interest = min;
    if (['lost', 'not_fit', 'dnc', 'won'].includes(body.status)) lead.nextActionAt = null;
  }
  if (body.interest != null) {
    const lvl = Number(body.interest);
    if (!Number.isInteger(lvl) || lvl < 0 || lvl > 5) throw new EditError('Nivel de interés inválido (0–5)');
    if (lvl !== lead.interest) log('interest', `Interés: ${INTEREST[lvl].label}`);
    lead.interest = lvl;
  }
  if (body.note) {
    const note = { id: newId('N'), at, by: byName || by, text: str(body.note, 4000), pinned: !!body.pinned };
    lead.notes.push(note);
    log('note', note.text.slice(0, 140));
  }
  if (body.pinNote) {
    const n = lead.notes.find((x) => x.id === body.pinNote.id);
    if (!n) throw new EditError('Nota no encontrada');
    n.pinned = !!body.pinNote.pinned;
  }
  if (body.deleteNote) {
    const i = lead.notes.findIndex((x) => x.id === body.deleteNote);
    if (i < 0) throw new EditError('Nota no encontrada');
    lead.notes.splice(i, 1);
  }
  if ('nextActionAt' in body) {
    const v = body.nextActionAt ? new Date(body.nextActionAt) : null;
    if (v && Number.isNaN(v.getTime())) throw new EditError('Fecha inválida');
    lead.nextActionAt = v ? v.toISOString() : null;
    if (v) log('schedule', `Próxima acción: ${lead.nextActionAt}`);
  }
  if (body.logCall) log('call', str(body.logCall, 300));
  if (body.logEmail) log('email', str(body.logEmail, 300));
  if (body.starred !== undefined) lead.starred = !!body.starred;

  if (body.business) {
    const changed = [];
    for (const [k, raw] of Object.entries(body.business)) {
      if (!EDITABLE_BUSINESS.includes(k)) continue;
      let v = str(raw, k === 'description' ? 1500 : 300);
      if (['website', 'googleMapsUrl'].includes(k)) v = normalizeUrl(v);
      if (k === 'state') {
        v = normalizeState(v);
        if (!v) throw new EditError('Estado de USA inválido (usa el código de 2 letras, ej. TX)');
        lead.business.timezone = stateTimezone(v);
      }
      if (k === 'locations') v = v === '' ? null : Number(v) || null;
      if (k === 'name' && !v) throw new EditError('El nombre del negocio no puede quedar vacío');
      if (['instagram', 'facebook', 'linkedin'].includes(k)) {
        lead.business.socials = { ...(lead.business.socials || {}), [k]: normalizeUrl(v) };
      } else lead.business[k] = v;
      changed.push(k);
      if (!lead.manualFields.includes(k)) lead.manualFields.push(k);
    }
    if (changed.length) { log('edit', `Datos editados: ${changed.join(', ')}`); touchedContacts = true; }
  }
  if (body.addPhone) {
    const n = normalizePhone(body.addPhone.number);
    if (!n) throw new EditError('Teléfono inválido: usa un número de USA de 10 dígitos');
    if (lead.contacts.phones.some((p) => p.number === n.e164)) throw new EditError('Ese teléfono ya está registrado');
    lead.contacts.phones.unshift({
      number: n.e164, display: n.display, ext: n.ext || undefined,
      label: ['main', 'direct', 'mobile', 'office', 'tollfree', 'other'].includes(body.addPhone.label) ? body.addPhone.label : 'direct',
      person: str(body.addPhone.person, 120), source: str(body.addPhone.source, 300) || 'manual', manual: true, addedBy: byName || by, addedAt: at,
    });
    log('edit', `Teléfono agregado: ${n.display}`);
    touchedContacts = true;
  }
  if (body.addEmail) {
    const e = normalizeEmail(body.addEmail.email);
    if (!e) throw new EditError('Correo inválido');
    if (lead.contacts.emails.some((x) => x.email === e.email)) throw new EditError('Ese correo ya está registrado');
    lead.contacts.emails.unshift({
      email: e.email, generic: e.generic, confidence: 'verified', person: str(body.addEmail.person, 120),
      source: str(body.addEmail.source, 300) || 'manual', manual: true, addedBy: byName || by, addedAt: at,
    });
    log('edit', `Correo agregado: ${e.email}`);
    touchedContacts = true;
  }
  if (body.addPerson || body.updatePerson) {
    const p = body.addPerson || body.updatePerson;
    const name = str(p.name, 120);
    if (!name) throw new EditError('Falta el nombre de la persona');
    const phone = p.phone ? normalizePhone(p.phone) : null;
    if (p.phone && !phone) throw new EditError('Teléfono de la persona inválido');
    const email = p.email ? normalizeEmail(p.email) : null;
    if (p.email && !email) throw new EditError('Correo de la persona inválido');
    const person = {
      name, title: str(p.title, 120), linkedin: normalizeUrl(p.linkedin), phone: phone?.e164 || '', email: email?.email || '',
      notes: str(p.notes, 1000), source: str(p.source, 300) || 'manual', manual: true, addedBy: byName || by, addedAt: at,
    };
    if (body.updatePerson) {
      const i = lead.contacts.decisionMakers.findIndex((d) => d.name === body.updatePerson.originalName);
      if (i < 0) throw new EditError('Persona no encontrada');
      lead.contacts.decisionMakers[i] = { ...lead.contacts.decisionMakers[i], ...person, source: lead.contacts.decisionMakers[i].source || person.source };
      log('edit', `Persona actualizada: ${name}`);
    } else {
      if (lead.contacts.decisionMakers.some((d) => d.name.toLowerCase() === name.toLowerCase())) throw new EditError('Esa persona ya está registrada');
      // La persona marcada como decisora pasa a ser el contacto principal.
      if (p.primary) lead.contacts.decisionMakers.unshift(person); else lead.contacts.decisionMakers.push(person);
      log('edit', `Persona agregada: ${name}${person.title ? ` (${person.title})` : ''}`);
    }
    touchedContacts = true;
  }
  if (body.removeContact) {
    const { kind, key } = body.removeContact;
    const list = { phone: 'phones', email: 'emails', person: 'decisionMakers' }[kind];
    const field = { phone: 'number', email: 'email', person: 'name' }[kind];
    if (!list) throw new EditError('Tipo de contacto inválido');
    const i = lead.contacts[list].findIndex((x) => x[field] === key);
    if (i < 0) throw new EditError('Contacto no encontrado');
    lead.contacts[list].splice(i, 1);
    log('edit', `Contacto eliminado: ${key}`);
    touchedContacts = true;
  }

  if (body.addTask) {
    const title = str(body.addTask.title, 200);
    if (!title) throw new EditError('Escribe la tarea');
    const priority = PRIORITIES.includes(body.addTask.priority) ? body.addTask.priority : 'medium';
    const due = body.addTask.due ? new Date(body.addTask.due) : null;
    if (due && Number.isNaN(due.getTime())) throw new EditError('Fecha de la tarea inválida');
    lead.tasks.push({ id: newId('T'), title, priority, due: due ? due.toISOString() : null, done: false, by: byName || by, createdAt: at });
    log('task', `Tarea: ${title}`);
  }
  for (const [key, done] of [['completeTask', true], ['reopenTask', false]]) {
    if (!body[key]) continue;
    const t = lead.tasks.find((x) => x.id === body[key]);
    if (!t) throw new EditError('Tarea no encontrada');
    t.done = done;
    t.doneAt = done ? at : null;
    if (done) log('task', `Tarea completada: ${t.title}`);
  }
  if (body.deleteTask) lead.tasks = lead.tasks.filter((t) => t.id !== body.deleteTask);

  if (touchedContacts) rescore(lead, config);
  lead.updatedAt = at;
  return lead;
}
