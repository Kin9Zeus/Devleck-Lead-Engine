// Ficha de lead: todo lo que el vendedor necesita para llamar, escribir, decidir el siguiente paso y registrar lo que pasó.
import {
  state, STATUS, STATUS_COLOR, GROUPS, INTEREST, PRIORITY, FOLLOWUP, api, esc, attr, icon, tierBadge, statusPill, localPill, fill, copy, toast,
  mailto, dealRange, serviceName, nicheName, fmtDateTime, timeAgo, whenLabel, toLocalInput, leadById, modal, closenessMeter, priorityChip,
  followUpChip, US_STATES,
} from './lib.js';

let current = { id: null, tab: 'summary', onChange: null };

const OUTCOMES = [
  { key: 'no_answer', label: 'No contestó', status: 'attempted', log: 'Llamada sin respuesta', retryHours: 24 },
  { key: 'voicemail', label: 'Dejé buzón de voz', status: 'attempted', log: 'Dejé mensaje de voz', retryHours: 48, email: true },
  { key: 'gatekeeper', label: 'Filtro / no está el decisor', status: 'callback', log: 'Habló con recepción; decisor no disponible', retryHours: 24 },
  { key: 'callback', label: 'Pidió volver a llamar', status: 'callback', log: 'Pidió que volvamos a llamar', schedule: true },
  { key: 'interested', label: 'Interesado — enviar info', status: 'contacted', log: 'Conversación positiva; pidió información', email: true, retryHours: 72, interest: 3 },
  { key: 'meeting', label: 'Reunión agendada', status: 'meeting', log: 'Reunión agendada', schedule: true, interest: 4 },
  { key: 'proposal', label: 'Propuesta enviada', status: 'proposal', log: 'Propuesta enviada', retryHours: 72, interest: 4 },
  { key: 'won', label: 'Cerró — ganado', status: 'won', log: 'Venta cerrada', interest: 5 },
  { key: 'not_interested', label: 'No interesado', status: 'lost', log: 'No interesado', interest: 1 },
  { key: 'not_fit', label: 'No califica', status: 'not_fit', log: 'No califica' },
  { key: 'wrong_number', label: 'Número equivocado', status: 'attempted', log: 'Número equivocado / fuera de servicio' },
  { key: 'dnc', label: 'Pidió no ser contactado', status: 'dnc', log: 'Pidió no volver a ser contactado' },
];

const TABS = [['summary', 'Resumen'], ['script', 'Guion'], ['email', 'Correos'], ['contacts', 'Contactos'], ['analysis', 'Análisis'], ['activity', 'Notas y actividad']];

export function openLead(id, onChange, tab) {
  current = { id, tab: TABS.some(([k]) => k === tab) ? tab : current.id === id ? current.tab : 'summary', onChange };
  render();
}

export function closeLead() {
  document.getElementById('drawer-root').innerHTML = '';
  document.removeEventListener('keydown', onKey);
  current.id = null;
}

function onKey(e) {
  if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) closeLead();
}

async function patch(body, msg) {
  try {
    const updated = await api(`/api/leads/${current.id}`, { method: 'PATCH', body });
    const i = state.leads.findIndex((l) => l.id === updated.id);
    if (i >= 0) state.leads[i] = updated;
    if (msg) toast(msg);
    render();
    current.onChange?.();
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

const bestEmail = (lead) => lead.contacts.emails.find((e) => e.confidence !== 'pattern') || lead.contacts.emails[0];

// ---------- Cabecera ----------
function stageStepper(lead) {
  const steps = GROUPS.filter((g) => g.id !== 'closed');
  const idx = steps.findIndex((g) => g.statuses.includes(lead.status));
  const closed = ['lost', 'not_fit', 'dnc'].includes(lead.status);
  return `<div class="stepper${closed ? ' is-closed' : ''}" title="Etapa del embudo">
    ${steps.map((g, i) => `<button class="step ${i < idx ? 'done' : ''} ${i === idx ? 'now' : ''}" style="--c:${g.color}" data-stage="${g.statuses[0]}" title="Mover a: ${attr(g.label)}"><i></i><span>${esc(g.label)}</span></button>`).join('')}
    ${closed ? statusPill(lead.status) : ''}
  </div>`;
}

function interestPicker(lead) {
  return `<div class="interest" role="group" aria-label="Nivel de interés">
    <span class="label">Interés</span>
    ${INTEREST.slice(1).map((i) => `<button class="lvl ${lead.interest === i.level ? 'on' : ''}" style="--c:${i.color}" data-interest="${i.level}" title="${attr(`${i.label}: ${i.hint}`)}">${i.level}<span>${esc(i.label)}</span></button>`).join('')}
  </div>`;
}

function header(lead) {
  const b = lead.business;
  const email = bestEmail(lead);
  const links = [
    b.website && `<a class="btn sm ghost" href="${attr(b.website)}" target="_blank" rel="noopener">${icon('globe')} Web</a>`,
    `<a class="btn sm ghost" href="${attr(b.googleMapsUrl || `https://www.google.com/maps/search/${encodeURIComponent(`${b.name} ${b.city} ${b.state}`)}`)}" target="_blank" rel="noopener">${icon('map')} Maps</a>`,
    b.socials?.linkedin && `<a class="btn sm ghost" href="${attr(b.socials.linkedin)}" target="_blank" rel="noopener" aria-label="LinkedIn">${icon('linkedin')}</a>`,
    b.socials?.instagram && `<a class="btn sm ghost" href="${attr(b.socials.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>`,
    b.socials?.facebook && `<a class="btn sm ghost" href="${attr(b.socials.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${icon('facebook')}</a>`,
  ].filter(Boolean).join('');
  const dm = lead.contacts.decisionMakers[0];
  const phones = lead.contacts.phones.slice(0, 2).map((p, i) => `
    <a class="btn ${i === 0 ? 'call' : ''}" href="tel:${attr(p.number)}" data-act="call" data-num="${attr(p.display)}" title="${attr(p.label)}${p.person ? ` · ${attr(p.person)}` : ''}">
      ${icon('phone')} ${esc(p.display)}${p.label !== 'main' ? `<span class="small" style="opacity:.7">${esc(p.label)}</span>` : ''}
    </a>`).join('');
  return `
    <div class="drawer-head">
      <div class="row between" style="align-items:flex-start">
        <div class="row" style="align-items:flex-start;gap:14px;min-width:0">
          ${tierBadge(lead)}
          <div style="min-width:0">
            <h2>${esc(b.name)}</h2>
            <div class="muted small row wrap" style="gap:8px;margin-top:4px">
              <span>${esc(b.category || nicheName(b.niche))}</span><span class="dim">·</span>
              <span>${esc([b.city, b.state].filter(Boolean).join(', '))}</span><span class="dim">·</span>
              ${localPill(lead)}
              ${b.rating ? `<span class="dim">·</span><span>★ ${esc(b.rating)}${b.reviewCount ? ` (${esc(b.reviewCount)})` : ''}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="row">
          <button class="btn sm ghost" data-act="star" title="${lead.starred ? 'Quitar de favoritos' : 'Marcar como favorito'}" aria-pressed="${!!lead.starred}" ${lead.starred ? 'style="color:var(--lime)"' : ''}>${lead.starred ? '★' : icon('star')}</button>
          <button class="btn sm ghost" data-act="close" aria-label="Cerrar">${icon('x')}</button>
        </div>
      </div>
      ${stageStepper(lead)}
      <div class="head-grid">
        <div class="head-cell"><span class="label">Cercanía al sí</span>${closenessMeter(lead)}</div>
        ${interestPicker(lead)}
      </div>
      <div class="row wrap" style="gap:8px;margin-top:10px">
        <span class="badge">${icon('box')} ${esc(serviceName(lead.recommendation.serviceId))}</span>
        <span class="badge">Trato ${esc(dealRange(lead.recommendation.estimatedDeal))}</span>
        ${dm ? `<span class="badge">${icon('person')} <b style="color:var(--text)">${esc(dm.name)}</b>${dm.title ? ` · ${esc(dm.title)}` : ''}</span>` : '<span class="badge" style="color:var(--amber)">Decisor sin identificar</span>'}
        ${followUpChip(lead) || '<span class="badge dim">Sin seguimiento programado</span>'}
      </div>
      <div class="contact-bar">
        ${phones || '<span class="badge" style="color:var(--red)">Sin teléfono</span>'}
        ${email ? `<a class="btn" href="${attr(mailto(email.email, lead.outreach.email.subject, lead.outreach.email.body))}" data-act="email">${icon('mail')} ${esc(email.email)}</a>` : ''}
        ${links}
      </div>
      <div class="tabs" role="tablist">
        ${TABS.map(([k, l]) => {
          const count = k === 'summary' ? lead.tasksOpen.length : k === 'activity' ? lead.notes.length : 0;
          return `<button class="tab ${current.tab === k ? 'on' : ''}" data-tab="${k}" role="tab">${l}${count ? ` <span class="tab-count">${count}</span>` : ''}</button>`;
        }).join('')}
      </div>
    </div>`;
}

// ---------- Resumen: tareas, seguimiento, notas y resultado ----------
function summaryTab(lead) {
  const pinned = lead.notes.filter((n) => n.pinned);
  const recent = [...lead.notes].filter((n) => !n.pinned).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 3);
  const quick = [['+1h', 1], ['Mañana 9:00', 'tomorrow'], ['+3 días', 72], ['+1 semana', 168]];
  return `
    <div class="grid g2" style="align-items:start;gap:18px">
      <div>
        <div class="section-title">${icon('checklist')} Próximos pasos <span class="dim small" style="text-transform:none;letter-spacing:0">por prioridad</span></div>
        <div class="tasks">
          ${lead.tasksOpen.map((t) => `
            <div class="task" style="--c:${PRIORITY[t.priority].color}">
              ${t.kind === 'manual' ? `<button class="task-check" data-complete="${attr(t.id)}" title="Marcar como hecha"></button>` : `<span class="task-auto" title="Tarea sugerida: desaparece sola cuando se cumple">${icon('sparkles')}</span>`}
              <div class="task-body"><div>${esc(t.title)}</div>
                <div class="row small" style="gap:8px;margin-top:3px">${priorityChip(t.priority)}${t.due ? `<span class="dim">${icon('clock')} ${esc(whenLabel(t.due))}</span>` : ''}${t.kind === 'manual' ? `<span class="dim">manual${t.createdBy ? ` · ${esc(t.createdBy)}` : ''}</span>` : ''}</div>
              </div>
              ${t.kind === 'manual' ? `<button class="btn sm ghost" data-del-task="${attr(t.id)}" aria-label="Eliminar tarea">${icon('x')}</button>` : ''}
            </div>`).join('') || '<p class="muted small">Nada pendiente. ¡Bien!</p>'}
        </div>
        <form class="task-form" data-form="task">
          <input class="input" name="title" placeholder="Nueva tarea (ej. enviar caso de éxito)" required />
          <select class="input" name="priority">${Object.entries(PRIORITY).map(([k, p]) => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
          <input class="input" type="datetime-local" name="due" title="Fecha límite (opcional)" />
          <button class="btn sm primary" type="submit">${icon('plus')}</button>
        </form>
        ${lead.tasks.some((t) => t.done) ? `<details class="small" style="margin-top:8px"><summary class="muted" style="cursor:pointer">Completadas (${lead.tasks.filter((t) => t.done).length})</summary>
          ${lead.tasks.filter((t) => t.done).map((t) => `<div class="row" style="gap:8px;padding:4px 0"><button class="btn sm ghost" data-reopen="${attr(t.id)}" title="Reabrir">${icon('check')}</button><s class="dim">${esc(t.title)}</s></div>`).join('')}</details>` : ''}

        <div class="section-title">${icon('bell')} Seguimiento</div>
        <div class="fu-box" style="--c:${FOLLOWUP[lead.followUp]?.color || 'var(--line-2)'}">
          <div class="row between wrap">
            <div>${lead.nextActionAt ? `<b>${esc(whenLabel(lead.nextActionAt))}</b> <span class="small" style="color:var(--c)">· ${esc(FOLLOWUP[lead.followUp]?.label || '')}</span><div class="small dim">${esc(fmtDateTime(lead.nextActionAt))}</div>` : '<span class="muted">Sin seguimiento programado</span>'}</div>
            ${lead.nextActionAt ? `<button class="btn sm ghost" data-act="clear-next">${icon('x')} Quitar</button>` : ''}
          </div>
          <div class="row wrap" style="gap:6px;margin-top:10px">
            ${quick.map(([l, v]) => `<button class="btn sm" data-quick="${v}">${l}</button>`).join('')}
            <input class="input" type="datetime-local" data-act="next" value="${lead.nextActionAt ? attr(toLocalInput(lead.nextActionAt)) : ''}" style="max-width:210px;min-height:30px;padding:3px 8px" />
          </div>
        </div>
      </div>

      <div>
        <div class="section-title">${icon('note')} Notas <span class="dim small" style="text-transform:none;letter-spacing:0">${lead.notes.length}</span></div>
        <form data-form="note">
          <textarea class="input" name="note" placeholder="Qué dijo, con quién hablaste, objeciones, próximos pasos…" style="min-height:74px"></textarea>
          <div class="row between" style="margin-top:6px"><label class="check small"><input type="checkbox" name="pinned" /> Fijar arriba</label><button class="btn sm primary" type="submit">${icon('plus')} Guardar nota</button></div>
        </form>
        <div class="stack" style="margin-top:10px;gap:8px">
          ${[...pinned, ...recent].map(noteCard).join('') || '<p class="muted small">Aún no hay notas.</p>'}
          ${lead.notes.length > pinned.length + recent.length ? `<button class="btn sm ghost" data-tab="activity">Ver todas las notas (${lead.notes.length}) →</button>` : ''}
        </div>
      </div>
    </div>

    <div class="section-title">${icon('phone')} Registrar resultado de la llamada</div>
    ${outcomeButtons()}`;
}

function noteCard(n) {
  return `<div class="note-card${n.pinned ? ' pinned' : ''}">
    <div class="row between small"><span class="dim">${n.pinned ? `${icon('pin')} ` : ''}${esc(n.by || '')} · ${esc(fmtDateTime(n.at))}</span>
      <span class="row" style="gap:2px"><button class="btn sm ghost" data-pin="${attr(n.id)}" data-pinned="${n.pinned ? 1 : 0}" title="${n.pinned ? 'Desfijar' : 'Fijar arriba'}">${icon('pin')}</button><button class="btn sm ghost" data-del-note="${attr(n.id)}" title="Eliminar nota">${icon('trash')}</button></span></div>
    <div style="white-space:pre-wrap;margin-top:4px">${esc(n.text)}</div></div>`;
}

function outcomeButtons() {
  return `<div class="outcomes">${OUTCOMES.map((o) => `<button class="btn sm outcome" style="--c:${STATUS_COLOR[o.status]}" data-outcome="${o.key}">${esc(o.label)}</button>`).join('')}</div>`;
}

// ---------- Guion y correos ----------
function scriptTab(lead) {
  const o = lead.outreach;
  const svc = state.config.services.items.find((s) => s.id === lead.recommendation.serviceId);
  const niche = state.config.niches.items.find((n) => n.id === lead.business.niche);
  return `
    <div class="callout" style="margin-bottom:18px">
      <b>Ángulo:</b> ${esc(lead.recommendation.angle || svc?.oneLiner || '')}
      ${niche?.bestTimeToCall ? `<div class="small muted" style="margin-top:6px">${icon('clock')} Mejor momento para llamar: ${esc(niche.bestTimeToCall)}</div>` : ''}
    </div>
    <div class="section-title">Apertura (primeros 20 segundos)</div>
    <div class="script">${esc(fill(o.callOpener)) || '<span class="muted">Sin guion todavía: usa "Preparar llamada con IA".</span>'}${o.callOpener ? `<button class="btn sm ghost copy" data-copy="${attr(fill(o.callOpener))}">${icon('copy')}</button>` : ''}</div>
    <div class="section-title">Preguntas de descubrimiento</div>
    <ol class="qs">${(o.discoveryQuestions || []).map((q) => `<li>${esc(fill(q))}</li>`).join('') || (svc?.salesGuide?.qualifyingQuestions || []).map((q) => `<li>${esc(q)}</li>`).join('') || '<li class="muted">—</li>'}</ol>
    <div class="section-title">Por qué le sirve (para tu argumento)</div>
    <p style="margin:0">${esc(lead.recommendation.why)}</p>
    ${lead.recommendation.roi ? `<p class="muted" style="margin:8px 0 0"><b style="color:var(--text)">ROI:</b> ${esc(lead.recommendation.roi)}</p>` : ''}
    ${svc?.salesGuide?.priceTalk ? `<p class="muted" style="margin:8px 0 0"><b style="color:var(--text)">Cómo hablar del precio:</b> ${esc(svc.salesGuide.priceTalk)}</p>` : ''}
    <div class="section-title">Objeciones probables</div>
    <div class="stack">
      ${[...(o.objections || []), ...(svc?.objections || []).slice(0, 2)].map((x) => `<div class="objection"><b>"${esc(x.objection)}"</b>${esc(fill(x.response))}</div>`).join('') || '<span class="muted">—</span>'}
    </div>
    ${o.voicemail ? `<div class="section-title">Buzón de voz</div><div class="script" style="border-left-color:var(--amber)">${esc(fill(o.voicemail))}<button class="btn sm ghost copy" data-copy="${attr(fill(o.voicemail))}">${icon('copy')}</button></div>` : ''}
    <div class="section-title">Objetivo de la llamada</div>
    <p class="muted" style="margin:0">${esc(state.config.company.callGoal || '')} ${esc(state.config.company.pricingGuidance?.freeOffer ? `· ${state.config.company.pricingGuidance.freeOffer}` : '')}</p>
    <div class="section-title">Registrar resultado</div>
    ${outcomeButtons()}`;
}

function emailBlock(title, to, mail) {
  if (!mail?.body) return '';
  return `
    <div class="section-title">${esc(title)}</div>
    <div class="card" style="padding:16px">
      <div class="row between"><div><span class="dim small">Asunto</span><div style="font-weight:600">${esc(fill(mail.subject))}</div></div>
        <div class="row">
          <button class="btn sm" data-copy="${attr(`${fill(mail.subject)}\n\n${fill(mail.body)}`)}">${icon('copy')} Copiar</button>
          ${to ? `<a class="btn sm primary" href="${attr(mailto(to, mail.subject, mail.body))}" data-act="email">${icon('mail')} Abrir en correo</a>` : ''}
        </div>
      </div>
      <div style="white-space:pre-wrap;margin-top:14px;line-height:1.65">${esc(fill(mail.body))}</div>
    </div>`;
}

function emailTab(lead) {
  const email = bestEmail(lead);
  return `
    ${!email ? '<div class="callout warn">Este lead no tiene correo. Agrégalo en la pestaña Contactos si lo consigues en la llamada.</div>' : ''}
    ${email?.confidence === 'pattern' ? '<div class="callout warn">Ojo: el correo es deducido (patrón), no se vio publicado. Confírmalo en la llamada.</div>' : ''}
    ${emailBlock('Primer correo (o después del buzón de voz)', email?.email, lead.outreach.email)}
    ${emailBlock('Seguimiento (3 días después sin respuesta)', email?.email, lead.outreach.followUpEmail)}
    <p class="small dim" style="margin-top:14px">Los correos incluyen pie de baja (CAN-SPAM). Si el contacto pide no recibir más correos, márcalo como “No contactar”.</p>`;
}

// ---------- Contactos (editables) ----------
function contactsTab(lead) {
  const c = lead.contacts;
  const conf = { verified: ['Verificado', 'var(--green)'], listed: ['Directorio', 'var(--amber)'], pattern: ['Deducido', 'var(--red)'] };
  const src = (x) => (x.manual ? `<span class="badge" title="${attr(`Agregado por ${x.addedBy || '—'} · ${fmtDateTime(x.addedAt)}`)}">${icon('edit')} manual</span>` : x.source ? `<a class="src" href="${attr(x.source)}" target="_blank" rel="noopener">${esc(x.source)}</a>` : '<span class="dim">sin fuente</span>');
  return `
    <div class="row between"><div class="section-title" style="margin:0">${icon('person')} Personas y decisores</div><button class="btn sm" data-act="edit-business">${icon('edit')} Editar datos del negocio</button></div>
    <div class="stack" style="margin-top:10px;gap:8px">
      ${c.decisionMakers.map((d, i) => `<div class="card" style="padding:14px">
        <div class="row between wrap"><div><b>${esc(d.name)}</b> <span class="muted">${esc(d.title || '')}</span>${i === 0 ? ' <span class="badge" style="color:var(--lime)">principal</span>' : ''}</div>
          <div class="row">
            ${d.phone ? `<a class="btn sm call" href="tel:${attr(d.phone)}">${icon('phone')} ${esc(d.phone)}</a>` : ''}
            ${d.email ? `<a class="btn sm" href="${attr(mailto(d.email, lead.outreach.email.subject, lead.outreach.email.body))}">${icon('mail')} ${esc(d.email)}</a>` : ''}
            ${d.linkedin ? `<a class="btn sm ghost" href="${attr(d.linkedin)}" target="_blank" rel="noopener">${icon('linkedin')}</a>` : ''}
            <button class="btn sm ghost" data-edit-person="${attr(d.name)}" title="Editar">${icon('edit')}</button>
            <button class="btn sm ghost" data-remove="person" data-key="${attr(d.name)}" title="Eliminar">${icon('trash')}</button>
          </div></div>
        ${d.notes ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${esc(d.notes)}</div>` : ''}
        <div class="small" style="margin-top:4px">${src(d)}</div></div>`).join('') || '<p class="muted">No identificado. Pregunta en la llamada: “Who handles decisions about operations/technology?”</p>'}
    </div>
    <button class="btn sm" style="margin-top:8px" data-act="add-person">${icon('plus')} Agregar persona</button>

    <div class="section-title">${icon('phone')} Teléfonos</div>
    <div class="table-wrap"><table><tbody>${c.phones.map((p) => `<tr><td><a href="tel:${attr(p.number)}" class="mono">${esc(p.display)}</a></td><td>${esc(p.label)}${p.person ? ` · ${esc(p.person)}` : ''}</td><td class="small">${src(p)}</td>
      <td style="white-space:nowrap"><button class="btn sm ghost" data-copy="${attr(p.display)}">${icon('copy')}</button><button class="btn sm ghost" data-remove="phone" data-key="${attr(p.number)}" title="Eliminar">${icon('trash')}</button></td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</tbody></table></div>
    <form class="inline-form" data-form="phone">
      <input class="input" name="number" placeholder="Nuevo teléfono, ej. (512) 482-1234" required />
      <select class="input" name="label">${[['direct', 'Directo'], ['mobile', 'Celular'], ['main', 'Principal'], ['office', 'Oficina'], ['other', 'Otro']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <input class="input" name="person" placeholder="¿De quién? (opcional)" />
      <button class="btn sm primary" type="submit">${icon('plus')} Agregar</button>
    </form>

    <div class="section-title">${icon('mail')} Correos</div>
    <div class="table-wrap"><table><tbody>${c.emails.map((e) => `<tr><td class="mono">${esc(e.email)}</td><td><span class="small" style="color:${conf[e.confidence]?.[1]}">● ${conf[e.confidence]?.[0] || ''}</span>${e.generic ? ' <span class="badge">genérico</span>' : ''}${e.person ? ` · ${esc(e.person)}` : ''}</td><td class="small">${src(e)}</td>
      <td style="white-space:nowrap"><button class="btn sm ghost" data-copy="${attr(e.email)}">${icon('copy')}</button><button class="btn sm ghost" data-remove="email" data-key="${attr(e.email)}" title="Eliminar">${icon('trash')}</button></td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</tbody></table></div>
    <form class="inline-form" data-form="email">
      <input class="input" name="email" type="email" placeholder="Nuevo correo" required />
      <input class="input" name="person" placeholder="¿De quién? (opcional)" />
      <button class="btn sm primary" type="submit">${icon('plus')} Agregar</button>
    </form>
    <p class="small dim">Los datos que agregas a mano quedan marcados como "manual" y la IA nunca los sobrescribe al volver a investigar el lead.</p>`;
}

function personModal(lead, existing) {
  const p = existing || {};
  modal(`
    <h2>${existing ? 'Editar persona' : 'Agregar persona'}</h2>
    <form class="stack" id="pf">
      <div class="grid g2">
        <div class="field"><label>Nombre</label><input class="input" name="name" value="${attr(p.name || '')}" required /></div>
        <div class="field"><label>Cargo</label><input class="input" name="title" value="${attr(p.title || '')}" placeholder="Owner, Office Manager…" /></div>
        <div class="field"><label>Teléfono directo</label><input class="input" name="phone" value="${attr(p.phone || '')}" /></div>
        <div class="field"><label>Correo</label><input class="input" name="email" type="email" value="${attr(p.email || '')}" /></div>
      </div>
      <div class="field"><label>LinkedIn</label><input class="input" name="linkedin" value="${attr(p.linkedin || '')}" /></div>
      <div class="field"><label>Notas sobre esta persona</label><textarea class="input" name="notes" placeholder="Rol en la decisión, horarios, cómo le gusta que lo contacten…">${esc(p.notes || '')}</textarea></div>
      ${existing ? '' : '<label class="check"><input type="checkbox" name="primary" checked /> Es el decisor principal</label>'}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">${icon('save')} Guardar</button></div>
    </form>`, (m, close) => {
    m.querySelector('#pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const person = { ...f, primary: !!f.primary };
      const ok = await patch(existing ? { updatePerson: { ...person, originalName: existing.name } } : { addPerson: person }, existing ? 'Persona actualizada' : 'Persona agregada');
      if (ok) close();
    });
  });
}

function businessModal(lead) {
  const b = lead.business;
  const f = (label, name, value, extra = '') => `<div class="field"><label>${label}</label><input class="input" name="${name}" value="${attr(value ?? '')}" ${extra} /></div>`;
  modal(`
    <h2>Datos del negocio</h2>
    <form class="stack" id="bf">
      <div class="grid g2">
        ${f('Nombre', 'name', b.name, 'required')}
        ${f('Categoría', 'category', b.category)}
        ${f('Sitio web', 'website', b.website)}
        ${f('Google Maps (URL)', 'googleMapsUrl', b.googleMapsUrl)}
        ${f('Dirección', 'address', b.address)}
        ${f('Ciudad', 'city', b.city)}
        <div class="field"><label>Estado</label><select class="input" name="state">${US_STATES.map((s) => `<option ${s === b.state ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        ${f('Código postal', 'zip', b.zip)}
        ${f('Empleados', 'employees', b.employees, 'placeholder="ej. 10-25"')}
        ${f('Sedes', 'locations', b.locations, 'type="number" min="1"')}
        ${f('Instagram', 'instagram', b.socials?.instagram)}
        ${f('Facebook', 'facebook', b.socials?.facebook)}
        ${f('LinkedIn', 'linkedin', b.socials?.linkedin)}
      </div>
      <div class="field"><label>Descripción</label><textarea class="input" name="description">${esc(b.description || '')}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">${icon('save')} Guardar</button></div>
    </form>`, (m, close) => {
    m.querySelector('#bf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const before = { ...b, ...(b.socials || {}) };
      const changed = Object.fromEntries(Object.entries(data).filter(([k, v]) => String(before[k] ?? '') !== v));
      if (!Object.keys(changed).length) { close(); return; }
      if (await patch({ business: changed }, 'Datos actualizados')) close();
    });
  });
}

// ---------- Análisis ----------
function analysisTab(lead) {
  const a = lead.analysis || {};
  const dims = [['fit', 'Encaje'], ['need', 'Necesidad'], ['reachability', 'Contactabilidad'], ['budget', 'Presupuesto'], ['timing', 'Momento']];
  const b = lead.business;
  const list = (x) => x || [];
  return `
    <div class="grid g2">
      <div>
        <div class="section-title">Resumen</div>
        <p style="margin:0">${esc(a.summary || b.description || '—')}</p>
        <div class="section-title">Dolores detectados</div>
        <ul class="list">${list(a.painPoints).map((p) => `<li>${esc(p)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
        ${list(a.websiteIssues).length ? `<div class="section-title">Problemas de su web</div><ul class="list">${a.websiteIssues.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      </div>
      <div>
        <div class="section-title">Calidad del lead ${lead.score}/100 · Tier ${esc(lead.tier)}</div>
        <div class="bars">${dims.map(([k, l]) => `<div class="bar"><span class="muted">${l}</span><div class="track"><div class="fill" style="width:${(lead.scores?.[k] || 0) * 10}%"></div></div><span class="mono small">${lead.scores?.[k] ?? '—'}</span></div>`).join('')}</div>
        ${lead.breakdown?.length ? `<div class="small dim" style="margin-top:10px">${lead.breakdown.map(esc).join(' · ')}</div>` : ''}
        ${lead.scoreNotes ? `<p class="small muted">${esc(lead.scoreNotes)}</p>` : ''}
        <div class="section-title">Ficha</div>
        <dl class="kv small">
          <dt>Nicho</dt><dd>${esc(nicheName(b.niche))}</dd>
          <dt>Madurez digital</dt><dd>${esc({ low: 'Baja', medium: 'Media', high: 'Alta' }[a.digitalMaturity] || '—')}</dd>
          ${b.employees ? `<dt>Empleados</dt><dd>${esc(b.employees)}</dd>` : ''}
          ${b.yearsInBusiness ? `<dt>Años operando</dt><dd>${esc(b.yearsInBusiness)}</dd>` : ''}
          ${b.locations ? `<dt>Sedes</dt><dd>${esc(b.locations)}</dd>` : ''}
          ${list(a.currentTools).length ? `<dt>Herramientas</dt><dd>${a.currentTools.map(esc).join(', ')}</dd>` : ''}
          <dt>Dirección</dt><dd>${esc([b.address, b.city, b.state, b.zip].filter(Boolean).join(', ') || '—')}</dd>
          <dt>Otros servicios</dt><dd>${list(lead.recommendation.secondaryServiceIds).map((id) => esc(serviceName(id))).join(', ') || '—'}</dd>
        </dl>
      </div>
    </div>
    <div class="section-title">Señales de compra (evidencia)</div>
    <div>${list(a.signals).map((s) => `<div class="signal"><span class="badge">${esc(s.type)}</span><div>${esc(s.detail)}${s.source ? `<br><a class="src" href="${attr(s.source)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : ''}</div></div>`).join('') || '<span class="muted">Sin señales registradas</span>'}</div>
    ${list(lead.sources).length ? `<div class="section-title">Fuentes consultadas</div><div class="stack" style="gap:4px">${lead.sources.map((s) => `<a class="src" href="${attr(s)}" target="_blank" rel="noopener">${esc(s)}</a>`).join('')}</div>` : ''}`;
}

// ---------- Notas y actividad ----------
function activityTab(lead) {
  const notes = [...lead.notes].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.at).localeCompare(String(a.at)));
  return `
    <form data-form="note">
      <textarea class="input" name="note" placeholder="Nueva nota…"></textarea>
      <div class="row between" style="margin-top:6px"><label class="check small"><input type="checkbox" name="pinned" /> Fijar arriba</label><button class="btn sm primary" type="submit">${icon('plus')} Guardar nota</button></div>
    </form>
    <div class="section-title">Notas (${notes.length})</div>
    <div class="stack" style="gap:8px">${notes.map(noteCard).join('') || '<p class="muted small">Aún no hay notas.</p>'}</div>
    <div class="section-title">Actividad</div>
    <div class="timeline">${[...lead.activity].reverse().map((a) => `<div class="tl ${esc(a.type)}"><span class="dot"></span><div><div>${esc(a.text)}</div><div class="small dim">${esc(timeAgo(a.at))}${a.by ? ` · ${esc(a.by)}` : ''}</div></div></div>`).join('')}</div>
    <div class="section-title">IA y administración</div>
    <div class="row wrap">
      <button class="btn" data-act="prep">${icon('sparkles')} Preparar llamada con IA</button>
      <button class="btn ghost" data-act="prep-copy">${icon('copy')} Copiar comando para Claude Code</button>
      <button class="btn ghost danger" data-act="delete">${icon('trash')} Eliminar lead</button>
    </div>`;
}

// ---------- Render y eventos ----------
function render() {
  const lead = leadById(current.id);
  const root = document.getElementById('drawer-root');
  if (!lead) { closeLead(); return; }
  const tabs = { summary: summaryTab, script: scriptTab, email: emailTab, contacts: contactsTab, analysis: analysisTab, activity: activityTab };
  const body = (tabs[current.tab] || summaryTab)(lead);
  const scroll = root.querySelector('.drawer-body')?.scrollTop || 0;
  const sameLead = root.dataset.lead === lead.id;
  root.dataset.lead = lead.id;
  root.innerHTML = `<div class="drawer-backdrop" data-act="close"></div><aside class="drawer" role="dialog" aria-label="${attr(lead.business.name)}">${header(lead)}<div class="drawer-body">${body}</div></aside>`;
  if (sameLead) root.querySelector('.drawer-body').scrollTop = scroll;
  document.removeEventListener('keydown', onKey);
  document.addEventListener('keydown', onKey);
  const drawer = root.querySelector('.drawer');
  drawer.addEventListener('click', handleClick);
  drawer.addEventListener('submit', handleSubmit);
  root.querySelector('.drawer-backdrop').addEventListener('click', closeLead);
  root.querySelector('[data-act="next"]')?.addEventListener('change', (e) => patch({ nextActionAt: e.target.value ? new Date(e.target.value).toISOString() : null }, 'Seguimiento programado'));
}

function quickDate(v) {
  if (v === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
  return new Date(Date.now() + Number(v) * 3600e3);
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  let ok = false;
  if (kind === 'note' && f.note?.trim()) ok = await patch({ note: f.note.trim(), pinned: !!f.pinned }, 'Nota guardada');
  if (kind === 'task' && f.title?.trim()) ok = await patch({ addTask: { title: f.title.trim(), priority: f.priority, due: f.due ? new Date(f.due).toISOString() : null } }, 'Tarea agregada');
  if (kind === 'phone') ok = await patch({ addPhone: f }, 'Teléfono agregado');
  if (kind === 'email') ok = await patch({ addEmail: f }, 'Correo agregado');
  if (ok) form.reset?.();
}

function handleClick(e) {
  const el = e.target.closest('[data-act],[data-tab],[data-copy],[data-outcome],[data-stage],[data-interest],[data-quick],[data-complete],[data-reopen],[data-del-task],[data-pin],[data-del-note],[data-remove],[data-edit-person]');
  if (!el) return;
  const lead = leadById(current.id);
  const d = el.dataset;
  if (d.tab) { current.tab = d.tab; render(); return; }
  if (d.copy !== undefined) { copy(d.copy); return; }
  if (d.outcome) { recordOutcome(lead, OUTCOMES.find((o) => o.key === d.outcome)); return; }
  if (d.stage) { if (d.stage !== lead.status) patch({ status: d.stage }, `Movido a: ${STATUS[d.stage]}`); return; }
  if (d.interest) { const lvl = Number(d.interest); patch({ interest: lvl === lead.interest ? 0 : lvl }, `Interés: ${INTEREST[lvl === lead.interest ? 0 : lvl].label}`); return; }
  if (d.quick) { patch({ nextActionAt: quickDate(d.quick).toISOString() }, 'Seguimiento programado'); return; }
  if (d.complete) { patch({ completeTask: d.complete }, 'Tarea completada ✓'); return; }
  if (d.reopen) { patch({ reopenTask: d.reopen }); return; }
  if (d.delTask) { patch({ deleteTask: d.delTask }); return; }
  if (d.pin) { patch({ pinNote: { id: d.pin, pinned: d.pinned !== '1' } }); return; }
  if (d.delNote) { if (confirm('¿Eliminar esta nota?')) patch({ deleteNote: d.delNote }, 'Nota eliminada'); return; }
  if (d.remove) { if (confirm(`¿Eliminar ${d.key}?`)) patch({ removeContact: { kind: d.remove, key: d.key } }, 'Contacto eliminado'); return; }
  if (d.editPerson) { personModal(lead, lead.contacts.decisionMakers.find((x) => x.name === d.editPerson)); return; }
  switch (d.act) {
    case 'close': closeLead(); break;
    case 'star': patch({ starred: !lead.starred }); break;
    case 'call': patch({ logCall: `Llamada a ${d.num}` }); break; // el enlace tel: sigue su curso
    case 'email': patch({ logEmail: 'Correo abierto en el cliente de correo' }); break;
    case 'clear-next': patch({ nextActionAt: null }, 'Seguimiento quitado'); break;
    case 'add-person': personModal(lead); break;
    case 'edit-business': businessModal(lead); break;
    case 'prep': startPrep(lead); break;
    case 'prep-copy': copy(`/preparar-llamada ${lead.id}`, 'Comando copiado — pégalo en Claude Code'); break;
    case 'delete':
      if (confirm(`¿Eliminar "${lead.business.name}" de tu base? Si solo no califica, mejor márcalo como "No califica".`)) {
        api(`/api/leads/${lead.id}`, { method: 'DELETE' }).then(() => {
          state.leads = state.leads.filter((l) => l.id !== lead.id);
          closeLead();
          current.onChange?.();
          toast('Lead eliminado');
        }).catch((err) => toast(err.message, true));
      }
      break;
    default:
  }
}

function recordOutcome(lead, o) {
  const needsDate = o.schedule;
  const suggested = o.retryHours ? new Date(Date.now() + o.retryHours * 3600e3) : null;
  const closing = ['lost', 'not_fit', 'dnc', 'won'].includes(o.status);
  modal(`
    <h2>${esc(o.label)}</h2>
    <div class="stack">
      <div class="field"><label>Nota (recomendado)</label><textarea class="input" id="oc-note" placeholder="Qué dijo, con quién hablaste, objeciones…"></textarea></div>
      ${!closing && (needsDate || suggested) ? `<div class="field"><label>${needsDate ? (o.key === 'meeting' ? 'Fecha de la reunión' : 'Volver a llamar el') : 'Siguiente seguimiento (sugerido)'}</label>
        <input class="input" type="datetime-local" id="oc-date" value="${suggested ? attr(toLocalInput(suggested.toISOString())) : ''}" /></div>` : ''}
      ${!closing ? `<div class="field"><label>Nivel de interés</label><div class="interest" style="margin:0">${INTEREST.slice(1).map((i) => `<button type="button" class="lvl ${(o.interest || lead.interest) === i.level ? 'on' : ''}" style="--c:${i.color}" data-lvl="${i.level}" title="${attr(i.hint)}">${i.level}<span>${esc(i.label)}</span></button>`).join('')}</div></div>` : ''}
      ${o.email ? '<div class="callout">Siguiente paso recomendado: envía el correo preparado (pestaña Correos).</div>' : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="oc-save">${icon('check')} Guardar</button></div>
    </div>`, (m, close) => {
    let interest = o.interest || lead.interest || 0;
    m.querySelectorAll('[data-lvl]').forEach((b) => b.addEventListener('click', () => {
      interest = Number(b.dataset.lvl);
      m.querySelectorAll('[data-lvl]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    m.querySelector('#oc-save').addEventListener('click', async () => {
      const note = m.querySelector('#oc-note').value.trim();
      const date = m.querySelector('#oc-date')?.value;
      if (needsDate && !date) { toast('Indica la fecha', true); return; }
      close();
      await patch({
        status: o.status,
        outcome: o.label,
        logCall: o.log,
        note: note || undefined,
        interest: closing ? o.interest : interest,
        nextActionAt: closing ? null : date ? new Date(date).toISOString() : lead.nextActionAt,
      }, `Registrado: ${o.label}`);
      if (o.email) { current.tab = 'email'; render(); }
    });
  });
}

async function startPrep(lead) {
  try {
    const run = await api('/api/runs', { method: 'POST', body: { type: 'call-prep', params: { leadId: lead.id, business: lead.business.name } } });
    toast('Preparando la llamada con IA… verás el progreso en Búsquedas');
    closeLead();
    location.hash = `#/runs/${run.id}`;
  } catch (err) {
    toast(err.message, true);
  }
}
