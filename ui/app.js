// Devleck Lead Engine — interfaz principal (SPA sin dependencias, rutas por hash).
import {
  state, STATUS, STATUS_COLOR, GROUPS, groupOf, INTEREST, PRIORITY, FOLLOWUP, ACTIVE_STATUSES, US_STATES, api, esc, attr, icon, tierBadge,
  statusPill, localPill, stars, toast, copy, modal, download, refreshLeads, timeAgo, fmtDateTime, whenLabel, nicheName, serviceName,
  nicheById, queueRank, isQueueable, localInfo, initials, dealRange, fill, plural, closenessMeter, closenessColor, interestPill,
  priorityChip, followUpChip, notePreview, colorLegend, agendaItems, leadById, confirmDeleteLeads,
} from './lib.js';
import { openLead, closeLead } from './drawer.js';

const view = document.getElementById('view');
const ui = {
  leads: { sel: new Set(), group: 'active', q: '', tier: '', niche: '', state: '', service: '', interest: '', sort: 'closeness', dir: -1 },
  queue: { openOnly: false, niche: '' },
  pipeline: { q: '', niche: '', showClosed: false },
  prospectDraft: null,
};
let activeStream = null;
let pollTimer = null;

const overdueCount = () => state.leads.filter((l) => ACTIVE_STATUSES.includes(l.status) && l.followUp === 'overdue').length;
const todayCount = () => state.leads.filter((l) => ACTIVE_STATUSES.includes(l.status) && l.followUp === 'today').length;

// ---------- Navegación ----------
const NAV = [
  ['#/', 'home', 'Panel'],
  ['#/agenda', 'calendar', 'Agenda', () => ({ n: overdueCount() + todayCount(), alert: overdueCount() > 0 })],
  ['#/queue', 'phone', 'Cola de llamadas', () => ({ n: state.leads.filter(isQueueable).length })],
  ['#/pipeline', 'kanban', 'Embudo'],
  ['#/leads', 'users', 'Leads', () => ({ n: state.leads.length })],
  'sep',
  ['#/prospect', 'radar', 'Prospectar'],
  ['#/niches', 'trend', 'Nichos'],
  ['#/runs', 'activity', 'Búsquedas', () => ({ n: state.runs.filter((r) => r.status === 'running').length })],
  'sep',
  ['#/catalog', 'box', 'Catálogo'],
  ['#/settings', 'settings', 'Configuración'],
];

// Preferencias de interfaz por navegador (si el almacenamiento no está disponible, se usan los valores por defecto).
function getPref(key, fallback) {
  try { const v = localStorage.getItem(`devleck.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem(`devleck.${key}`, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
window.addEventListener('leads-changed', () => renderNav());

function renderNav() {
  const hash = location.hash.split('/').slice(0, 2).join('/') || '#/';
  document.getElementById('nav').innerHTML = NAV.map((n) => {
    if (n === 'sep') return '<div class="nav-sep"></div>';
    const [href, ic, label, count] = n;
    const active = hash === href || (href !== '#/' && hash.startsWith(href));
    const c = count?.();
    return `<a class="nav-link ${active ? 'active' : ''}" href="${href}">${icon(ic)} ${label}${c?.n ? `<span class="count${c.alert ? ' alert' : ''}">${c.n}</span>` : ''}</a>`;
  }).join('');
  const s = state.settings || {};
  document.getElementById('sidebar-foot').innerHTML = `
    ${s.workerId ? `<div class="me"><span class="avatar">${esc(initials(s.repName || s.workerId))}</span><div><div>${esc(s.repName || s.workerId)}</div><div class="dim small">${s.isAdmin ? 'Administrador' : 'Ventas'}</div></div></div>` : '<a href="#/settings" class="btn sm primary">Configura tu perfil</a>'}
    ${state.system?.git?.behind ? `<a href="#/settings" class="btn sm" style="border-color:var(--lime);color:var(--lime)">${icon('download')} Actualización disponible</a>` : ''}
    <button class="btn sm ghost" id="legend-btn" style="justify-content:flex-start">${icon('palette')} Guía de colores</button>
    <div>v${esc(state.system?.version || '')}</div>`;
  document.getElementById('legend-btn').addEventListener('click', colorLegend);
  const due = overdueCount();
  document.title = `${due ? `(${due}) ` : ''}Devleck Lead Engine`;
}

async function route() {
  if (activeStream) { activeStream.close(); activeStream = null; }
  clearInterval(pollTimer);
  const [, page = '', arg, sub] = location.hash.replace(/^#/, '').split('/');
  renderNav();
  const pages = { '': dashboard, agenda, queue, pipeline: pipelinePage, leads: leadsPage, prospect, niches: nichesPage, runs: runsPage, catalog, settings: settingsPage };
  const fn = pages[page] || dashboard;
  try {
    await fn(arg, sub);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="callout err">${esc(err.message)}</div>`;
  }
  view.focus({ preventScroll: true });
}

const head = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const kpi = (label, value, hint, accent, color) => `<div class="card kpi ${accent ? 'accent' : ''}" ${color ? `style="--kc:${color}"` : ''}><div class="label">${label}</div><div class="value" ${color ? 'style="color:var(--kc)"' : ''}>${value}</div><div class="hint">${hint}</div></div>`;
const growthLabel = (g) => ({ high: 'alto', medium: 'medio', low: 'bajo' }[g] || g || '—');

function countBy(list, fn) {
  const m = new Map();
  for (const x of list) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function hbars(entries, nameFn) {
  if (!entries.length) return '<p class="muted small">—</p>';
  const max = entries[0][1];
  return entries.map(([k, n]) => `<div class="hbar"><span class="truncate small" title="${attr(nameFn(k))}">${esc(nameFn(k))}</span><div class="track" style="height:7px;background:var(--panel-2);border-radius:9px"><div style="height:100%;width:${(n / max) * 100}%;background:var(--lime);border-radius:9px"></div></div><span class="mono small">${n}</span></div>`).join('');
}
function bindLeadClicks(onChange = route, root = view) {
  root.querySelectorAll('[data-lead]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    openLead(el.dataset.lead, onChange, el.dataset.tab);
  }));
}
function nichePotential(n) {
  const ins = (state.insights?.niches || []).find((x) => x.id === n.id);
  return n.potential?.score ?? ins?.opportunityScore ?? n.priority * 15;
}
function topNiches(k) {
  return (state.config.niches.items || []).filter((x) => x.active !== false).sort((a, b) => nichePotential(b) - nichePotential(a)).slice(0, k);
}

/** Fila compacta de lead usada en panel y agenda. */
function leadRow(l, extra = '') {
  const ph = l.contacts.phones[0];
  return `<div class="lead-row" data-lead="${attr(l.id)}" style="--c:${STATUS_COLOR[l.status]}">
    <div class="row" style="min-width:0;gap:10px">${tierBadge(l)}<div style="min-width:0">
      <div class="biz-name truncate">${l.starred ? '★ ' : ''}${esc(l.business.name)}</div>
      <div class="biz-sub truncate">${statusPill(l.status)} ${esc(l.business.city)}, ${esc(l.business.state)}</div>
      ${extra}
    </div></div>
    <div class="row" style="gap:8px">${closenessMeter(l, { compact: true })}${ph ? `<a class="btn sm call" href="tel:${attr(ph.number)}" data-stop aria-label="Llamar">${icon('phone')}</a>` : ''}</div>
  </div>`;
}

// ---------- Panel ----------
function dashboard() {
  const L = state.leads;
  const s = state.settings;
  const open = L.filter((l) => ACTIVE_STATUSES.includes(l.status));
  const overdue = overdueCount();
  const today = todayCount();
  const hot = open.filter((l) => l.closeness >= 50).sort((a, b) => b.closeness - a.closeness);
  const won = L.filter((l) => l.status === 'won');
  const pipelineValue = open.reduce((sum, l) => sum + (l.recommendation.estimatedDeal?.max || l.recommendation.estimatedDeal?.min || 0) * (l.closeness / 100), 0);
  const callNow = L.filter(isQueueable).filter((l) => localInfo(l.business.timezone).open).sort((a, b) => queueRank(b) - queueRank(a)).slice(0, 5);
  const urgent = new Map();
  for (const { lead, task } of agendaItems().filter((x) => x.task.priority === 'high')) {
    if (!urgent.has(lead.id)) urgent.set(lead.id, { lead, tasks: [] });
    urgent.get(lead.id).tasks.push(task);
  }
  const firstDue = (x) => Math.min(...x.tasks.map((t) => (t.due ? new Date(t.due).getTime() : Infinity)));
  const agenda = [...urgent.values()].sort((a, b) => firstDue(a) - firstDue(b) || b.lead.closeness - a.lead.closeness).slice(0, 6);
  const byGroup = GROUPS.map((g) => [g, L.filter((l) => g.statuses.includes(l.status)).length]).filter(([, n]) => n);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  view.innerHTML = `
    ${head(`${hello}${s.repName ? `, <em>${esc(s.repName.split(' ')[0])}</em>` : ''}`, 'Tu resumen comercial: primero lo vencido, luego lo más cerca del sí, después prospectos nuevos.',
      `<a class="btn" href="#/agenda">${icon('calendar')} Agenda</a><a class="btn" href="#/queue">${icon('phone')} Empezar a llamar</a><a class="btn primary" href="#/prospect">${icon('radar')} Buscar leads</a>`)}
    ${!s.workerId ? `<div class="callout warn" style="margin-bottom:16px">${icon('alert')} Configura tu perfil (nombre, correo y territorio) en <a href="#/settings">Configuración</a> para personalizar guiones y correos.</div>` : ''}
    ${state.system && !state.system.claude.installed ? '<div class="callout err" style="margin-bottom:16px">No se detectó Claude Code. Instálalo y ejecuta <span class="mono">claude</span> una vez para iniciar sesión; sin él no se pueden buscar leads.</div>' : ''}
    ${overdue ? `<a class="banner-alert" href="#/agenda">${icon('bell')}<span>Tienes <b>${plural(overdue, 'seguimiento vencido', 'seguimientos vencidos')}</b>. Atiéndelos primero →</span></a>` : ''}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Seguimientos vencidos', overdue, 'Contáctalos hoy', false, overdue ? FOLLOWUP.overdue.color : null)}
      ${kpi('Para hoy', today, 'Seguimientos programados hoy', false, today ? FOLLOWUP.today.color : null)}
      ${kpi('Cerca del sí', hot.length, 'Cercanía ≥ 50%', true)}
      ${kpi('Pipeline ponderado', pipelineValue ? `$${Math.round(pipelineValue / 1000)}k` : '$0', `${plural(open.length, 'lead activo', 'leads activos')} · ${plural(won.length, 'ganado')}`)}
    </div>
    <div class="grid g3">
      <div class="card span2">
        <h3>${icon('checklist')} Tareas de alta prioridad <a class="right small" href="#/agenda">Ver agenda →</a></h3>
        ${agenda.length ? `<div class="stack" style="gap:8px">${agenda.map(({ lead, tasks }) => leadRow(lead, `<div class="lead-tasks">${tasks.slice(0, 3).map((t) => `<div class="small task-line">${priorityChip(t.priority)} <span class="truncate">${esc(t.title)}</span>${t.due ? `<span class="mono" style="color:${new Date(t.due) <= new Date() ? FOLLOWUP.overdue.color : FOLLOWUP.today.color};white-space:nowrap">${esc(whenLabel(t.due))}</span>` : ''}</div>`).join('')}</div>`)).join('')}</div>` : '<div class="empty"><div class="big">Todo al día</div>No hay tareas urgentes.</div>'}
      </div>
      <div class="card">
        <h3>${icon('trend')} Más cerca del sí</h3>
        ${hot.length ? `<div class="stack" style="gap:8px">${hot.slice(0, 6).map((l) => `<div class="row between" style="cursor:pointer;gap:10px" data-lead="${attr(l.id)}"><div class="truncate" style="min-width:0"><b>${esc(l.business.name)}</b><div class="small">${statusPill(l.status)} ${interestPill(l.interest)}</div></div>${closenessMeter(l, { compact: true })}</div>`).join('')}</div>` : '<p class="muted small">Cuando registres conversaciones e interés, aquí verás quién está más cerca de cerrar.</p>'}
      </div>
      <div class="card span2">
        <h3>${icon('phone')} Llama ahora <span class="right small dim">Abiertos en este momento (hora local del negocio)</span></h3>
        ${callNow.length ? `<div class="stack" style="gap:8px">${callNow.map((l) => leadRow(l, notePreview(l, 80))).join('')}</div>` : `<div class="empty"><div class="big">Nadie abierto ahora</div>${L.length ? 'Fuera de horario laboral en sus zonas. Revisa correos y seguimientos.' : 'Aún no tienes leads. Lanza tu primera búsqueda.'}</div>`}
      </div>
      <div class="card">
        <h3>${icon('kanban')} Embudo <a class="right small" href="#/pipeline">Abrir →</a></h3>
        ${L.length ? `<div class="pipeline">${byGroup.map(([g, n]) => `<span style="width:${(n / L.length) * 100}%;background:${g.color}" title="${esc(g.label)}: ${n}"></span>`).join('')}</div>
        <div class="stack" style="gap:6px;margin-top:12px">${byGroup.map(([g, n]) => `<a class="row between small group-link" href="#/leads" data-group="${g.id}"><span><i class="dot" style="background:${g.color}"></i> ${esc(g.label)}</span><b>${n}</b></a>`).join('')}</div>` : '<p class="muted">Sin datos todavía.</p>'}
        <div class="section-title">Nichos con más potencial</div>
        ${topNiches(4).map((n) => `<div class="row between small" style="padding:4px 0"><span class="truncate">${esc(n.name)}</span><b style="color:${closenessColor(nichePotential(n))}">${nichePotential(n)}</b></div>`).join('')}
      </div>
    </div>`;
  bindLeadClicks();
  view.querySelectorAll('[data-group]').forEach((a) => a.addEventListener('click', () => { ui.leads.group = a.dataset.group; }));
}

// ---------- Agenda: seguimientos y tareas por urgencia ----------
function agenda() {
  const notesOpen = getPref('agenda.notes', false);
  const items = agendaItems();
  const now = new Date();
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
  const week = new Date(now.getTime() + 7 * 86400e3);
  const buckets = [
    { id: 'overdue', label: 'Vencidos', color: FOLLOWUP.overdue.color, test: (t) => t.due && new Date(t.due) <= now },
    { id: 'today', label: 'Hoy', color: FOLLOWUP.today.color, test: (t) => t.due && new Date(t.due) > now && new Date(t.due) <= endToday },
    { id: 'week', label: 'Próximos 7 días', color: FOLLOWUP.soon.color, test: (t) => t.due && new Date(t.due) > endToday && new Date(t.due) <= week },
    { id: 'nodate', label: 'Sin fecha · prioridad alta y media', color: PRIORITY.medium.color, test: (t) => !t.due && t.priority !== 'low' },
  ];
  const used = new Set();
  const cols = buckets.map((b) => {
    const list = items.filter(({ task, lead }) => { const k = `${lead.id}:${task.id}`; if (used.has(k) || !b.test(task)) return false; used.add(k); return true; })
      .sort((a, c) => (a.task.due ? new Date(a.task.due) : 0) - (c.task.due ? new Date(c.task.due) : 0) || ['high', 'medium', 'low'].indexOf(a.task.priority) - ['high', 'medium', 'low'].indexOf(c.task.priority));
    return { ...b, list };
  });
  const notes = state.leads.flatMap((l) => l.notes.map((n) => ({ n, l }))).sort((a, b) => String(b.n.at).localeCompare(String(a.n.at))).slice(0, 25);
  view.innerHTML = `
    ${head('Agenda y <em>seguimientos</em>', 'Todo lo que tienes que hacer, ordenado por urgencia. Las tareas sugeridas desaparecen solas cuando registras el resultado.',
      `<button class="btn ${notesOpen ? 'on' : ''}" id="notes-btn" aria-expanded="${notesOpen}" aria-controls="notes-panel">${icon('note')} Notas del equipo${notes.length ? ` <span class="tab-count">${notes.length}</span>` : ''}</button><button class="btn" id="notif-btn">${icon('bell')} Recordatorios en el escritorio</button>`)}
    <div class="grid ${notesOpen ? 'g3' : ''}" style="align-items:start">
      <div class="${notesOpen ? 'span2 ' : ''}stack" style="gap:16px">
        ${cols.map((b) => `<div class="card agenda-col" style="--c:${b.color}">
          <h3><span class="dot" style="background:var(--c)"></span> ${esc(b.label)} <span class="right badge">${b.list.length}</span></h3>
          ${b.list.length ? `<div class="stack" style="gap:6px">${b.list.slice(0, 60).map(({ lead, task }) => `
            <div class="agenda-item" data-lead="${attr(lead.id)}" style="--p:${PRIORITY[task.priority].color}">
              <div style="min-width:0"><div class="truncate"><b>${esc(task.title)}</b></div>
                <div class="small muted truncate">${esc(lead.business.name)} · ${esc(lead.business.city)}, ${esc(lead.business.state)} ${statusPill(lead.status)}</div>
                ${notePreview(lead, 90)}</div>
              <div class="row" style="gap:8px">${priorityChip(task.priority)}${task.due ? `<span class="small mono" style="color:var(--c)">${esc(whenLabel(task.due))}</span>` : ''}${localPill(lead)}
                ${lead.contacts.phones[0] ? `<a class="btn sm call" href="tel:${attr(lead.contacts.phones[0].number)}" data-stop aria-label="Llamar">${icon('phone')}</a>` : ''}</div>
            </div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Nada aquí.</p>'}
        </div>`).join('')}
      </div>
      ${notesOpen ? `<aside class="card notes-panel" id="notes-panel">
        <h3>${icon('note')} Notas recientes del equipo <button class="btn sm ghost right" id="notes-close" aria-label="Ocultar notas del equipo">${icon('x')}</button></h3>
        ${notes.length ? `<div class="stack" style="gap:10px">${notes.map(({ n, l }) => `<div class="note-feed" data-lead="${attr(l.id)}" data-tab="activity"><div class="small"><b>${esc(l.business.name)}</b> <span class="dim">· ${esc(n.by || '')} · ${esc(timeAgo(n.at))}</span>${n.pinned ? ` ${icon('pin')}` : ''}</div><div class="small" style="white-space:pre-wrap">${esc(n.text.length > 220 ? `${n.text.slice(0, 220)}…` : n.text)}</div></div>`).join('')}</div>` : '<p class="muted small">Las notas que guardes en los leads aparecerán aquí.</p>'}
      </aside>` : ''}
    </div>`;
  bindLeadClicks(agenda);
  const toggleNotes = () => { setPref('agenda.notes', !notesOpen); agenda(); };
  view.querySelector('#notes-btn').addEventListener('click', toggleNotes);
  view.querySelector('#notes-close')?.addEventListener('click', toggleNotes);
  view.querySelector('#notif-btn').addEventListener('click', enableNotifications);
}

// ---------- Cola de llamadas ----------
function queue() {
  const f = ui.queue;
  const list = state.leads.filter(isQueueable)
    .filter((l) => !f.niche || l.business.niche === f.niche)
    .filter((l) => !f.openOnly || localInfo(l.business.timezone).open)
    .sort((a, b) => queueRank(b) - queueRank(a));
  const niches = [...new Set(state.leads.map((l) => l.business.niche))];
  view.innerHTML = `
    ${head('Cola de <em>llamadas</em>', 'Primero los seguimientos vencidos, luego los más cerca del sí y los negocios abiertos ahora. Llama, registra el resultado y sigue con el siguiente.')}
    <div class="toolbar">
      <label class="check"><input type="checkbox" id="q-open" ${f.openOnly ? 'checked' : ''}/> Solo abiertos ahora</label>
      <select class="input" id="q-niche"><option value="">Todos los nichos</option>${niches.map((n) => `<option value="${attr(n)}" ${f.niche === n ? 'selected' : ''}>${esc(nicheName(n))}</option>`).join('')}</select>
      <span class="muted small" style="margin-left:auto">${list.length} por llamar</span>
    </div>
    ${list.length ? `<div class="queue">${list.slice(0, 100).map((l, i) => {
      const ph = l.contacts.phones[0];
      const dm = l.contacts.decisionMakers[0];
      return `<div class="q-item" data-lead="${attr(l.id)}" style="--c:${STATUS_COLOR[l.status]}">
        <div class="row"><span class="q-rank">${i + 1}</span>${tierBadge(l)}</div>
        <div style="min-width:0"><div class="biz-name truncate">${l.starred ? '★ ' : ''}${esc(l.business.name)}</div>
          <div class="biz-sub truncate">${esc(l.business.city)}, ${esc(l.business.state)} · ${esc(nicheName(l.business.niche))}${dm ? ` · Pedir por <b style="color:var(--text)">${esc(dm.name)}</b>` : ''}</div>
          <div class="row wrap" style="margin-top:6px;gap:6px">${statusPill(l.status)}${l.interest ? interestPill(l.interest) : ''}${followUpChip(l)}</div>
          ${notePreview(l, 120)}</div>
        <div style="min-width:0"><div class="small" style="color:var(--lime);font-weight:600">${esc(serviceName(l.recommendation.serviceId))}</div><div class="why">${esc(l.recommendation.angle || l.recommendation.why)}</div></div>
        <div class="stack" style="gap:6px;justify-items:end">${closenessMeter(l, { compact: true })}${localPill(l)}</div>
        <div>${ph ? `<a class="btn call" href="tel:${attr(ph.number)}" data-stop data-call="${attr(l.id)}">${icon('phone')} ${esc(ph.display)}</a>` : '<span class="badge">Sin teléfono</span>'}</div>
      </div>`;
    }).join('')}</div>` : `<div class="card empty"><div class="big">Cola vacía</div>No hay leads pendientes de llamar${f.openOnly ? ' abiertos en este momento' : ''}. <a href="#/prospect">Busca nuevos leads</a>.</div>`}`;
  view.querySelector('#q-open').addEventListener('change', (e) => { f.openOnly = e.target.checked; queue(); });
  view.querySelector('#q-niche').addEventListener('change', (e) => { f.niche = e.target.value; queue(); });
  bindLeadClicks(queue);
  view.querySelectorAll('[data-call]').forEach((a) => a.addEventListener('click', () => {
    // Abre la ficha con el guion mientras suena el teléfono.
    setTimeout(() => openLead(a.dataset.call, queue, 'script'), 150);
  }));
}

// ---------- Embudo (tablero) ----------
function pipelinePage() {
  const f = ui.pipeline;
  const q = f.q.toLowerCase();
  const leads = state.leads.filter((l) => (!f.niche || l.business.niche === f.niche)
    && (!q || `${l.business.name} ${l.business.city} ${l.notes.map((n) => n.text).join(' ')}`.toLowerCase().includes(q)));
  const groups = GROUPS.filter((g) => f.showClosed || g.id !== 'closed');
  const niches = [...new Set(state.leads.map((l) => l.business.niche))];
  view.innerHTML = `
    ${head('Embudo de <em>ventas</em>', 'Cada columna es una etapa y las tarjetas se ordenan por cercanía al sí. Arrastra una tarjeta para moverla de etapa.',
      `<button class="btn ghost" id="pl-legend">${icon('palette')} Colores</button>`)}
    <div class="toolbar">
      <input class="input search" id="pl-q" placeholder="Buscar negocio, ciudad o texto de notas…" value="${attr(f.q)}" />
      <select class="input" id="pl-niche"><option value="">Todos los nichos</option>${niches.map((n) => `<option value="${attr(n)}" ${f.niche === n ? 'selected' : ''}>${esc(nicheName(n))}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="pl-closed" ${f.showClosed ? 'checked' : ''}/> Mostrar cerrados sin venta</label>
    </div>
    <div class="board" style="--cols:${groups.length}">
      ${groups.map((g) => {
        const list = leads.filter((l) => g.statuses.includes(l.status)).sort((a, b) => b.closeness - a.closeness || b.score - a.score);
        const value = list.reduce((s, l) => s + (l.recommendation.estimatedDeal?.max || 0), 0);
        return `<section class="col" data-drop="${g.statuses[0]}" style="--c:${g.color}">
          <header title="${attr(`${g.label}: ${list.length} leads${value ? ` · hasta $${value.toLocaleString('en-US')} en tratos estimados` : ''}`)}"><span class="dot" style="background:var(--c)"></span><b>${esc(g.label)}</b><span class="badge" style="margin-left:auto">${list.length}</span></header>
          <div class="col-body">${list.slice(0, 80).map((l) => `
            <article class="kcard" draggable="true" data-lead="${attr(l.id)}" data-id="${attr(l.id)}" style="--i:${INTEREST[l.interest || 0].color}">
              <div class="row between" style="gap:8px"><b class="truncate">${l.starred ? '★ ' : ''}${esc(l.business.name)}</b>${tierBadge(l)}</div>
              <div class="small muted truncate">${esc(l.business.city)}, ${esc(l.business.state)} · ${esc(serviceName(l.recommendation.serviceId))}</div>
              ${closenessMeter(l)}
              <div class="row wrap" style="gap:6px">${l.interest ? interestPill(l.interest) : ''}${l.status !== g.statuses[0] ? statusPill(l.status) : ''}${followUpChip(l)}${l.tasksOpen[0] ? priorityChip(l.tasksOpen[0].priority) : ''}</div>
              ${l.tasksOpen[0] ? `<div class="small task-line">${icon('checklist')}<span class="truncate">${esc(l.tasksOpen[0].title)}</span></div>` : ''}
              ${notePreview(l, 90)}
            </article>`).join('') || '<p class="small dim" style="text-align:center;margin:18px 0">Vacío</p>'}</div>
        </section>`;
      }).join('')}
    </div>`;
  view.querySelector('#pl-q').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(pipelinePage.t); pipelinePage.t = setTimeout(() => { pipelinePage(); const i = view.querySelector('#pl-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  view.querySelector('#pl-niche').addEventListener('change', (e) => { f.niche = e.target.value; pipelinePage(); });
  view.querySelector('#pl-closed').addEventListener('change', (e) => { f.showClosed = e.target.checked; pipelinePage(); });
  view.querySelector('#pl-legend').addEventListener('click', colorLegend);
  bindLeadClicks(pipelinePage);
  // Arrastrar y soltar entre etapas.
  view.querySelectorAll('.kcard').forEach((c) => c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); }));
  view.querySelectorAll('.kcard').forEach((c) => c.addEventListener('dragend', () => c.classList.remove('dragging')));
  view.querySelectorAll('[data-drop]').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const lead = leadById(id);
      const status = col.dataset.drop;
      if (!lead || groupOf(lead.status).statuses.includes(status)) return;
      try {
        const updated = await api(`/api/leads/${id}`, { method: 'PATCH', body: { status, outcome: 'Movido en el embudo' } });
        state.leads[state.leads.findIndex((l) => l.id === id)] = updated;
        toast(`${lead.business.name} → ${STATUS[status]}`);
        pipelinePage();
        renderNav();
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ---------- Leads (listas separadas por etapa) ----------
function filteredLeads(ignoreGroup = false) {
  const f = ui.leads;
  const q = f.q.toLowerCase();
  return state.leads.filter((l) => {
    if (!ignoreGroup) {
      if (f.group === 'active' && !ACTIVE_STATUSES.includes(l.status)) return false;
      if (f.group !== 'active' && f.group !== 'all' && !GROUPS.find((g) => g.id === f.group)?.statuses.includes(l.status)) return false;
    }
    if (f.tier && l.tier !== f.tier) return false;
    if (f.niche && l.business.niche !== f.niche) return false;
    if (f.state && l.business.state !== f.state) return false;
    if (f.service && l.recommendation.serviceId !== f.service) return false;
    if (f.interest !== '' && String(l.interest || 0) !== f.interest) return false;
    if (q && !`${l.business.name} ${l.business.city} ${l.contacts.emails.map((e) => e.email).join(' ')} ${l.contacts.phones.map((p) => p.display).join(' ')} ${l.contacts.decisionMakers.map((d) => d.name).join(' ')} ${l.notes.map((n) => n.text).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const k = f.sort;
    const val = (l) => ({ name: l.business.name, state: l.business.state, created: l.createdAt, closeness: l.closeness, next: l.nextActionAt ? new Date(l.nextActionAt).getTime() : (f.dir > 0 ? Infinity : -Infinity), score: l.score })[k];
    const va = val(a); const vb = val(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * f.dir || b.score - a.score;
  });
}

function leadsPage(id, tab) {
  const f = ui.leads;
  const opts = (vals, cur, label, nameFn = (x) => x) => `<option value="">${label}</option>${vals.map((v) => `<option value="${attr(v)}" ${cur === v ? 'selected' : ''}>${esc(nameFn(v))}</option>`).join('')}`;
  const uniq = (fn) => [...new Set(state.leads.map(fn).filter(Boolean))].sort();
  view.innerHTML = `
    ${head('Base de <em>leads</em>', 'Separados por etapa del proceso. Ordenados por cercanía al sí; haz clic en uno para ver tareas, notas, guion y contactos.',
      `<button class="btn ghost" id="lg-legend">${icon('palette')} Colores</button><button class="btn" id="export">${icon('download')} Exportar CSV</button><a class="btn primary" href="#/prospect">${icon('plus')} Buscar más</a>`)}
    <div class="group-tabs" id="g-tabs"></div>
    <div class="toolbar">
      <input class="input search" id="f-q" placeholder="Buscar por nombre, ciudad, teléfono, correo, decisor o texto de las notas…" value="${attr(f.q)}" />
      <select class="input" data-f="interest"><option value="">Interés</option>${INTEREST.map((i) => `<option value="${i.level}" ${f.interest === String(i.level) ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select>
      <select class="input" data-f="tier">${opts(['A', 'B', 'C'], f.tier, 'Tier', (t) => `Tier ${t}`)}</select>
      <select class="input" data-f="niche">${opts(uniq((l) => l.business.niche), f.niche, 'Nicho', nicheName)}</select>
      <select class="input" data-f="state">${opts(uniq((l) => l.business.state), f.state, 'Estado USA')}</select>
      <select class="input" data-f="service">${opts(uniq((l) => l.recommendation.serviceId), f.service, 'Servicio', serviceName)}</select>
      <select class="input" id="f-sort">${[['closeness', 'Más cerca del sí'], ['next', 'Próximo seguimiento'], ['score', 'Calidad (puntaje)'], ['created', 'Más recientes'], ['name', 'Nombre']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>Orden: ${l}</option>`).join('')}</select>
    </div>
    <div id="leads-table"></div>`;
  renderLeadsTable();
  view.querySelector('#f-q').addEventListener('input', (e) => { f.q = e.target.value; renderLeadsTable(); });
  view.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value; renderLeadsTable(); }));
  view.querySelector('#f-sort').addEventListener('change', (e) => { f.sort = e.target.value; f.dir = ['name', 'next'].includes(f.sort) ? 1 : -1; renderLeadsTable(); });
  view.querySelector('#export').addEventListener('click', exportCsv);
  view.querySelector('#lg-legend').addEventListener('click', colorLegend);
  // Enlace directo: #/leads/<id>[/<pestaña>] abre la ficha del lead.
  if (id) openLead(decodeURIComponent(id), renderLeadsTable, tab);
}

function renderGroupTabs() {
  const f = ui.leads;
  const base = filteredLeads(true);
  const tabs = [
    { id: 'active', label: 'Activos', color: 'var(--lime)', n: base.filter((l) => ACTIVE_STATUSES.includes(l.status)).length },
    ...GROUPS.map((g) => ({ id: g.id, label: g.label, color: g.color, n: base.filter((l) => g.statuses.includes(l.status)).length })),
    { id: 'all', label: 'Todos', color: 'var(--muted)', n: base.length },
  ];
  const el = view.querySelector('#g-tabs');
  el.innerHTML = tabs.map((t) => `<button class="gtab ${f.group === t.id ? 'on' : ''}" style="--c:${t.color}" data-g="${t.id}"><i></i>${esc(t.label)}<span>${t.n}</span></button>`).join('');
  el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { f.group = b.dataset.g; renderLeadsTable(); }));
}

function renderLeadsTable() {
  renderGroupTabs();
  const list = filteredLeads();
  const el = view.querySelector('#leads-table');
  // La selección solo incluye leads visibles: nunca se elimina algo que el filtro actual oculta.
  const sel = ui.leads.sel;
  const visible = new Set(list.map((l) => l.id));
  for (const id of [...sel]) if (!visible.has(id)) sel.delete(id);
  if (!state.leads.length) {
    el.innerHTML = `<div class="card empty"><div class="big">Aún no hay leads</div>Lanza una búsqueda desde <a href="#/prospect">Prospectar</a> o con <span class="mono">/prospectar</span> en Claude Code.</div>`;
    return;
  }
  const allSel = list.length > 0 && list.every((l) => sel.has(l.id));
  el.innerHTML = (sel.size ? `<div class="bulk-bar" role="status">
      <b>${sel.size} seleccionado${sel.size === 1 ? '' : 's'}</b>
      ${allSel ? '' : `<button class="btn sm ghost" id="sel-view">Seleccionar los ${list.length} de esta lista</button>`}
      <span class="right row" style="gap:8px"><button class="btn sm ghost" id="sel-none">Quitar selección</button><button class="btn sm danger" id="sel-del">${icon('trash')} Eliminar</button></span>
    </div>` : '') + (list.length ? `<div class="table-wrap"><table class="leads">
      <thead><tr><th class="sel-cell"><input type="checkbox" id="sel-all" aria-label="Seleccionar todos los de esta lista" ${allSel ? 'checked' : ''} /></th><th>Cercanía al sí</th><th>Negocio · última nota</th><th>Etapa · interés</th><th>Próximo paso</th><th>Contacto</th><th>Servicio a ofrecer</th></tr></thead>
      <tbody>${list.map((l) => `<tr data-lead="${attr(l.id)}" class="${sel.has(l.id) ? 'selected' : ''}" style="--c:${STATUS_COLOR[l.status]}">
        <td class="sel-cell"><input type="checkbox" class="sel" data-sel="${attr(l.id)}" aria-label="Seleccionar ${attr(l.business.name)}" ${sel.has(l.id) ? 'checked' : ''} /></td>
        <td>${closenessMeter(l)}</td>
        <td style="max-width:300px"><div class="row" style="gap:8px">${tierBadge(l)}<div style="min-width:0"><div class="biz-name truncate">${l.starred ? '★ ' : ''}${esc(l.business.name)}</div><div class="biz-sub truncate">${esc(l.business.city)}, ${esc(l.business.state)} · ${esc(nicheName(l.business.niche))}</div></div></div>${notePreview(l, 90)}</td>
        <td><div class="stack" style="gap:4px;justify-items:start">${statusPill(l.status)}${interestPill(l.interest || 0)}</div></td>
        <td style="max-width:240px">${l.tasksOpen[0] ? `<div class="small truncate">${priorityChip(l.tasksOpen[0].priority)} ${esc(l.tasksOpen[0].title)}</div>` : '<span class="dim small">—</span>'}${followUpChip(l) ? `<div style="margin-top:4px">${followUpChip(l)}</div>` : ''}</td>
        <td><div class="mono small">${esc(l.contacts.phones[0]?.display || '—')}</div><div class="small dim truncate" style="max-width:180px">${esc(l.contacts.decisionMakers[0]?.name || l.contacts.emails[0]?.email || '')}</div>${localPill(l)}</td>
        <td style="max-width:220px"><div class="small truncate" style="color:var(--lime)">${esc(serviceName(l.recommendation.serviceId))}</div><div class="small dim">${esc(dealRange(l.recommendation.estimatedDeal))}</div></td>
      </tr>`).join('')}</tbody></table></div>`
    : '<div class="card empty"><div class="big">Lista vacía</div>No hay leads en esta etapa con los filtros actuales.</div>');
  el.querySelectorAll('tr[data-lead]').forEach((r) => r.addEventListener('click', () => openLead(r.dataset.lead, renderLeadsTable)));
  el.querySelectorAll('.sel-cell').forEach((c) => c.addEventListener('click', (e) => e.stopPropagation()));
  el.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); renderLeadsTable(); }));
  el.querySelector('#sel-all')?.addEventListener('change', (e) => { if (e.target.checked) list.forEach((l) => sel.add(l.id)); else sel.clear(); renderLeadsTable(); });
  el.querySelector('#sel-view')?.addEventListener('click', () => { list.forEach((l) => sel.add(l.id)); renderLeadsTable(); });
  el.querySelector('#sel-none')?.addEventListener('click', () => { sel.clear(); renderLeadsTable(); });
  el.querySelector('#sel-del')?.addEventListener('click', () => confirmDeleteLeads(list.filter((l) => sel.has(l.id)), () => { sel.clear(); renderLeadsTable(); renderNav(); }));
}

function exportCsv() {
  const rows = filteredLeads();
  const cols = [
    ['Stage', (l) => STATUS[l.status]], ['Closeness %', (l) => l.closeness], ['Interest', (l) => INTEREST[l.interest || 0].label], ['Tier', (l) => l.tier], ['Score', (l) => l.score],
    ['Business', (l) => l.business.name], ['Niche', (l) => nicheName(l.business.niche)], ['City', (l) => l.business.city], ['State', (l) => l.business.state],
    ['Phone', (l) => l.contacts.phones[0]?.display], ['Other phones', (l) => l.contacts.phones.slice(1).map((p) => p.display).join(' / ')],
    ['Email', (l) => l.contacts.emails[0]?.email], ['Decision maker', (l) => l.contacts.decisionMakers.map((d) => `${d.name}${d.title ? ` (${d.title})` : ''}`).join('; ')],
    ['Website', (l) => l.business.website], ['Service', (l) => serviceName(l.recommendation.serviceId)], ['Deal estimate', (l) => dealRange(l.recommendation.estimatedDeal)],
    ['Next follow-up', (l) => l.nextActionAt || ''], ['Next task', (l) => l.tasksOpen[0]?.title || ''], ['Last note', (l) => l.lastNote?.text || ''],
    ['Why', (l) => l.recommendation.why], ['Call opener', (l) => fill(l.outreach.callOpener)], ['Lead ID', (l) => l.id],
  ];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = `﻿${[cols.map(([h]) => q(h)).join(','), ...rows.map((l) => cols.map(([, fn]) => q(fn(l))).join(','))].join('\r\n')}`;
  download(`devleck-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  toast(`${rows.length} leads exportados`);
}

// ---------- Prospectar ----------
function prospect() {
  const s = state.settings;
  const member = (state.config.team.members || []).find((m) => m.id === s.workerId);
  const d = ui.prospectDraft = {
    niche: '', customNiche: '', serviceFocus: '', states: s.defaultStates?.length ? s.defaultStates : member?.states || [], cities: '',
    count: s.defaultLeadCount || 10, minEmployees: s.defaultMinEmployees ?? 2, excludeChains: s.excludeChains !== false, requirePhone: s.requirePhone !== false,
    signals: [], extra: '', ...(ui.prospectDraft || {}),
  };
  const niches = [...state.config.niches.items].filter((n) => n.active !== false).sort((a, b) => nichePotential(b) - nichePotential(a));
  const services = state.config.services.items.filter((x) => x.active !== false);
  const SIGNALS = [['hiring', 'Están contratando'], ['growth', 'Crecimiento / nuevas sedes'], ['reviews', 'Quejas en reseñas'], ['website', 'Web deficiente'], ['funding', 'Financiación reciente'], ['ads', 'Invierten en publicidad'], ['ai', 'Interés en IA']];

  view.innerHTML = `
    ${head('Buscar <em>leads</em>', 'Define el objetivo y Claude investigará la web: encuentra negocios, verifica teléfono y correo, analiza su necesidad y prepara el guion y el correo para cada uno.')}
    <div class="grid g3" style="align-items:start">
      <div class="card span2 stack" style="gap:18px">
        <div class="grid g2">
          <div class="field"><label>Nicho</label>
            <select class="input" id="p-niche"><option value="">Automático (el de mayor potencial)</option>
              ${niches.map((n) => `<option value="${attr(n.id)}" ${d.niche === n.id ? 'selected' : ''}>${nichePotential(n)}/100 · ${esc(n.name)}</option>`).join('')}
              <option value="__custom" ${d.niche === '__custom' ? 'selected' : ''}>Otro nicho (escribirlo)…</option>
            </select>
            <input class="input" id="p-custom" placeholder="Ej: bridal boutiques, dermatology clinics…" value="${attr(d.customNiche)}" style="display:${d.niche === '__custom' ? 'block' : 'none'}" />
          </div>
          <div class="field"><label>Servicio / producto a vender</label>
            <select class="input" id="p-service"><option value="">La IA elige el mejor para cada lead</option>
              ${services.map((x) => `<option value="${attr(x.id)}" ${d.serviceFocus === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            </select>
            <div class="help" id="p-service-help"></div>
          </div>
        </div>
        <div class="field"><label>Estados de USA</label>
          <div class="chips" id="p-states">${US_STATES.map((st) => `<span class="chip ${d.states.includes(st) ? 'on' : ''}" data-st="${st}">${st}</span>`).join('')}</div>
          <div class="help">Sin selección = la IA elige los mercados con más densidad del nicho. ${member?.states?.length ? `Tu territorio asignado: ${member.states.join(', ')}.` : ''}</div>
        </div>
        <div class="field"><label>Ciudades (opcional)</label><input class="input" id="p-cities" placeholder="Ej: Austin, Houston, Miami" value="${attr(d.cities)}" /></div>
        <div class="grid g2">
          <div class="field"><label>Cantidad de leads: <span id="p-count-v" style="color:var(--lime)">${d.count}</span></label><input type="range" class="range" id="p-count" min="3" max="30" value="${d.count}" /><div class="help">~2–3 min por lead. 10 leads ≈ 20–30 min.</div></div>
          <div class="field"><label>Mínimo de empleados</label><input type="number" class="input" id="p-min" min="1" value="${attr(d.minEmployees)}" /></div>
        </div>
        <div class="field"><label>Priorizar señales de compra</label>
          <div class="chips" id="p-signals">${SIGNALS.map(([k, l]) => `<span class="chip ${d.signals.includes(k) ? 'on' : ''}" data-sig="${k}">${l}</span>`).join('')}</div>
        </div>
        <div class="row wrap" style="gap:22px">
          <label class="check"><input type="checkbox" id="p-chains" ${d.excludeChains ? 'checked' : ''}/> Excluir cadenas y franquicias corporativas</label>
          <label class="check"><input type="checkbox" id="p-phone" ${d.requirePhone ? 'checked' : ''}/> Solo leads con teléfono</label>
        </div>
        <div class="field"><label>Instrucciones adicionales</label><textarea class="input" id="p-extra" placeholder="Ej: que diseñen joyas a medida; evitar los que ya tienen chat en su web; preferir negocios familiares con más de 10 años…">${esc(d.extra)}</textarea></div>
        <div class="row wrap">
          <button class="btn primary lg" id="p-run">${icon('play')} Lanzar búsqueda</button>
          <button class="btn lg" id="p-copy">${icon('copy')} Copiar comando para Claude Code</button>
        </div>
        <p class="small dim" style="margin:0">La búsqueda corre en segundo plano con tu cuenta de Claude. Puedes seguir llamando mientras tanto; los leads aparecen a medida que se guardan.</p>
      </div>
      <div class="stack">
        <div class="card" id="p-side"></div>
        <div class="card"><h3>${icon('sparkles')} Consejos</h3><ul class="list small muted">
          <li>Empieza por un nicho + 1–3 estados: búsquedas enfocadas dan mejores leads.</li>
          <li>Si vendes un producto específico (ej. AI Jewelry Design Studio), selecciónalo: la IA buscará la señal exacta.</li>
          <li>La capacitación en IA aplica a cualquier nicho: la IA la sugiere como entrada o como venta adicional.</li>
        </ul></div>
      </div>
    </div>`;

  const $ = (id) => view.querySelector(id);
  const side = () => {
    const nid = d.niche && d.niche !== '__custom' ? d.niche : '';
    const n = nicheById(nid);
    const svc = state.config.services.items.find((x) => x.id === d.serviceFocus);
    $('#p-service-help').textContent = svc ? svc.oneLiner : '';
    $('#p-side').innerHTML = n ? `<h3>${icon('trend')} ${esc(n.name)}</h3>
      <div class="stack small">
        <div class="row" style="gap:10px">${potentialRing(nichePotential(n), 52)}<div>${stars(n.priority)}<div class="muted">crecimiento ${esc(growthLabel(n.growth))}</div></div></div>
        ${n.potential?.verdict ? `<div>${esc(n.potential.verdict)}</div>` : ''}
        <div><b>Servicios que encajan:</b><div class="chips" style="margin-top:6px">${(n.matchingServices || []).map((id) => `<span class="badge">${esc(serviceName(id))}</span>`).join('')}</div></div>
        <div><b>Decisores:</b> <span class="muted">${esc((n.decisionMakers || []).join(', '))}</span></div>
        <div><b>Mejor hora:</b> <span class="muted">${esc(n.bestTimeToCall || '')}</span></div>
      </div>` : `<h3>${icon('trend')} Nichos con más potencial</h3>${topNiches(6).map((x) => `<div class="row between" style="padding:6px 0"><span class="small"><b style="color:${closenessColor(nichePotential(x))}">${nichePotential(x)}</b> · ${esc(x.name)}</span><button class="btn sm ghost" data-pick="${attr(x.id)}">Elegir</button></div>`).join('')}`;
    $('#p-side').querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { d.niche = b.dataset.pick; prospect(); }));
  };
  side();

  $('#p-niche').addEventListener('change', (e) => { d.niche = e.target.value; $('#p-custom').style.display = d.niche === '__custom' ? 'block' : 'none'; side(); });
  $('#p-custom').addEventListener('input', (e) => { d.customNiche = e.target.value; });
  $('#p-service').addEventListener('change', (e) => { d.serviceFocus = e.target.value; side(); });
  $('#p-states').addEventListener('click', (e) => {
    const st = e.target.closest('[data-st]')?.dataset.st;
    if (!st) return;
    d.states = d.states.includes(st) ? d.states.filter((x) => x !== st) : [...d.states, st];
    e.target.classList.toggle('on');
  });
  $('#p-signals').addEventListener('click', (e) => {
    const k = e.target.closest('[data-sig]')?.dataset.sig;
    if (!k) return;
    d.signals = d.signals.includes(k) ? d.signals.filter((x) => x !== k) : [...d.signals, k];
    e.target.classList.toggle('on');
  });
  $('#p-cities').addEventListener('input', (e) => { d.cities = e.target.value; });
  $('#p-count').addEventListener('input', (e) => { d.count = Number(e.target.value); $('#p-count-v').textContent = d.count; });
  $('#p-min').addEventListener('input', (e) => { d.minEmployees = Number(e.target.value) || 1; });
  $('#p-chains').addEventListener('change', (e) => { d.excludeChains = e.target.checked; });
  $('#p-phone').addEventListener('change', (e) => { d.requirePhone = e.target.checked; });
  $('#p-extra').addEventListener('input', (e) => { d.extra = e.target.value; });

  const params = () => {
    const p = {
      niche: d.niche === '__custom' ? d.customNiche.trim() : d.niche || undefined,
      serviceFocus: d.serviceFocus || undefined,
      states: d.states.length ? d.states : undefined,
      cities: d.cities.split(',').map((c) => c.trim()).filter(Boolean),
      count: d.count, minEmployees: d.minEmployees, excludeChains: d.excludeChains, requirePhone: d.requirePhone,
      signals: d.signals.length ? d.signals : undefined, extra: d.extra.trim() || undefined,
    };
    if (!p.cities.length) delete p.cities;
    return p;
  };
  $('#p-run').addEventListener('click', async (e) => {
    if (d.niche === '__custom' && !d.customNiche.trim()) { toast('Escribe el nicho personalizado', true); return; }
    e.target.disabled = true;
    try {
      const run = await api('/api/runs', { method: 'POST', body: { type: 'prospect', params: params() } });
      state.runs.unshift(run);
      toast('Búsqueda iniciada');
      location.hash = `#/runs/${run.id}`;
    } catch (err) {
      toast(err.message, true);
      e.target.disabled = false;
    }
  });
  $('#p-copy').addEventListener('click', () => copy(`/prospectar ${JSON.stringify(params())}`, 'Comando copiado — pégalo en Claude Code'));
}

// ---------- Nichos (potencial calibrado con investigación) ----------
const DIM_LABELS = { growth: 'Crecimiento', pain: 'Dolor que resolvemos', budget: 'Capacidad de pago', fit: 'Encaje con catálogo', market: 'Tamaño de mercado', reach: 'Facilidad de contacto' };
const CONF = { high: ['Evidencia sólida', '#3ddc84'], medium: ['Evidencia parcial', '#facc15'], low: ['Estimación', '#8b939c'] };
const potentialRing = (score, size = 64) => `<div class="ring" style="--p:${score};--rc:${closenessColor(score)};width:${size}px;height:${size}px"><div style="width:${size - 14}px;height:${size - 14}px">${score}</div></div>`;

function nichesPage() {
  const cfg = state.config.niches;
  const ins = state.insights;
  const insMap = new Map((ins?.niches || []).map((x) => [x.id, x]));
  const items = [...cfg.items].filter((n) => n.active !== false).sort((a, b) => nichePotential(b) - nichePotential(a));
  const suggested = (ins?.niches || []).filter((x) => !cfg.items.some((n) => n.id === x.id));
  const isAdmin = state.settings.isAdmin;
  const W = cfg._methodology?.weights || {};

  view.innerHTML = `
    ${head('Potencial de <em>nichos</em>', 'Cada nicho se califica con la misma rúbrica y datos de mercado de EE. UU. (BLS, Census, asociaciones e informes de industria), con su fuente. Nada al azar.',
      `<button class="btn" id="n-method">${icon('book')} Cómo se calcula</button><button class="btn primary" id="n-run">${icon('sparkles')} Re-analizar con IA</button>`)}
    ${cfg._methodology ? `<div class="callout" style="margin-bottom:18px"><b>Calibración del ${esc(cfg._methodology.updatedAt)}.</b> Potencial = ${Object.entries(W).map(([k, w]) => `${DIM_LABELS[k]} ${Math.round(w * 100)}%`).join(' · ')}. La prioridad (★) se deriva del potencial: ${esc(cfg._methodology.priorityBands)}.</div>` : ''}
    <div class="grid g3">${items.map((n) => {
      const p = n.potential;
      const i = insMap.get(n.id);
      const c = CONF[p?.confidence] || CONF.low;
      return `
      <div class="card niche">
        <div class="niche-top">
          ${potentialRing(nichePotential(n))}
          <div style="min-width:0;flex:1"><div style="font-weight:700;font-size:15px">${esc(n.name)}</div>
            <div class="small muted">${stars(n.priority)} · crecimiento ${esc(growthLabel(n.growth))}</div>
            <div class="small" style="color:${c[1]}">● ${c[0]}</div></div>
        </div>
        ${p?.verdict ? `<p class="small" style="margin:0">${esc(p.verdict)}</p>` : ''}
        ${p ? `<div class="bars">${Object.entries(p.dimensions).map(([k, d]) => `<div class="bar" title="${attr(d.note)}"><span class="muted small">${DIM_LABELS[k] || k}</span><div class="track"><div class="fill" style="width:${d.score * 10}%;background:${closenessColor(d.score * 10)}"></div></div><span class="mono small">${d.score}</span></div>`).join('')}</div>` : ''}
        <div class="chips">${(n.matchingServices || []).slice(0, 3).map((id) => `<span class="badge">${esc(serviceName(id))}</span>`).join('')}</div>
        ${p ? `<details class="small"><summary class="muted" style="cursor:pointer">Por qué este puntaje · ${p.evidence.length} ${p.evidence.length === 1 ? 'fuente' : 'fuentes'}</summary>
          <div class="stack" style="gap:6px;margin-top:8px">
            ${Object.entries(p.dimensions).map(([k, d]) => `<div><b>${DIM_LABELS[k]} ${d.score}/10:</b> <span class="muted">${esc(d.note)}</span></div>`).join('')}
            ${p.evidence.map((e) => `<div class="evidence">${esc(e.detail)} ${e.source ? `<a class="src" href="${attr(e.source)}" target="_blank" rel="noopener">fuente ↗</a>` : ''}</div>`).join('')}
          </div></details>` : ''}
        ${i ? `<div class="small muted" style="border-top:1px dashed var(--line);padding-top:8px">${icon('sparkles')} Tu último análisis IA (${esc(timeAgo(ins.generatedAt))}): <b style="color:var(--text)">${i.opportunityScore}/100</b>${i.whyNow ? ` — ${esc(i.whyNow)}` : ''}</div>` : ''}
        <div class="row" style="margin-top:auto">
          <button class="btn sm primary" data-prospect="${attr(n.id)}">${icon('radar')} Prospectar</button>
          ${isAdmin ? `<select class="input" style="width:auto;min-height:30px;padding:3px 8px" data-prio="${attr(n.id)}" title="Ajustar prioridad (admin)">${[1, 2, 3, 4, 5].map((v) => `<option ${v === n.priority ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}
          <span class="small dim" style="margin-left:auto">${plural(state.leads.filter((l) => l.business.niche === n.id).length, 'lead')}</span>
        </div>
      </div>`;
    }).join('')}</div>
    ${suggested.length ? `<div class="section-title" style="margin-top:28px">${icon('sparkles')} Nichos nuevos sugeridos por tu análisis IA</div>
      <div class="grid g3">${suggested.map((n) => `<div class="card niche"><div class="niche-top">${potentialRing(n.opportunityScore)}<div><b>${esc(n.name)}</b><div class="small muted">${esc(n.whyNow || '')}</div></div></div>
        <div class="row"><button class="btn sm primary" data-custom="${attr(n.name)}">${icon('radar')} Prospectar</button></div></div>`).join('')}</div>` : ''}`;

  view.querySelector('#n-run').addEventListener('click', async () => {
    try {
      const run = await api('/api/runs', { method: 'POST', body: { type: 'niches', params: { discover: true } } });
      location.hash = `#/runs/${run.id}`;
    } catch (err) { toast(err.message, true); }
  });
  view.querySelector('#n-method').addEventListener('click', () => {
    const m = cfg._methodology || {};
    modal(`<h2>Cómo se calcula el potencial</h2>
      <p>Cada nicho se califica de 0 a 10 en seis dimensiones, siempre con la misma rúbrica y con evidencia pública de EE. UU. El potencial es la suma ponderada × 10.</p>
      <div class="stack">${Object.entries(m.dimensions || {}).map(([k, t]) => `<div><b>${DIM_LABELS[k]} (${Math.round((W[k] || 0) * 100)}%)</b><div class="small muted">${esc(t)}</div></div>`).join('')}</div>
      <p class="small muted" style="margin-top:14px">"Evidencia sólida" = datos de fuentes oficiales o asociaciones del sector. "Evidencia parcial" = estimaciones de firmas de investigación. "Estimación" = criterio experto sin dato duro. Al re-analizar con IA se usa la misma rúbrica, así los puntajes siguen siendo comparables.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>Entendido</button></div>`);
  });
  view.querySelectorAll('[data-prospect]').forEach((b) => b.addEventListener('click', () => { ui.prospectDraft = { niche: b.dataset.prospect }; location.hash = '#/prospect'; }));
  view.querySelectorAll('[data-custom]').forEach((b) => b.addEventListener('click', () => { ui.prospectDraft = { niche: '__custom', customNiche: b.dataset.custom }; location.hash = '#/prospect'; }));
  view.querySelectorAll('[data-prio]').forEach((s) => s.addEventListener('change', async () => {
    const data = structuredClone(state.config.niches);
    data.items.find((n) => n.id === s.dataset.prio).priority = Number(s.value);
    await saveConfig('niches', data, 'Prioridad actualizada y leads re-puntuados');
    nichesPage();
  }));
}

// ---------- Búsquedas ----------
async function runsPage(id) {
  state.runs = await api('/api/runs');
  if (id) return runDetail(id);
  view.innerHTML = `
    ${head('Búsquedas', 'Historial de investigaciones lanzadas desde la interfaz. Las que lanzas desde el chat de Claude Code no aparecen aquí, pero sus leads sí.')}
    ${state.runs.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Parámetros</th><th>Estado</th><th>Leads</th><th>Inicio</th></tr></thead><tbody>
      ${state.runs.map((r) => `<tr data-run="${attr(r.id)}"><td><b>${esc(r.label)}</b><div class="small dim mono">${esc(r.id)}</div></td><td class="small muted" style="max-width:380px">${esc(paramsSummary(r))}</td><td>${runStatus(r.status)}</td><td class="mono">${state.leads.filter((l) => l.runId === r.id).length}</td><td class="small dim">${esc(timeAgo(r.startedAt))}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card empty"><div class="big">Sin búsquedas</div><a href="#/prospect">Lanza la primera</a>.</div>`}`;
  view.querySelectorAll('[data-run]').forEach((r) => r.addEventListener('click', () => { location.hash = `#/runs/${r.dataset.run}`; }));
}

function paramsSummary(r) {
  const p = r.params || {};
  if (r.type === 'call-prep') return p.business || p.leadId;
  if (r.type === 'niches') return 'Análisis de mercado';
  return [p.niche ? nicheName(p.niche) : 'Nicho automático', p.serviceFocus && serviceName(p.serviceFocus), p.states?.join(', '), p.cities?.join(', '), `${p.count || 10} leads`].filter(Boolean).join(' · ');
}
const runStatus = (s) => ({
  running: '<span class="row small" style="color:var(--lime)"><span class="pulse"></span> En curso</span>',
  done: `<span class="st" style="--c:${STATUS_COLOR.won}">Completada</span>`, error: `<span class="st" style="--c:${STATUS_COLOR.dnc}">Error</span>`,
  stopped: `<span class="st" style="--c:${STATUS_COLOR.lost}">Detenida</span>`, interrupted: `<span class="st" style="--c:${STATUS_COLOR.attempted}">Interrumpida</span>`,
}[s] || esc(s));

const EV_ICON = { search: 'search', globe: 'globe', file: 'file', save: 'save', db: 'db', terminal: 'terminal', list: 'list', tool: 'tool' };

async function runDetail(id) {
  const run = await api(`/api/runs/${id}`);
  const evHtml = (e) => {
    const t = new Date(e.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ic = e.kind === 'tool' ? icon(EV_ICON[e.icon] || 'tool') : e.kind === 'saved' ? icon('db') : e.kind === 'error' ? icon('alert') : e.kind === 'end' ? icon('check') : e.kind === 'text' ? icon('sparkles') : '';
    const kind = e.kind === 'end' && e.status !== 'done' ? 'error' : e.kind;
    return `<div class="ev ${esc(kind)}"><span class="t">${t}</span><span class="i">${ic}</span><div class="m">${esc(e.text)}</div></div>`;
  };
  const stats = (r, events) => {
    const n = state.leads.filter((l) => l.runId === r.id).length;
    const searches = events.filter((e) => e.tool === 'WebSearch').length;
    const pages = events.filter((e) => e.tool === 'WebFetch').length;
    return `<div class="grid g4" style="margin-bottom:16px">${kpi('Leads guardados', n, r.type === 'prospect' ? `objetivo ${r.params?.count || 10}` : '', true)}${kpi('Búsquedas web', searches, '')}${kpi('Páginas leídas', pages, '')}${kpi('Duración', duration(r), '')}</div>`;
  };
  const events = run.events;
  view.innerHTML = `
    ${head(`${esc(run.label)}`, esc(paramsSummary(run)), `<span id="r-status">${runStatus(run.status)}</span>
      ${run.status === 'running' ? `<button class="btn danger" id="r-stop">${icon('stop')} Detener</button>` : ''}
      ${run.type === 'prospect' ? `<a class="btn primary" href="#/leads" id="r-leads">${icon('users')} Ver leads</a>` : run.type === 'niches' ? `<a class="btn primary" href="#/niches">${icon('trend')} Ver nichos</a>` : ''}`)}
    <div id="r-stats">${stats(run, events)}</div>
    <div class="log" id="r-log">${events.map(evHtml).join('')}${run.status === 'running' ? '<div class="ev" id="r-wait"><span class="t"></span><span class="i"><span class="pulse"></span></span><div class="m muted">Trabajando…</div></div>' : ''}</div>`;
  const log = view.querySelector('#r-log');
  log.scrollTop = log.scrollHeight;
  view.querySelector('#r-leads')?.addEventListener('click', () => { ui.leads = { ...ui.leads, group: 'todo', sort: 'created', dir: -1 }; });
  view.querySelector('#r-stop')?.addEventListener('click', async () => {
    if (!confirm('¿Detener la búsqueda? Los leads ya guardados se conservan.')) return;
    await api(`/api/runs/${id}/stop`, { method: 'POST' });
  });
  if (run.status !== 'running') return;

  activeStream = new EventSource(`/api/runs/${id}/stream`);
  activeStream.onmessage = async (msg) => {
    const e = JSON.parse(msg.data);
    events.push(e);
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    view.querySelector('#r-wait')?.insertAdjacentHTML('beforebegin', evHtml(e));
    if (atBottom) log.scrollTop = log.scrollHeight;
    if (e.kind === 'saved' || e.kind === 'end') {
      await refreshLeads();
      run.endedAt = e.kind === 'end' ? e.at : run.endedAt;
      view.querySelector('#r-stats').innerHTML = stats(run, events);
      renderNav();
    }
    if (e.kind === 'end') {
      activeStream.close();
      activeStream = null;
      view.querySelector('#r-wait')?.remove();
      view.querySelector('#r-status').innerHTML = runStatus(e.status);
      view.querySelector('#r-stop')?.remove();
      if (run.type === 'niches') state.insights = await api('/api/insights');
      toast(e.text);
    }
  };
  pollTimer = setInterval(() => { view.querySelector('#r-stats') && (view.querySelector('#r-stats').innerHTML = stats(run, events)); }, 5000);
}

function duration(r) {
  const ms = (r.endedAt ? new Date(r.endedAt) : new Date()) - new Date(r.startedAt);
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ---------- Catálogo ----------
const priceLabel = (p) => {
  if (!p) return '—';
  const base = `$${Number(p.from || 0).toLocaleString('en-US')} – $${Number(p.to || 0).toLocaleString('en-US')}`;
  return `${base}${p.monthly ? ` + $${p.monthly.from}–${p.monthly.to}/mes` : ''}`;
};

function catalog(id) {
  const isAdmin = state.settings.isAdmin;
  const items = state.config.services.items;
  view.innerHTML = `
    ${head('Catálogo de <em>servicios</em>', 'Lo que vendemos y cómo explicarlo. Abre la guía de ventas de cada servicio para aprender qué es, cómo funciona, un ejemplo real y cómo hablar del precio.',
      isAdmin ? `<button class="btn primary" id="c-add">${icon('plus')} Nuevo servicio / producto</button><button class="btn" id="c-claude">${icon('sparkles')} Crear con Claude</button>` : '')}
    ${!isAdmin ? '<div class="callout" style="margin-bottom:16px">El catálogo lo administra Devleck y se actualiza con “Actualizar herramienta” en Configuración.</div>' : `<div class="callout" style="margin-bottom:16px">${icon('alert')} Después de editar, publica los cambios para el equipo:<pre class="cmd" style="margin-top:8px">git add config && git commit -m "Actualizar catálogo" && git push</pre></div>`}
    <div class="grid g2">${items.map((x) => `
      <div class="card stack" style="${x.active === false ? 'opacity:.5' : ''}">
        <div class="row between" style="align-items:flex-start">
          <div><div class="row wrap" style="gap:8px"><span class="badge">${x.type === 'product' ? 'Producto' : 'Servicio'}</span><span class="badge">${esc(x.category || '')}</span>${x.allNiches ? '<span class="badge" style="color:var(--lime)">Todos los nichos</span>' : ''}${x.active === false ? '<span class="badge">Inactivo</span>' : ''}</div>
            <div style="font-weight:700;font-size:16px;margin-top:8px">${esc(x.name)}</div></div>
          ${isAdmin ? `<button class="btn sm" data-edit="${attr(x.id)}">${icon('edit')} Editar</button>` : ''}
        </div>
        <p style="margin:0">${esc(x.salesGuide?.simple || x.oneLiner)}</p>
        <dl class="kv small">
          <dt>Precio</dt><dd><b style="color:var(--lime)">${esc(priceLabel(x.pricing))}</b> <span class="dim">· ${esc(x.pricing?.model || '')}</span></dd>
          <dt>Plazo</dt><dd>${esc(x.timeline || '—')}</dd>
          <dt>Nichos</dt><dd>${x.allNiches ? 'Todos' : (x.idealCustomer?.niches || []).map((n) => esc(nicheName(n))).join(', ')}</dd>
        </dl>
        <div class="row"><button class="btn sm primary" data-guide="${attr(x.id)}">${icon('book')} Guía de ventas</button></div>
      </div>`).join('')}</div>`;
  view.querySelectorAll('[data-guide]').forEach((b) => b.addEventListener('click', () => salesGuide(items.find((i) => i.id === b.dataset.guide))));
  // Enlace directo: #/catalog/<id> abre la guía de ventas del servicio.
  if (id && items.some((i) => i.id === id)) salesGuide(items.find((i) => i.id === decodeURIComponent(id)));
  if (!isAdmin) return;
  view.querySelector('#c-add').addEventListener('click', () => editService(null));
  view.querySelector('#c-claude').addEventListener('click', () => {
    modal(`<h2>Crear servicio con Claude</h2><p class="muted">Abre Claude Code en la carpeta del proyecto y escribe el comando con toda la información que tengas (descripción, precio, a quién va dirigido, enlaces). Claude investigará el mercado y completará el perfil, la guía de ventas, las señales, el pitch y las objeciones.</p>
      <pre class="cmd">/nuevo-servicio Sistema con IA para joyerías que modela joyas en 3D con Claude + Blender/AutoCAD…</pre>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button><button class="btn primary" id="cc">${icon('copy')} Copiar comando</button></div>`,
    (m) => m.querySelector('#cc').addEventListener('click', () => copy('/nuevo-servicio ')));
  });
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editService(b.dataset.edit)));
}

/** Material de aprendizaje del servicio para el vendedor. */
function salesGuide(x) {
  const g = x.salesGuide || {};
  const list = (arr) => (arr || []).map((s) => `<li>${esc(s)}</li>`).join('');
  modal(`
    <div class="row between" style="align-items:flex-start"><div><div class="row wrap" style="gap:8px"><span class="badge">${x.type === 'product' ? 'Producto' : 'Servicio'}</span>${x.allNiches ? '<span class="badge" style="color:var(--lime)">Todos los nichos</span>' : ''}</div><h2 style="margin-top:8px">${esc(x.name)}</h2></div><button class="btn sm ghost" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="guide">
      <div class="callout"><b>En palabras simples:</b> ${esc(g.simple || x.oneLiner)}</div>
      <div class="grid g2" style="gap:22px">
        <div>
          ${g.howItWorks ? `<div class="section-title">Cómo funciona</div><ol class="qs">${list(g.howItWorks)}</ol>` : ''}
          ${g.example ? `<div class="section-title">Ejemplo real</div><p>${esc(g.example)}</p>` : ''}
          <div class="section-title">Qué entregamos</div><ul class="list">${list(x.deliverables)}</ul>
          <div class="section-title">Dolores que resuelve</div><ul class="list">${list(x.painPointsSolved)}</ul>
        </div>
        <div>
          <div class="section-title">Precio</div>
          <p style="margin:0"><b style="color:var(--lime);font-size:16px">${esc(priceLabel(x.pricing))}</b><br><span class="small muted">${esc(x.pricing?.model || '')} · ${esc(x.timeline || '')}</span></p>
          ${(x.pricing?.packages || []).length ? `<div class="stack" style="gap:6px;margin-top:8px">${x.pricing.packages.map((p) => `<div class="pkg"><b>${esc(p.name)}</b> <span style="color:var(--lime)">${esc(p.price)}</span><div class="small muted">${esc(p.detail)}</div></div>`).join('')}</div>` : ''}
          ${x.pricing?.notes ? `<p class="small muted">${esc(x.pricing.notes)}</p>` : ''}
          ${g.priceTalk ? `<div class="section-title">Cómo hablar del precio</div><p>${esc(g.priceTalk)}</p>` : ''}
          <div class="section-title">A quién venderle</div><p class="small" style="margin:0">${esc(x.idealCustomer?.description || '')}</p>
          <div class="section-title">Señales de que lo necesita</div><ul class="list small">${list(x.buyingSignals)}</ul>
          <div class="section-title">No venderle si…</div><ul class="list small">${list([...(x.disqualifiers || []), ...(g.redFlags || [])])}</ul>
        </div>
      </div>
      ${g.qualifyingQuestions ? `<div class="section-title">Preguntas para calificar (en inglés)</div><ol class="qs">${list(g.qualifyingQuestions)}</ol>` : ''}
      <div class="section-title">Pitch (en inglés)</div>
      <div class="script" style="font-size:14px">${esc(x.pitch?.hook || '')}</div>
      <ul class="list small" style="margin-top:8px">${list(x.pitch?.valueProps)}</ul>
      ${x.pitch?.proof ? `<p class="small muted"><b>Prueba:</b> ${esc(x.pitch.proof)}</p>` : ''}
      <div class="section-title">Objeciones y respuestas</div>
      <div class="stack">${(x.objections || []).map((o) => `<div class="objection"><b>"${esc(o.objection)}"</b>${esc(o.response)}</div>`).join('')}</div>
      ${g.upsell ? `<div class="section-title">Oportunidad de venta adicional</div><p>${esc(g.upsell)}</p>` : ''}
      ${(g.glossary || []).length ? `<div class="section-title">Términos clave</div><dl class="kv small">${g.glossary.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd>`).join('')}</dl>` : ''}
    </div>`, null, { wide: true });
}

function editService(id) {
  const items = state.config.services.items;
  const x = id ? structuredClone(items.find((i) => i.id === id)) : {
    id: '', type: 'service', name: '', category: 'Applied AI', active: true, allNiches: false, oneLiner: '', description: '', deliverables: [],
    idealCustomer: { niches: [], companySize: '', description: '' }, buyingSignals: [], disqualifiers: [], painPointsSolved: [],
    pricing: { model: 'Fixed price per phase', from: 0, to: 0, currency: 'USD', notes: '' }, timeline: '', roi: '',
    pitch: { hook: '', valueProps: [], proof: '' }, objections: [], keywords: [], salesGuide: {},
  };
  const lines = (a) => (a || []).join('\n');
  const field = (label, idf, value, type = 'text', help = '') => `<div class="field"><label>${label}</label>${type === 'area' ? `<textarea class="input" id="${idf}">${esc(value ?? '')}</textarea>` : `<input class="input" id="${idf}" type="${type}" value="${attr(value ?? '')}"/>`}${help ? `<div class="help">${help}</div>` : ''}</div>`;
  const g = x.salesGuide || {};
  modal(`
    <h2>${id ? 'Editar' : 'Nuevo'} servicio / producto</h2>
    <div class="stack" style="gap:14px">
      <div class="grid g2">
        ${field('Nombre', 's-name', x.name)}
        ${field('Id (sin espacios)', 's-id', x.id, 'text', 'Ej: ai-jewelry-design-studio')}
      </div>
      <div class="grid g3">
        <div class="field"><label>Tipo</label><select class="input" id="s-type"><option value="service" ${x.type === 'service' ? 'selected' : ''}>Servicio</option><option value="product" ${x.type === 'product' ? 'selected' : ''}>Producto</option></select></div>
        ${field('Categoría', 's-cat', x.category)}
        <div class="stack" style="gap:6px;margin-top:22px"><label class="check"><input type="checkbox" id="s-active" ${x.active !== false ? 'checked' : ''}/> Activo</label><label class="check"><input type="checkbox" id="s-all" ${x.allNiches ? 'checked' : ''}/> Aplica a todos los nichos</label></div>
      </div>
      ${field('Resumen en una frase (inglés)', 's-one', x.oneLiner)}
      ${field('Descripción completa', 's-desc', x.description, 'area')}
      <div class="field"><label>Nichos objetivo</label><div class="chips" id="s-niches">${state.config.niches.items.map((n) => `<span class="chip ${x.idealCustomer.niches.includes(n.id) ? 'on' : ''}" data-n="${attr(n.id)}">${esc(n.name)}</span>`).join('')}</div></div>
      <div class="grid g2">
        ${field('Tamaño de empresa ideal', 's-size', x.idealCustomer.companySize)}
        ${field('Plazo de entrega', 's-time', x.timeline)}
      </div>
      ${field('Cliente ideal (descripción)', 's-icp', x.idealCustomer.description, 'area')}
      ${field('Señales de compra (una por línea)', 's-signals', lines(x.buyingSignals), 'area', 'Lo que la IA busca para saber que el negocio lo necesita.')}
      ${field('Descalificadores (uno por línea)', 's-disq', lines(x.disqualifiers), 'area')}
      ${field('Dolores que resuelve (uno por línea)', 's-pains', lines(x.painPointsSolved), 'area')}
      <div class="grid g3">
        ${field('Modelo de precio', 's-pmodel', x.pricing.model)}
        ${field('Desde (USD)', 's-pfrom', x.pricing.from, 'number')}
        ${field('Hasta (USD)', 's-pto', x.pricing.to, 'number')}
      </div>
      <div class="grid g2">
        ${field('Mensualidad desde (USD, opcional)', 's-mfrom', x.pricing.monthly?.from ?? '', 'number')}
        ${field('Mensualidad hasta (USD, opcional)', 's-mto', x.pricing.monthly?.to ?? '', 'number')}
      </div>
      ${field('Notas de precio', 's-pnotes', x.pricing.notes)}
      ${field('Argumento de ROI', 's-roi', x.roi, 'area')}
      ${field('Hook del pitch (inglés)', 's-hook', x.pitch.hook, 'area')}
      ${field('Propuestas de valor (inglés, una por línea)', 's-vp', lines(x.pitch.valueProps), 'area')}
      ${field('Prueba / demo', 's-proof', x.pitch.proof)}
      ${field('Objeciones (formato: objeción || respuesta, una por línea)', 's-obj', (x.objections || []).map((o) => `${o.objection} || ${o.response}`).join('\n'), 'area')}
      <div class="section-title">Guía de ventas para el equipo (español)</div>
      ${field('En palabras simples', 'g-simple', g.simple, 'area')}
      ${field('Cómo funciona (un paso por línea)', 'g-how', lines(g.howItWorks), 'area')}
      ${field('Ejemplo real', 'g-example', g.example, 'area')}
      ${field('Preguntas para calificar (inglés, una por línea)', 'g-qq', lines(g.qualifyingQuestions), 'area')}
      ${field('Cómo hablar del precio', 'g-price', g.priceTalk, 'area')}
      ${field('Palabras clave de búsqueda (separadas por coma)', 's-kw', (x.keywords || []).join(', '))}
      <div class="row between">
        ${id ? `<button class="btn ghost danger" id="s-del">${icon('trash')} Eliminar</button>` : '<span></span>'}
        <div class="row"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="s-save">${icon('save')} Guardar</button></div>
      </div>
    </div>`, (m, close) => {
    const v = (s) => m.querySelector(s).value.trim();
    const ls = (s) => v(s).split('\n').map((t) => t.trim()).filter(Boolean);
    m.querySelector('#s-niches').addEventListener('click', (e) => e.target.closest('[data-n]')?.classList.toggle('on'));
    m.querySelector('#s-name').addEventListener('input', (e) => {
      if (!id) m.querySelector('#s-id').value = e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });
    m.querySelector('#s-save').addEventListener('click', async () => {
      const mFrom = Number(v('#s-mfrom')); const mTo = Number(v('#s-mto'));
      const pricing = { ...x.pricing, model: v('#s-pmodel'), from: Number(v('#s-pfrom')) || 0, to: Number(v('#s-pto')) || 0, notes: v('#s-pnotes') };
      if (mFrom || mTo) pricing.monthly = { from: mFrom || 0, to: mTo || mFrom || 0 }; else delete pricing.monthly;
      const next = {
        ...x, id: v('#s-id'), name: v('#s-name'), type: v('#s-type'), category: v('#s-cat'), active: m.querySelector('#s-active').checked, allNiches: m.querySelector('#s-all').checked,
        oneLiner: v('#s-one'), description: v('#s-desc'), timeline: v('#s-time'), roi: v('#s-roi'),
        idealCustomer: { niches: [...m.querySelectorAll('#s-niches .on')].map((c) => c.dataset.n), companySize: v('#s-size'), description: v('#s-icp') },
        buyingSignals: ls('#s-signals'), disqualifiers: ls('#s-disq'), painPointsSolved: ls('#s-pains'), pricing,
        pitch: { ...x.pitch, hook: v('#s-hook'), valueProps: ls('#s-vp'), proof: v('#s-proof') },
        objections: ls('#s-obj').map((l) => { const [o, r = ''] = l.split('||'); return { objection: o.trim(), response: r.trim() }; }),
        keywords: v('#s-kw').split(',').map((k) => k.trim()).filter(Boolean),
        salesGuide: { ...g, simple: v('#g-simple'), howItWorks: ls('#g-how'), example: v('#g-example'), qualifyingQuestions: ls('#g-qq'), priceTalk: v('#g-price') },
      };
      if (!next.id || !next.name) { toast('Nombre e id son obligatorios', true); return; }
      const data = structuredClone(state.config.services);
      const idx = data.items.findIndex((i) => i.id === id);
      if (idx >= 0) data.items[idx] = next; else data.items.push(next);
      if (await saveConfig('services', data, 'Catálogo guardado')) { close(); catalog(); }
    });
    m.querySelector('#s-del')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este servicio? Si solo quieres pausarlo, desmarca "Activo".')) return;
      const data = structuredClone(state.config.services);
      data.items = data.items.filter((i) => i.id !== id);
      if (await saveConfig('services', data, 'Servicio eliminado')) { close(); catalog(); }
    });
  }, { wide: true });
}

async function saveConfig(name, data, msg) {
  try {
    await api(`/api/config/${name}`, { method: 'PUT', body: data });
    state.config[name] = data;
    if (['scoring', 'niches'].includes(name)) await refreshLeads();
    toast(msg);
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

// ---------- Configuración ----------
async function settingsPage() {
  const s = state.settings;
  const team = state.config.team.members || [];
  const sys = state.system || {};
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  view.innerHTML = `
    ${head('Configuración', 'Tu perfil personaliza los guiones y correos. El territorio define dónde busca la IA por defecto.')}
    <div class="grid g2" style="align-items:start">
      <div class="card stack" style="gap:14px">
        <h3>${icon('users')} Tu perfil</h3>
        <div class="field"><label>¿Quién eres?</label><select class="input" id="s-member"><option value="">Selecciona…</option>${team.map((m) => `<option value="${attr(m.id)}" ${s.workerId === m.id ? 'selected' : ''}>${esc(m.name)} (${esc(m.id)})</option>`).join('')}<option value="__other" ${s.workerId && !team.some((m) => m.id === s.workerId) ? 'selected' : ''}>Otro…</option></select>
          <input class="input" id="s-wid" placeholder="Tu id (ej. maria)" value="${attr(s.workerId)}" style="display:${s.workerId && !team.some((m) => m.id === s.workerId) ? 'block' : 'none'}"/></div>
        <div class="field"><label>Nombre (se usa en llamadas y correos)</label><input class="input" id="s-name" value="${attr(s.repName)}" placeholder="Ej: Maria Gomez"/></div>
        <div class="grid g2">
          <div class="field"><label>Correo de trabajo</label><input class="input" id="s-email" type="email" value="${attr(s.repEmail)}" placeholder="maria@devleck.com"/></div>
          <div class="field"><label>Teléfono / WhatsApp</label><input class="input" id="s-phone" value="${attr(s.repPhone)}"/></div>
        </div>
        <div class="field"><label>Territorio por defecto</label><div class="chips" id="s-states">${US_STATES.map((st) => `<span class="chip ${(s.defaultStates || []).includes(st) ? 'on' : ''}" data-st="${st}">${st}</span>`).join('')}</div><div class="help">Si lo dejas vacío se usa el territorio asignado en config/team.json.</div></div>
        <div class="grid g2">
          <div class="field"><label>Leads por búsqueda</label><input class="input" id="s-count" type="number" min="3" max="30" value="${attr(s.defaultLeadCount)}"/></div>
          <div class="field"><label>Modelo de Claude</label><select class="input" id="s-model">${[['', 'Por defecto de tu cuenta'], ['opus', 'Opus (máxima calidad)'], ['sonnet', 'Sonnet (más rápido)']].map(([v, l]) => `<option value="${v}" ${s.model === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <label class="check"><input type="checkbox" id="s-phonereq" ${s.requirePhone ? 'checked' : ''}/> Solo guardar leads con teléfono</label>
        <label class="check"><input type="checkbox" id="s-chains" ${s.excludeChains ? 'checked' : ''}/> Excluir cadenas nacionales</label>
        <label class="check"><input type="checkbox" id="s-admin" ${s.isAdmin ? 'checked' : ''}/> Soy administrador (puedo editar catálogo, nichos y puntaje)</label>
        <div><button class="btn primary" id="s-save">${icon('save')} Guardar perfil</button></div>
      </div>
      <div class="stack">
        <div class="card stack">
          <h3>${icon('bell')} Recordatorios</h3>
          <p class="small muted" style="margin:0">Con la herramienta abierta, te avisamos cuando llega la hora de un seguimiento o una tarea. Activa las notificaciones de escritorio para verlas aunque estés en otra ventana.</p>
          <div class="row">${notif === 'granted' ? '<span class="small open-now">● Notificaciones de escritorio activas</span>' : notif === 'unsupported' ? '<span class="small dim">Tu navegador no soporta notificaciones.</span>' : `<button class="btn" id="s-notif">${icon('bell')} Activar notificaciones</button>`}</div>
        </div>
        <div class="card stack">
          <h3>${icon('refresh')} Herramienta</h3>
          <dl class="kv small">
            <dt>Versión</dt><dd>v${esc(sys.version)} ${sys.git?.commit ? `<span class="dim">· ${esc(sys.git.commit)}</span>` : ''}</dd>
            <dt>Claude Code</dt><dd>${sys.claude?.installed ? `<span class="open-now">● ${esc(sys.claude.version)}</span>` : '<span style="color:var(--red)">No encontrado</span>'}</dd>
            <dt>Node.js</dt><dd>${esc(sys.node)}</dd>
            <dt>Repositorio</dt><dd>${sys.git?.repo ? (sys.git.upstream ? esc(sys.git.upstream) : 'Sin remoto configurado') : 'No es un repositorio git'}</dd>
            <dt>Tus datos</dt><dd class="muted">Tus leads y notas viven solo en tu computador (carpeta workspace/) y nunca se borran al actualizar. Se guarda una copia diaria en workspace/backups/.</dd>
          </dl>
          <div id="upd"></div>
          <div class="row"><button class="btn" id="s-check">${icon('refresh')} Buscar actualizaciones</button></div>
        </div>
        ${s.isAdmin ? scoringCard() : ''}
      </div>
    </div>`;
  const $ = (q) => view.querySelector(q);
  const states = new Set(s.defaultStates || []);
  $('#s-notif')?.addEventListener('click', async () => { await enableNotifications(); settingsPage(); });
  $('#s-states').addEventListener('click', (e) => { const st = e.target.closest('[data-st]')?.dataset.st; if (!st) return; states.has(st) ? states.delete(st) : states.add(st); e.target.classList.toggle('on'); });
  $('#s-member').addEventListener('change', (e) => {
    const m = team.find((x) => x.id === e.target.value);
    $('#s-wid').style.display = e.target.value === '__other' ? 'block' : 'none';
    if (m) { $('#s-wid').value = m.id; if (!$('#s-name').value) $('#s-name').value = m.name; if (!$('#s-email').value) $('#s-email').value = m.email || ''; }
  });
  $('#s-save').addEventListener('click', async () => {
    const memberVal = $('#s-member').value;
    const workerId = (memberVal && memberVal !== '__other' ? memberVal : $('#s-wid').value).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!workerId || !$('#s-name').value.trim()) { toast('Elige quién eres y escribe tu nombre', true); return; }
    try {
      state.settings = await api('/api/settings', { method: 'PUT', body: {
        workerId, repName: $('#s-name').value.trim(), repEmail: $('#s-email').value.trim(), repPhone: $('#s-phone').value.trim(),
        defaultStates: [...states], defaultLeadCount: Number($('#s-count').value) || 10, model: $('#s-model').value,
        requirePhone: $('#s-phonereq').checked, excludeChains: $('#s-chains').checked, isAdmin: $('#s-admin').checked,
      } });
      toast('Perfil guardado');
      settingsPage();
      renderNav();
    } catch (err) { toast(err.message, true); }
  });
  const showUpdate = (sysInfo) => {
    const g = sysInfo.git || {};
    $('#upd').innerHTML = !g.upstream ? '' : g.behind
      ? `<div class="callout"><b>${g.behind} actualización(es) disponible(s)</b><ul class="list small" style="margin-top:6px">${(g.incoming || []).map((c) => `<li class="mono">${esc(c)}</li>`).join('')}</ul><p class="small muted" style="margin:6px 0 0">Tus leads, notas y configuración personal no se tocan.</p><button class="btn primary sm" id="s-pull" style="margin-top:10px">${icon('download')} Actualizar ahora</button></div>`
      : '<div class="small open-now">✓ Tienes la última versión</div>';
    $('#s-pull')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api('/api/system/update', { method: 'POST' });
        modal(`<h2>Actualizada ✓</h2><p>La herramienta se actualizó y tus leads quedaron intactos. Para aplicar los cambios, cierra la ventana negra del servidor (o Ctrl+C) y vuelve a abrir <span class="mono">iniciar.bat</span> (o <span class="mono">npm start</span>).</p><div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>Entendido</button></div>`);
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    });
  };
  showUpdate(sys);
  $('#s-check').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { state.system = await api('/api/system?fetch=1'); showUpdate(state.system); renderNav(); if (!state.system.git?.upstream) toast('Esta copia no tiene repositorio remoto configurado', true); } catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  });
  if (s.isAdmin) bindScoring();
}

function scoringCard() {
  const sc = state.config.scoring;
  const labels = { fit: 'Encaje', need: 'Necesidad', reachability: 'Contactabilidad', budget: 'Presupuesto', timing: 'Momento' };
  return `<div class="card stack">
    <h3>${icon('activity')} Pesos de la calidad del lead <span class="right badge">Admin</span></h3>
    ${Object.entries(sc.weights).map(([k, w]) => `<div class="field"><label>${labels[k] || k}: <span style="color:var(--lime)" id="w-${k}-v">${Math.round(w * 100)}%</span></label><input type="range" class="range" min="0" max="60" value="${Math.round(w * 100)}" data-w="${k}"/></div>`).join('')}
    <div class="grid g2">
      <div class="field"><label>Tier A desde</label><input class="input" type="number" id="t-a" value="${sc.tiers.A}"/></div>
      <div class="field"><label>Tier B desde</label><input class="input" type="number" id="t-b" value="${sc.tiers.B}"/></div>
    </div>
    <div><button class="btn" id="w-save">${icon('save')} Guardar y re-puntuar</button></div>
  </div>`;
}
function bindScoring() {
  view.querySelectorAll('[data-w]').forEach((r) => r.addEventListener('input', () => { view.querySelector(`#w-${r.dataset.w}-v`).textContent = `${r.value}%`; }));
  view.querySelector('#w-save').addEventListener('click', async () => {
    const data = structuredClone(state.config.scoring);
    view.querySelectorAll('[data-w]').forEach((r) => { data.weights[r.dataset.w] = Number(r.value) / 100; });
    data.tiers = { A: Number(view.querySelector('#t-a').value), B: Number(view.querySelector('#t-b').value) };
    await saveConfig('scoring', data, 'Pesos guardados y leads re-puntuados');
  });
}

// ---------- Recordatorios ----------
async function enableNotifications() {
  if (!('Notification' in window)) { toast('Tu navegador no soporta notificaciones', true); return; }
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Notificaciones de escritorio activadas ✓' : 'No se activaron las notificaciones', p !== 'granted');
}

const notified = new Set(JSON.parse(sessionStorage.getItem('devleck-notified') || '[]'));
// ?quiet=1 silencia los avisos emergentes (útil al compartir pantalla en una reunión).
const QUIET = new URLSearchParams(location.search).has('quiet');
function checkReminders() {
  if (QUIET) return;
  const now = Date.now();
  for (const { lead, task } of agendaItems()) {
    if (!task.due) continue;
    const due = new Date(task.due).getTime();
    const key = `${lead.id}:${task.id}:${task.due}`;
    // Avisar desde 5 minutos antes hasta 2 horas después de la hora programada, una sola vez.
    if (due - now > 5 * 60e3 || now - due > 2 * 3600e3 || notified.has(key)) continue;
    notified.add(key);
    const msg = `⏰ ${task.title} — ${lead.business.name}`;
    toast(msg, false, { action: 'Abrir', onAction: () => openLead(lead.id, route), sticky: true });
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('Devleck · Recordatorio', { body: `${task.title}\n${lead.business.name} (${lead.business.city}, ${lead.business.state})`, icon: '/favicon.png', tag: key });
      n.onclick = () => { window.focus(); openLead(lead.id, route); n.close(); };
    }
  }
  try { sessionStorage.setItem('devleck-notified', JSON.stringify([...notified].slice(-300))); } catch { /* almacenamiento no disponible */ }
}

// ---------- Arranque ----------
async function boot() {
  try {
    const data = await api('/api/bootstrap');
    Object.assign(state, { config: data.config, settings: data.settings, statuses: data.statuses, insights: data.insights, pipeline: data.pipeline });
    await refreshLeads();
    state.runs = await api('/api/runs');
  } catch (err) {
    view.innerHTML = `<div class="callout err">No se pudo conectar con el servidor local: ${esc(err.message)}. ¿Está corriendo <span class="mono">npm start</span>?</div>`;
    return;
  }
  window.addEventListener('hashchange', () => { closeLead(); route(); });
  await route();
  checkReminders();
  api('/api/system').then((sys) => { state.system = sys; renderNav(); if (location.hash.startsWith('#/settings')) route(); }).catch(() => {});
  // Recordatorios cada minuto y refresco ligero de datos (leads nuevos desde el chat de Claude Code, búsquedas en curso).
  setInterval(checkReminders, 60e3);
  setInterval(async () => {
    if (document.hidden || document.querySelector('.modal-backdrop') || document.querySelector('.drawer')) return;
    const before = JSON.stringify(state.leads.map((l) => [l.id, l.updatedAt]));
    await refreshLeads().catch(() => {});
    state.runs = await api('/api/runs').catch(() => state.runs);
    renderNav();
    const changed = before !== JSON.stringify(state.leads.map((l) => [l.id, l.updatedAt]));
    if (changed && ['', '#/', '#/agenda', '#/queue', '#/leads', '#/pipeline'].includes(location.hash)) route();
  }, 30000);
}

boot();
