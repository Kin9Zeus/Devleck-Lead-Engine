// Devleck Lead Engine — interfaz principal (SPA sin dependencias, rutas por hash).
import {
  state, STATUS, STATUS_COLOR, ACTIVE_STATUSES, US_STATES, api, esc, attr, icon, tierBadge, statusPill, localPill, stars,
  toast, copy, modal, download, refreshLeads, timeAgo, fmtDateTime, nicheName, serviceName, nicheById, queueRank, isQueueable,
  localInfo, initials, dealRange, fill,
} from './lib.js';
import { openLead, closeLead } from './drawer.js';

const view = document.getElementById('view');
const ui = {
  leads: { q: '', tier: '', status: 'active', niche: '', state: '', service: '', sort: 'score', dir: -1 },
  queue: { openOnly: false, niche: '' },
  prospectDraft: null,
};
let activeStream = null;
let pollTimer = null;

// ---------- Navegación ----------
const NAV = [
  ['#/', 'home', 'Panel'],
  ['#/queue', 'phone', 'Cola de llamadas', () => state.leads.filter(isQueueable).length],
  ['#/leads', 'users', 'Leads', () => state.leads.length],
  'sep',
  ['#/prospect', 'radar', 'Prospectar'],
  ['#/niches', 'trend', 'Nichos'],
  ['#/runs', 'activity', 'Búsquedas', () => state.runs.filter((r) => r.status === 'running').length || ''],
  'sep',
  ['#/catalog', 'box', 'Catálogo'],
  ['#/settings', 'settings', 'Configuración'],
];

function renderNav() {
  const hash = location.hash.split('/').slice(0, 2).join('/') || '#/';
  document.getElementById('nav').innerHTML = NAV.map((n) => {
    if (n === 'sep') return '<div class="nav-sep"></div>';
    const [href, ic, label, count] = n;
    const active = hash === href || (href !== '#/' && hash.startsWith(href));
    const c = count?.();
    return `<a class="nav-link ${active ? 'active' : ''}" href="${href}">${icon(ic)} ${label}${c ? `<span class="count">${c}</span>` : ''}</a>`;
  }).join('');
  const s = state.settings || {};
  document.getElementById('sidebar-foot').innerHTML = `
    ${s.workerId ? `<div class="me"><span class="avatar">${esc(initials(s.repName || s.workerId))}</span><div><div>${esc(s.repName || s.workerId)}</div><div class="dim small">${s.isAdmin ? 'Administrador' : 'Ventas'}</div></div></div>` : '<a href="#/settings" class="btn sm primary">Configura tu perfil</a>'}
    ${state.system?.git?.behind ? `<a href="#/settings" class="btn sm" style="border-color:var(--lime);color:var(--lime)">${icon('download')} Actualización disponible</a>` : ''}
    <div>v${esc(state.system?.version || '')}</div>`;
}

async function route() {
  if (activeStream) { activeStream.close(); activeStream = null; }
  clearInterval(pollTimer);
  const [, page = '', arg] = location.hash.replace(/^#/, '').split('/');
  renderNav();
  const pages = { '': dashboard, queue, leads: leadsPage, prospect, niches: nichesPage, runs: runsPage, catalog, settings: settingsPage };
  const fn = pages[page] || dashboard;
  try {
    await fn(arg);
  } catch (err) {
    view.innerHTML = `<div class="callout err">${esc(err.message)}</div>`;
  }
  view.focus({ preventScroll: true });
}

const head = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;

// ---------- Panel ----------
function dashboard() {
  const L = state.leads;
  const s = state.settings;
  const open = L.filter((l) => ACTIVE_STATUSES.includes(l.status));
  const tierA = L.filter((l) => l.tier === 'A' && ['new', 'attempted', 'callback'].includes(l.status));
  const due = L.filter((l) => l.nextActionAt && new Date(l.nextActionAt) <= endOfToday() && ACTIVE_STATUSES.includes(l.status));
  const meetings = L.filter((l) => l.status === 'meeting');
  const won = L.filter((l) => l.status === 'won');
  const pipelineValue = open.reduce((sum, l) => sum + (l.recommendation.estimatedDeal?.max || l.recommendation.estimatedDeal?.min || 0), 0);
  const callNow = L.filter(isQueueable).filter((l) => localInfo(l.business.timezone).open).sort((a, b) => queueRank(b) - queueRank(a)).slice(0, 6);
  const byStatus = state.statuses.map((st) => [st, L.filter((l) => l.status === st).length]).filter(([, n]) => n);
  const byNiche = countBy(L, (l) => l.business.niche).slice(0, 7);
  const byService = countBy(L, (l) => l.recommendation.serviceId).slice(0, 7);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  view.innerHTML = `
    ${head(`${hello}${s.repName ? `, <em>${esc(s.repName.split(' ')[0])}</em>` : ''}`, 'Tu resumen comercial. Prioriza la cola de llamadas: los negocios abiertos ahora con mayor puntaje van primero.',
      `<a class="btn" href="#/queue">${icon('phone')} Empezar a llamar</a><a class="btn primary" href="#/prospect">${icon('radar')} Buscar leads</a>`)}
    ${!s.workerId ? `<div class="callout warn" style="margin-bottom:16px">${icon('alert')} Configura tu perfil (nombre, correo y territorio) en <a href="#/settings">Configuración</a> para personalizar guiones y correos.</div>` : ''}
    ${state.system && !state.system.claude.installed ? `<div class="callout err" style="margin-bottom:16px">No se detectó Claude Code. Instálalo y ejecuta <span class="mono">claude</span> una vez para iniciar sesión; sin él no se pueden buscar leads.</div>` : ''}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Tier A por contactar', tierA.length, 'Los de mayor probabilidad', true)}
      ${kpi('Seguimientos hoy', due.length, 'Callbacks y próximas acciones')}
      ${kpi('Reuniones', meetings.length, `${won.length} ganados`)}
      ${kpi('Pipeline estimado', pipelineValue ? `$${Math.round(pipelineValue / 1000)}k` : '$0', `${open.length} leads activos de ${L.length}`)}
    </div>
    <div class="grid g3">
      <div class="card span2">
        <h3>${icon('phone')} Llama ahora <span class="right small dim">Abiertos en este momento (hora local del negocio)</span></h3>
        ${callNow.length ? `<div class="stack">${callNow.map((l) => miniLead(l)).join('')}</div>` : `<div class="empty"><div class="big">Nadie abierto ahora</div>${L.length ? 'Fuera de horario laboral en sus zonas. Revisa correos y seguimientos.' : 'Aún no tienes leads. Lanza tu primera búsqueda.'}</div>`}
      </div>
      <div class="card">
        <h3>${icon('calendar')} Seguimientos de hoy</h3>
        ${due.length ? `<div class="stack">${due.sort((a, b) => new Date(a.nextActionAt) - new Date(b.nextActionAt)).slice(0, 8).map((l) => `
          <div class="row between" style="cursor:pointer" data-lead="${attr(l.id)}"><div class="truncate"><b>${esc(l.business.name)}</b><div class="small dim">${esc(fmtDateTime(l.nextActionAt))}</div></div>${statusPill(l.status)}</div>`).join('')}</div>` : '<p class="muted">Sin pendientes para hoy.</p>'}
      </div>
      <div class="card span2">
        <h3>${icon('activity')} Pipeline</h3>
        ${L.length ? `<div class="pipeline">${byStatus.map(([st, n]) => `<span style="width:${(n / L.length) * 100}%;background:${STATUS_COLOR[st]}" title="${esc(STATUS[st])}: ${n}"></span>`).join('')}</div>
        <div class="legend">${byStatus.map(([st, n]) => `<span><i class="dot" style="background:${STATUS_COLOR[st]}"></i>${esc(STATUS[st])} <b style="color:var(--text)">${n}</b></span>`).join('')}</div>` : '<p class="muted">Sin datos todavía.</p>'}
        <div class="grid g2" style="margin-top:22px">
          <div><div class="label" style="margin-bottom:8px">Por nicho</div>${hbars(byNiche, nicheName, L.length)}</div>
          <div><div class="label" style="margin-bottom:8px">Por servicio recomendado</div>${hbars(byService, serviceName, L.length)}</div>
        </div>
      </div>
      <div class="card">
        <h3>${icon('trend')} Nichos recomendados</h3>
        ${topNiches(4).map((n) => `<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="truncate"><div>${esc(n.name)}</div><div class="small dim">${n.opp != null ? `Oportunidad ${n.opp}/100` : `Prioridad ${n.priority}/5`}</div></div><a class="btn sm" href="#/prospect" data-prefill-niche="${attr(n.id)}">${icon('radar')}</a></div>`).join('')}
        <a class="btn sm ghost" style="margin-top:10px" href="#/niches">Ver análisis completo →</a>
      </div>
    </div>`;
  bindLeadClicks();
  view.querySelectorAll('[data-prefill-niche]').forEach((a) => a.addEventListener('click', () => { ui.prospectDraft = { niche: a.dataset.prefillNiche }; }));
}

const kpi = (label, value, hint, accent) => `<div class="card kpi ${accent ? 'accent' : ''}"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`;
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

function countBy(list, fn) {
  const m = new Map();
  for (const x of list) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function hbars(entries, nameFn, total) {
  if (!entries.length) return '<p class="muted small">—</p>';
  const max = entries[0][1];
  return entries.map(([k, n]) => `<div class="hbar"><span class="truncate small" title="${attr(nameFn(k))}">${esc(nameFn(k))}</span><div class="track" style="height:7px;background:var(--panel-2);border-radius:9px"><div style="height:100%;width:${(n / max) * 100}%;background:var(--lime);border-radius:9px"></div></div><span class="mono small">${n}</span></div>`).join('');
}
function miniLead(l) {
  const ph = l.contacts.phones[0];
  return `<div class="row between" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px;cursor:pointer" data-lead="${attr(l.id)}">
    <div class="row" style="min-width:0">${tierBadge(l)}<div style="min-width:0"><div class="biz-name truncate">${esc(l.business.name)}</div><div class="biz-sub truncate">${esc(l.business.city)}, ${esc(l.business.state)} · ${esc(serviceName(l.recommendation.serviceId))}</div></div></div>
    <div class="row">${localPill(l)}${ph ? `<a class="btn sm call" href="tel:${attr(ph.number)}" data-stop>${icon('phone')} ${esc(ph.display)}</a>` : ''}</div></div>`;
}
function bindLeadClicks(onChange = route) {
  view.querySelectorAll('[data-lead]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
    openLead(el.dataset.lead, onChange);
  }));
}
function topNiches(n) {
  const ins = new Map((state.insights?.niches || []).map((x) => [x.id, x]));
  return (state.config.niches.items || []).filter((x) => x.active !== false)
    .map((x) => ({ ...x, opp: ins.get(x.id)?.opportunityScore ?? null }))
    .sort((a, b) => (b.opp ?? b.priority * 15) - (a.opp ?? a.priority * 15))
    .slice(0, n);
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
    ${head('Cola de <em>llamadas</em>', 'Ordenada por probabilidad de cierre, si el negocio está abierto ahora y seguimientos vencidos. Llama, registra el resultado y sigue con el siguiente.')}
    <div class="toolbar">
      <label class="check"><input type="checkbox" id="q-open" ${f.openOnly ? 'checked' : ''}/> Solo abiertos ahora</label>
      <select class="input" id="q-niche"><option value="">Todos los nichos</option>${niches.map((n) => `<option value="${attr(n)}" ${f.niche === n ? 'selected' : ''}>${esc(nicheName(n))}</option>`).join('')}</select>
      <span class="muted small" style="margin-left:auto">${list.length} por llamar</span>
    </div>
    ${list.length ? `<div class="queue">${list.slice(0, 100).map((l, i) => {
      const ph = l.contacts.phones[0];
      const dm = l.contacts.decisionMakers[0];
      const due = l.nextActionAt && new Date(l.nextActionAt) <= new Date();
      return `<div class="q-item" data-lead="${attr(l.id)}">
        <div class="row"><span class="q-rank">${i + 1}</span>${tierBadge(l)}</div>
        <div style="min-width:0"><div class="biz-name truncate">${l.starred ? '★ ' : ''}${esc(l.business.name)}</div>
          <div class="biz-sub truncate">${esc(l.business.city)}, ${esc(l.business.state)} · ${esc(nicheName(l.business.niche))}${dm ? ` · Pedir por <b style="color:var(--text)">${esc(dm.name)}</b>` : ''}</div>
          <div class="row" style="margin-top:6px;gap:6px">${statusPill(l.status)}${due ? `<span class="badge" style="color:var(--amber)">${icon('clock')} Seguimiento vencido</span>` : ''}</div></div>
        <div style="min-width:0"><div class="small" style="color:var(--lime);font-weight:600">${esc(serviceName(l.recommendation.serviceId))}</div><div class="why">${esc(l.recommendation.angle || l.recommendation.why)}</div></div>
        <div>${localPill(l)}</div>
        <div>${ph ? `<a class="btn call" href="tel:${attr(ph.number)}" data-stop data-call="${attr(l.id)}">${icon('phone')} ${esc(ph.display)}</a>` : '<span class="badge">Sin teléfono</span>'}</div>
      </div>`;
    }).join('')}</div>` : `<div class="card empty"><div class="big">Cola vacía</div>No hay leads pendientes de llamar${f.openOnly ? ' abiertos en este momento' : ''}. <a href="#/prospect">Busca nuevos leads</a>.</div>`}`;
  view.querySelector('#q-open').addEventListener('change', (e) => { f.openOnly = e.target.checked; queue(); });
  view.querySelector('#q-niche').addEventListener('change', (e) => { f.niche = e.target.value; queue(); });
  bindLeadClicks(queue);
  view.querySelectorAll('[data-call]').forEach((a) => a.addEventListener('click', () => {
    // Abre la ficha con el guion mientras suena el teléfono.
    setTimeout(() => openLead(a.dataset.call, queue), 150);
  }));
}

// ---------- Leads ----------
function filteredLeads() {
  const f = ui.leads;
  const q = f.q.toLowerCase();
  return state.leads.filter((l) => {
    if (f.tier && l.tier !== f.tier) return false;
    if (f.status === 'active' && !ACTIVE_STATUSES.includes(l.status)) return false;
    if (f.status && f.status !== 'active' && l.status !== f.status) return false;
    if (f.niche && l.business.niche !== f.niche) return false;
    if (f.state && l.business.state !== f.state) return false;
    if (f.service && l.recommendation.serviceId !== f.service) return false;
    if (q && !`${l.business.name} ${l.business.city} ${l.contacts.emails.map((e) => e.email).join(' ')} ${l.contacts.phones.map((p) => p.display).join(' ')} ${l.contacts.decisionMakers.map((d) => d.name).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const k = f.sort;
    const va = k === 'name' ? a.business.name : k === 'state' ? a.business.state : k === 'created' ? a.createdAt : k === 'status' ? a.status : a.score;
    const vb = k === 'name' ? b.business.name : k === 'state' ? b.business.state : k === 'created' ? b.createdAt : k === 'status' ? b.status : b.score;
    return (va > vb ? 1 : va < vb ? -1 : 0) * f.dir;
  });
}

function leadsPage() {
  const f = ui.leads;
  const opts = (vals, cur, label, nameFn = (x) => x) => `<option value="">${label}</option>${vals.map((v) => `<option value="${attr(v)}" ${cur === v ? 'selected' : ''}>${esc(nameFn(v))}</option>`).join('')}`;
  const uniq = (fn) => [...new Set(state.leads.map(fn).filter(Boolean))].sort();
  view.innerHTML = `
    ${head('Base de <em>leads</em>', 'Todos los negocios calificados por la IA. Haz clic en uno para ver el guion, correos, análisis y registrar el seguimiento.',
      `<button class="btn" id="export">${icon('download')} Exportar CSV</button><a class="btn primary" href="#/prospect">${icon('plus')} Buscar más</a>`)}
    <div class="toolbar">
      <input class="input search" id="f-q" placeholder="Buscar por nombre, ciudad, teléfono, correo o decisor…" value="${attr(f.q)}" />
      <select class="input" data-f="tier">${opts(['A', 'B', 'C'], f.tier, 'Tier', (t) => `Tier ${t}`)}</select>
      <select class="input" data-f="status"><option value="active" ${f.status === 'active' ? 'selected' : ''}>Activos</option><option value="" ${f.status === '' ? 'selected' : ''}>Todos los estados</option>${state.statuses.map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${esc(STATUS[s])}</option>`).join('')}</select>
      <select class="input" data-f="niche">${opts(uniq((l) => l.business.niche), f.niche, 'Nicho', nicheName)}</select>
      <select class="input" data-f="state">${opts(uniq((l) => l.business.state), f.state, 'Estado USA')}</select>
      <select class="input" data-f="service">${opts(uniq((l) => l.recommendation.serviceId), f.service, 'Servicio', serviceName)}</select>
    </div>
    <div id="leads-table"></div>`;
  renderLeadsTable();
  view.querySelector('#f-q').addEventListener('input', (e) => { f.q = e.target.value; renderLeadsTable(); });
  view.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { f[s.dataset.f] = s.value; renderLeadsTable(); }));
  view.querySelector('#export').addEventListener('click', exportCsv);
}

function renderLeadsTable() {
  const list = filteredLeads();
  const f = ui.leads;
  const th = (key, label) => `<th data-sort="${key}" class="${f.sort === key ? 'sorted' : ''}">${label}${f.sort === key ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  const el = view.querySelector('#leads-table');
  if (!state.leads.length) {
    el.innerHTML = `<div class="card empty"><div class="big">Aún no hay leads</div>Lanza una búsqueda desde <a href="#/prospect">Prospectar</a> o con <span class="mono">/prospectar</span> en Claude Code.</div>`;
    return;
  }
  el.innerHTML = `<div class="small muted" style="margin-bottom:8px">${list.length} de ${state.leads.length} leads</div>
    <div class="table-wrap"><table>
      <thead><tr>${th('score', 'Puntaje')}${th('name', 'Negocio')}<th>Contacto</th><th>Servicio a ofrecer</th>${th('state', 'Ubicación')}${th('status', 'Estado')}${th('created', 'Agregado')}</tr></thead>
      <tbody>${list.map((l) => `<tr data-lead="${attr(l.id)}">
        <td><div class="row">${tierBadge(l)}<span class="score">${l.score}</span></div></td>
        <td style="max-width:280px"><div class="biz-name truncate">${l.starred ? '★ ' : ''}${esc(l.business.name)}</div><div class="biz-sub truncate">${esc(nicheName(l.business.niche))}</div></td>
        <td><div class="mono small">${esc(l.contacts.phones[0]?.display || '—')}</div><div class="small dim truncate" style="max-width:220px">${esc(l.contacts.emails[0]?.email || '')}</div></td>
        <td style="max-width:240px"><div class="small truncate" style="color:var(--lime)">${esc(serviceName(l.recommendation.serviceId))}</div><div class="small dim">${esc(dealRange(l.recommendation.estimatedDeal))}</div></td>
        <td><div class="small">${esc(l.business.city)}, ${esc(l.business.state)}</div>${localPill(l)}</td>
        <td>${statusPill(l.status)}</td>
        <td class="small dim">${esc(timeAgo(l.createdAt))}</td>
      </tr>`).join('')}</tbody></table></div>`;
  el.querySelectorAll('[data-sort]').forEach((h) => h.addEventListener('click', () => {
    if (f.sort === h.dataset.sort) f.dir *= -1; else { f.sort = h.dataset.sort; f.dir = ['name', 'state'].includes(f.sort) ? 1 : -1; }
    renderLeadsTable();
  }));
  el.querySelectorAll('[data-lead]').forEach((r) => r.addEventListener('click', () => openLead(r.dataset.lead, renderLeadsTable)));
}

function exportCsv() {
  const rows = filteredLeads();
  const cols = [
    ['Tier', (l) => l.tier], ['Score', (l) => l.score], ['Business', (l) => l.business.name], ['Niche', (l) => nicheName(l.business.niche)],
    ['City', (l) => l.business.city], ['State', (l) => l.business.state], ['Phone', (l) => l.contacts.phones[0]?.display],
    ['Other phones', (l) => l.contacts.phones.slice(1).map((p) => p.display).join(' / ')], ['Email', (l) => l.contacts.emails[0]?.email],
    ['Email confidence', (l) => l.contacts.emails[0]?.confidence], ['Decision maker', (l) => l.contacts.decisionMakers.map((d) => `${d.name} (${d.title})`).join('; ')],
    ['Website', (l) => l.business.website], ['Service', (l) => serviceName(l.recommendation.serviceId)], ['Deal estimate', (l) => dealRange(l.recommendation.estimatedDeal)],
    ['Why', (l) => l.recommendation.why], ['Call opener', (l) => fill(l.outreach.callOpener)], ['Email subject', (l) => fill(l.outreach.email.subject)],
    ['Email body', (l) => fill(l.outreach.email.body)], ['Status', (l) => STATUS[l.status]], ['Next action', (l) => l.nextActionAt || ''], ['Lead ID', (l) => l.id],
  ];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.map(([h]) => q(h)).join(','), ...rows.map((l) => cols.map(([, fn]) => q(fn(l))).join(','))].join('\r\n');
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
  const niches = [...state.config.niches.items].filter((n) => n.active !== false).sort((a, b) => b.priority - a.priority);
  const services = state.config.services.items.filter((x) => x.active !== false);
  const ins = new Map((state.insights?.niches || []).map((x) => [x.id, x]));
  const SIGNALS = [['hiring', 'Están contratando'], ['growth', 'Crecimiento / nuevas sedes'], ['reviews', 'Quejas en reseñas'], ['website', 'Web deficiente'], ['funding', 'Financiación reciente'], ['ads', 'Invierten en publicidad']];

  view.innerHTML = `
    ${head('Buscar <em>leads</em>', 'Define el objetivo y Claude investigará la web: encuentra negocios, verifica teléfono y correo, analiza su necesidad y prepara el guion y el correo para cada uno.')}
    <div class="grid g3" style="align-items:start">
      <div class="card span2 stack" style="gap:18px">
        <div class="grid g2">
          <div class="field"><label>Nicho</label>
            <select class="input" id="p-niche"><option value="">Automático (el más prometedor)</option>
              ${niches.map((n) => `<option value="${attr(n.id)}" ${d.niche === n.id ? 'selected' : ''}>${'★'.repeat(n.priority)} ${esc(n.name)}${ins.get(n.id) ? ` · ${ins.get(n.id).opportunityScore}/100` : ''}</option>`).join('')}
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
          <li>Si vendes un producto específico (ej. AI Jewelry Design Studio) selecciónalo: la IA buscará la señal exacta.</li>
          <li>Usa "Nichos" para saber dónde está la oportunidad ahora.</li>
        </ul></div>
      </div>
    </div>`;

  const $ = (id) => view.querySelector(id);
  const side = () => {
    const nid = d.niche && d.niche !== '__custom' ? d.niche : '';
    const n = nicheById(nid);
    const i = ins.get(nid);
    const svc = state.config.services.items.find((x) => x.id === d.serviceFocus);
    $('#p-service-help').textContent = svc ? svc.oneLiner : '';
    $('#p-side').innerHTML = n ? `<h3>${icon('trend')} ${esc(n.name)}</h3>
      <div class="stack small">
        <div>${stars(n.priority)} · crecimiento ${esc(i?.growth || n.growth)}</div>
        ${i?.whyNow ? `<div><b>Por qué ahora:</b> <span class="muted">${esc(i.whyNow)}</span></div>` : ''}
        ${i?.hotMarkets?.length ? `<div><b>Mercados calientes:</b> <span class="muted">${i.hotMarkets.map(esc).join(', ')}</span></div>` : ''}
        <div><b>Servicios que encajan:</b><div class="chips" style="margin-top:6px">${(i?.bestServices?.length ? i.bestServices : n.matchingServices).map((id) => `<span class="badge">${esc(serviceName(id))}</span>`).join('')}</div></div>
        <div><b>Decisores:</b> <span class="muted">${esc((n.decisionMakers || []).join(', '))}</span></div>
        <div><b>Mejor hora:</b> <span class="muted">${esc(n.bestTimeToCall || '')}</span></div>
      </div>` : `<h3>${icon('trend')} Nichos más prometedores</h3>${topNiches(5).map((x) => `<div class="row between" style="padding:6px 0"><span class="small">${esc(x.name)}</span><button class="btn sm ghost" data-pick="${attr(x.id)}">Elegir</button></div>`).join('')}`;
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

// ---------- Nichos ----------
function nichesPage() {
  const ins = state.insights;
  const insMap = new Map((ins?.niches || []).map((x) => [x.id, x]));
  const cfg = state.config.niches.items;
  const merged = [
    ...cfg.map((n) => ({ ...n, ...(insMap.get(n.id) || {}), name: n.name, priority: n.priority, configured: true })),
    ...(ins?.niches || []).filter((x) => !cfg.some((n) => n.id === x.id)).map((x) => ({ ...x, configured: false, matchingServices: x.bestServices || [] })),
  ].filter((n) => n.active !== false)
    .sort((a, b) => (b.opportunityScore ?? b.priority * 15) - (a.opportunityScore ?? a.priority * 15));
  const isAdmin = state.settings.isAdmin;

  view.innerHTML = `
    ${head('Inteligencia de <em>nichos</em>', 'Dónde está la oportunidad en USA ahora mismo, cruzando crecimiento del mercado, dolor que resolvemos, capacidad de pago y encaje con nuestro catálogo.',
      `<button class="btn primary" id="n-run">${icon('sparkles')} Actualizar análisis con IA</button><button class="btn" id="n-copy">${icon('copy')} Comando</button>`)}
    ${ins ? `<div class="callout" style="margin-bottom:18px"><div class="row between"><b>${icon('sparkles')} Análisis de IA</b><span class="small dim">${esc(timeAgo(ins.generatedAt))}</span></div><p style="margin:8px 0 0">${esc(ins.summary)}</p></div>`
      : '<div class="callout warn" style="margin-bottom:18px">Aún no hay análisis de mercado. Mostrando las prioridades definidas por el administrador. Pulsa “Actualizar análisis con IA” (≈10–15 min).</div>'}
    <div class="grid g3">${merged.map((n) => `
      <div class="card niche">
        <div class="niche-top">
          ${n.opportunityScore != null ? `<div class="ring" style="--p:${n.opportunityScore}"><div>${n.opportunityScore}</div></div>` : ''}
          <div style="min-width:0;flex:1"><div style="font-weight:700;font-size:15px">${esc(n.name)}</div>
            <div class="small muted">${n.configured ? stars(n.priority) : '<span class="badge" style="color:var(--lime)">Nuevo nicho sugerido</span>'} · crecimiento ${esc(n.growth || '—')}</div></div>
        </div>
        ${n.whyNow ? `<p class="small" style="margin:0">${esc(n.whyNow)}</p>` : n.notes ? `<p class="small muted" style="margin:0">${esc(n.notes)}</p>` : ''}
        ${n.pitchAngle ? `<p class="small muted" style="margin:0"><b style="color:var(--text)">Ángulo:</b> ${esc(n.pitchAngle)}</p>` : ''}
        <div class="chips">${(n.bestServices?.length ? n.bestServices : n.matchingServices || []).slice(0, 3).map((id) => `<span class="badge">${esc(serviceName(id))}</span>`).join('')}</div>
        ${n.hotMarkets?.length ? `<div class="small muted">${icon('map')} ${n.hotMarkets.slice(0, 4).map(esc).join(' · ')}</div>` : ''}
        ${n.growthEvidence?.length ? `<details class="small"><summary class="muted" style="cursor:pointer">Evidencia (${n.growthEvidence.length + (n.painEvidence?.length || 0)})</summary><div class="stack" style="gap:6px;margin-top:8px">${[...n.growthEvidence, ...(n.painEvidence || [])].map((e) => `<div>${esc(e.detail)} ${e.source ? `<a class="src" href="${attr(e.source)}" target="_blank" rel="noopener">fuente</a>` : ''}</div>`).join('')}</div></details>` : ''}
        <div class="row" style="margin-top:auto">
          <button class="btn sm primary" data-prospect="${attr(n.id)}" data-custom="${n.configured ? '' : attr(n.name)}">${icon('radar')} Prospectar</button>
          ${isAdmin && n.configured ? `<select class="input" style="width:auto;min-height:30px;padding:3px 8px" data-prio="${attr(n.id)}" title="Prioridad">${[1, 2, 3, 4, 5].map((p) => `<option ${p === n.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>` : ''}
          <span class="small dim" style="margin-left:auto">${state.leads.filter((l) => l.business.niche === n.id).length} leads</span>
        </div>
      </div>`).join('')}</div>`;

  view.querySelector('#n-run').addEventListener('click', async () => {
    try {
      const run = await api('/api/runs', { method: 'POST', body: { type: 'niches', params: { discover: true } } });
      location.hash = `#/runs/${run.id}`;
    } catch (err) { toast(err.message, true); }
  });
  view.querySelector('#n-copy').addEventListener('click', () => copy('/nichos', 'Comando copiado'));
  view.querySelectorAll('[data-prospect]').forEach((b) => b.addEventListener('click', () => {
    ui.prospectDraft = b.dataset.custom ? { niche: '__custom', customNiche: b.dataset.custom } : { niche: b.dataset.prospect };
    location.hash = '#/prospect';
  }));
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
  done: '<span class="st st-won">Completada</span>', error: '<span class="st st-dnc">Error</span>',
  stopped: '<span class="st st-lost">Detenida</span>', interrupted: '<span class="st st-attempted">Interrumpida</span>',
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
  let events = run.events;
  view.innerHTML = `
    ${head(`${esc(run.label)}`, esc(paramsSummary(run)), `<span id="r-status">${runStatus(run.status)}</span>
      ${run.status === 'running' ? `<button class="btn danger" id="r-stop">${icon('stop')} Detener</button>` : ''}
      ${run.type === 'prospect' ? `<a class="btn primary" href="#/leads" id="r-leads">${icon('users')} Ver leads</a>` : run.type === 'niches' ? `<a class="btn primary" href="#/niches">${icon('trend')} Ver nichos</a>` : ''}`)}
    <div id="r-stats">${stats(run, events)}</div>
    <div class="log" id="r-log">${events.map(evHtml).join('')}${run.status === 'running' ? '<div class="ev" id="r-wait"><span class="t"></span><span class="i"><span class="pulse"></span></span><div class="m muted">Trabajando…</div></div>' : ''}</div>`;
  const log = view.querySelector('#r-log');
  log.scrollTop = log.scrollHeight;
  view.querySelector('#r-leads')?.addEventListener('click', () => { ui.leads = { ...ui.leads, status: '', sort: 'created', dir: -1 }; });
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
function catalog() {
  const isAdmin = state.settings.isAdmin;
  const items = state.config.services.items;
  view.innerHTML = `
    ${head('Catálogo de <em>servicios</em>', 'Lo que la IA puede ofrecer. Cada servicio define a quién se le vende, qué señales buscar y cómo presentarlo. La IA solo recomienda servicios activos.',
      isAdmin ? `<button class="btn primary" id="c-add">${icon('plus')} Nuevo servicio / producto</button><button class="btn" id="c-claude">${icon('sparkles')} Crear con Claude</button>` : '')}
    ${!isAdmin ? '<div class="callout" style="margin-bottom:16px">El catálogo lo administra Devleck y se actualiza con “Actualizar herramienta” en Configuración.</div>' : `<div class="callout" style="margin-bottom:16px">${icon('alert')} Después de editar, publica los cambios para el equipo:<pre class="cmd" style="margin-top:8px">git add config && git commit -m "Actualizar catálogo" && git push</pre></div>`}
    <div class="grid g2">${items.map((x) => `
      <div class="card stack" style="${x.active === false ? 'opacity:.5' : ''}">
        <div class="row between" style="align-items:flex-start">
          <div><div class="row" style="gap:8px"><span class="badge">${x.type === 'product' ? 'Producto' : 'Servicio'}</span><span class="badge">${esc(x.category || '')}</span>${x.active === false ? '<span class="badge">Inactivo</span>' : ''}</div>
            <div style="font-weight:700;font-size:16px;margin-top:8px">${esc(x.name)}</div></div>
          ${isAdmin ? `<button class="btn sm" data-edit="${attr(x.id)}">${icon('edit')} Editar</button>` : ''}
        </div>
        <p class="muted" style="margin:0">${esc(x.oneLiner)}</p>
        <dl class="kv small">
          <dt>Precio</dt><dd>${x.pricing ? `${esc(x.pricing.model)} · $${Number(x.pricing.from || 0).toLocaleString('en-US')} – $${Number(x.pricing.to || 0).toLocaleString('en-US')}` : '—'}</dd>
          <dt>Plazo</dt><dd>${esc(x.timeline || '—')}</dd>
          <dt>Cliente ideal</dt><dd>${esc(x.idealCustomer?.description || '')}</dd>
          <dt>Nichos</dt><dd>${(x.idealCustomer?.niches || []).map((n) => esc(nicheName(n))).join(', ')}</dd>
        </dl>
        <details><summary class="small muted" style="cursor:pointer">Señales, pitch y objeciones</summary>
          <div class="stack small" style="margin-top:10px">
            <div><b>Señales de compra</b><ul class="list">${(x.buyingSignals || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
            <div><b>Descalificadores</b><ul class="list">${(x.disqualifiers || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
            <div><b>Hook</b><p class="muted" style="margin:4px 0">${esc(x.pitch?.hook || '')}</p></div>
            <div><b>ROI</b><p class="muted" style="margin:4px 0">${esc(x.roi || '')}</p></div>
            ${(x.objections || []).map((o) => `<div class="objection"><b>"${esc(o.objection)}"</b>${esc(o.response)}</div>`).join('')}
          </div></details>
      </div>`).join('')}</div>`;
  if (!isAdmin) return;
  view.querySelector('#c-add').addEventListener('click', () => editService(null));
  view.querySelector('#c-claude').addEventListener('click', () => {
    modal(`<h2>Crear servicio con Claude</h2><p class="muted">Abre Claude Code en la carpeta del proyecto y escribe el comando con toda la información que tengas (descripción, precio, a quién va dirigido, enlaces). Claude investigará el mercado y completará el perfil, señales, pitch y objeciones.</p>
      <pre class="cmd">/nuevo-servicio Sistema con IA para joyerías que modela joyas en 3D con Claude + Blender/AutoCAD. Precio 4k-15k USD…</pre>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-close>Cerrar</button><button class="btn primary" id="cc">${icon('copy')} Copiar comando</button></div>`,
    (m) => m.querySelector('#cc').addEventListener('click', () => copy('/nuevo-servicio ')));
  });
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editService(b.dataset.edit)));
}

function editService(id) {
  const items = state.config.services.items;
  const x = id ? structuredClone(items.find((i) => i.id === id)) : {
    id: '', type: 'service', name: '', category: 'Applied AI', active: true, oneLiner: '', description: '', deliverables: [],
    idealCustomer: { niches: [], companySize: '', description: '' }, buyingSignals: [], disqualifiers: [], painPointsSolved: [],
    pricing: { model: 'Fixed price per phase', from: 0, to: 0, currency: 'USD', notes: '' }, timeline: '', roi: '',
    pitch: { hook: '', valueProps: [], proof: '' }, objections: [], keywords: [],
  };
  const lines = (a) => (a || []).join('\n');
  const field = (label, idf, value, type = 'text', help = '') => `<div class="field"><label>${label}</label>${type === 'area' ? `<textarea class="input" id="${idf}">${esc(value)}</textarea>` : `<input class="input" id="${idf}" type="${type}" value="${attr(value)}"/>`}${help ? `<div class="help">${help}</div>` : ''}</div>`;
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
        <label class="check" style="margin-top:22px"><input type="checkbox" id="s-active" ${x.active !== false ? 'checked' : ''}/> Activo</label>
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
      ${field('Argumento de ROI', 's-roi', x.roi, 'area')}
      ${field('Hook del pitch (inglés)', 's-hook', x.pitch.hook, 'area')}
      ${field('Propuestas de valor (inglés, una por línea)', 's-vp', lines(x.pitch.valueProps), 'area')}
      ${field('Prueba / demo', 's-proof', x.pitch.proof)}
      ${field('Objeciones (formato: objeción || respuesta, una por línea)', 's-obj', (x.objections || []).map((o) => `${o.objection} || ${o.response}`).join('\n'), 'area')}
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
      const next = {
        ...x, id: v('#s-id'), name: v('#s-name'), type: v('#s-type'), category: v('#s-cat'), active: m.querySelector('#s-active').checked,
        oneLiner: v('#s-one'), description: v('#s-desc'), timeline: v('#s-time'), roi: v('#s-roi'),
        idealCustomer: { niches: [...m.querySelectorAll('#s-niches .on')].map((c) => c.dataset.n), companySize: v('#s-size'), description: v('#s-icp') },
        buyingSignals: ls('#s-signals'), disqualifiers: ls('#s-disq'), painPointsSolved: ls('#s-pains'),
        pricing: { ...x.pricing, model: v('#s-pmodel'), from: Number(v('#s-pfrom')) || 0, to: Number(v('#s-pto')) || 0 },
        pitch: { ...x.pitch, hook: v('#s-hook'), valueProps: ls('#s-vp'), proof: v('#s-proof') },
        objections: ls('#s-obj').map((l) => { const [o, r = ''] = l.split('||'); return { objection: o.trim(), response: r.trim() }; }),
        keywords: v('#s-kw').split(',').map((k) => k.trim()).filter(Boolean),
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
  });
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
          <h3>${icon('refresh')} Herramienta</h3>
          <dl class="kv small">
            <dt>Versión</dt><dd>v${esc(sys.version)} ${sys.git?.commit ? `<span class="dim">· ${esc(sys.git.commit)}</span>` : ''}</dd>
            <dt>Claude Code</dt><dd>${sys.claude?.installed ? `<span class="open-now">● ${esc(sys.claude.version)}</span>` : '<span style="color:var(--red)">No encontrado</span>'}</dd>
            <dt>Node.js</dt><dd>${esc(sys.node)}</dd>
            <dt>Repositorio</dt><dd>${sys.git?.repo ? (sys.git.upstream ? esc(sys.git.upstream) : 'Sin remoto configurado') : 'No es un repositorio git'}</dd>
          </dl>
          <div id="upd"></div>
          <div class="row"><button class="btn" id="s-check">${icon('refresh')} Buscar actualizaciones</button></div>
        </div>
        ${s.isAdmin ? scoringCard() : ''}
      </div>
    </div>`;
  const $ = (q) => view.querySelector(q);
  const states = new Set(s.defaultStates || []);
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
      ? `<div class="callout"><b>${g.behind} actualización(es) disponible(s)</b><ul class="list small" style="margin-top:6px">${(g.incoming || []).map((c) => `<li class="mono">${esc(c)}</li>`).join('')}</ul><button class="btn primary sm" id="s-pull" style="margin-top:10px">${icon('download')} Actualizar ahora</button></div>`
      : '<div class="small open-now">✓ Tienes la última versión</div>';
    $('#s-pull')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api('/api/system/update', { method: 'POST' });
        modal(`<h2>Actualizada ✓</h2><p>La herramienta se actualizó. Para aplicar todos los cambios, cierra la ventana negra del servidor (o Ctrl+C) y vuelve a ejecutar <span class="mono">npm start</span> (o el archivo iniciar).</p><div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>Entendido</button></div>`);
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
    <h3>${icon('activity')} Pesos del puntaje <span class="right badge">Admin</span></h3>
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

// ---------- Arranque ----------
async function boot() {
  try {
    const data = await api('/api/bootstrap');
    Object.assign(state, { config: data.config, settings: data.settings, statuses: data.statuses, insights: data.insights });
    await refreshLeads();
    state.runs = await api('/api/runs');
  } catch (err) {
    view.innerHTML = `<div class="callout err">No se pudo conectar con el servidor local: ${esc(err.message)}. ¿Está corriendo <span class="mono">npm start</span>?</div>`;
    return;
  }
  window.addEventListener('hashchange', () => { closeLead(); route(); });
  await route();
  api('/api/system').then((sys) => { state.system = sys; renderNav(); if (location.hash.startsWith('#/settings') || location.hash === '' || location.hash === '#/') route(); }).catch(() => {});
  // Refresco ligero: leads nuevos desde Claude Code (chat) y búsquedas en curso.
  setInterval(async () => {
    if (document.hidden || document.querySelector('.modal-backdrop') || document.querySelector('.drawer')) return;
    const before = state.leads.length;
    await refreshLeads().catch(() => {});
    state.runs = await api('/api/runs').catch(() => state.runs);
    renderNav();
    if (state.leads.length !== before && ['', '#/', '#/queue', '#/leads'].includes(location.hash)) route();
  }, 30000);
}

boot();
