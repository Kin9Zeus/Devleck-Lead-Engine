// Ficha de lead: todo lo que el vendedor necesita para llamar, escribir y registrar el resultado.
import {
  state, STATUS, api, esc, attr, icon, tierBadge, statusPill, localPill, fill, copy, toast, mailto, money, dealRange,
  serviceName, nicheName, fmtDateTime, timeAgo, leadById, modal,
} from './lib.js';

let current = { id: null, tab: 'script', onChange: null };

const OUTCOMES = [
  { key: 'no_answer', label: 'No contestó', status: 'attempted', log: 'Llamada sin respuesta', retryHours: 24 },
  { key: 'voicemail', label: 'Dejé buzón de voz', status: 'attempted', log: 'Dejé mensaje de voz', retryHours: 48, email: true },
  { key: 'gatekeeper', label: 'Filtro / no está el decisor', status: 'callback', log: 'Habló con recepción; decisor no disponible', retryHours: 24 },
  { key: 'callback', label: 'Pidió volver a llamar', status: 'callback', log: 'Pidió que volvamos a llamar', schedule: true },
  { key: 'interested', label: 'Interesado — enviar info', status: 'contacted', log: 'Conversación positiva; pidió información', email: true, retryHours: 72 },
  { key: 'meeting', label: 'Reunión agendada', status: 'meeting', log: 'Reunión agendada', schedule: true },
  { key: 'not_interested', label: 'No interesado', status: 'lost', log: 'No interesado' },
  { key: 'not_fit', label: 'No califica', status: 'not_fit', log: 'No califica' },
  { key: 'wrong_number', label: 'Número equivocado', status: 'attempted', log: 'Número equivocado / fuera de servicio' },
  { key: 'dnc', label: 'Pidió no ser contactado', status: 'dnc', log: 'Pidió no volver a ser contactado' },
];

export function openLead(id, onChange) {
  current = { id, tab: current.id === id ? current.tab : 'script', onChange };
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
  } catch (err) {
    toast(err.message, true);
  }
}

function phoneButtons(lead) {
  return lead.contacts.phones.slice(0, 3).map((p, i) => `
    <a class="btn ${i === 0 ? 'call' : ''}" href="tel:${attr(p.number)}" data-act="call" data-num="${attr(p.display)}" title="${attr(p.label)}${p.person ? ' · ' + attr(p.person) : ''}">
      ${icon('phone')} ${esc(p.display)}<span class="small" style="opacity:.7">${p.label !== 'main' ? esc(p.label) : ''}</span>
    </a>`).join('');
}

function bestEmail(lead) {
  return lead.contacts.emails.find((e) => e.confidence !== 'pattern') || lead.contacts.emails[0];
}

function header(lead) {
  const b = lead.business;
  const email = bestEmail(lead);
  const links = [
    b.website && `<a class="btn sm ghost" href="${attr(b.website)}" target="_blank" rel="noopener">${icon('globe')} Web</a>`,
    b.googleMapsUrl && `<a class="btn sm ghost" href="${attr(b.googleMapsUrl)}" target="_blank" rel="noopener">${icon('map')} Maps</a>`,
    !b.googleMapsUrl && `<a class="btn sm ghost" href="https://www.google.com/maps/search/${encodeURIComponent(`${b.name} ${b.city} ${b.state}`)}" target="_blank" rel="noopener">${icon('map')} Maps</a>`,
    b.socials?.linkedin && `<a class="btn sm ghost" href="${attr(b.socials.linkedin)}" target="_blank" rel="noopener">${icon('linkedin')}</a>`,
    b.socials?.instagram && `<a class="btn sm ghost" href="${attr(b.socials.instagram)}" target="_blank" rel="noopener">${icon('instagram')}</a>`,
    b.socials?.facebook && `<a class="btn sm ghost" href="${attr(b.socials.facebook)}" target="_blank" rel="noopener">${icon('facebook')}</a>`,
  ].filter(Boolean).join('');
  const dm = lead.contacts.decisionMakers[0];
  return `
    <div class="drawer-head">
      <div class="row between" style="align-items:flex-start">
        <div class="row" style="align-items:flex-start;gap:14px">
          ${tierBadge(lead)}
          <div>
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
          <button class="btn sm ghost" data-act="star" title="Marcar como favorito">${icon('star')}${lead.starred ? ' ★' : ''}</button>
          <button class="btn sm ghost" data-act="close" aria-label="Cerrar">${icon('x')}</button>
        </div>
      </div>
      <div class="row wrap" style="margin-top:12px;gap:8px">
        ${statusPill(lead.status)}
        <span class="badge">${icon('box')} ${esc(serviceName(lead.recommendation.serviceId))}</span>
        <span class="badge">Trato estimado ${esc(dealRange(lead.recommendation.estimatedDeal))}</span>
        <span class="badge mono">${lead.score}/100</span>
        ${dm ? `<span class="badge">Pedir por: <b style="color:var(--text)">${esc(dm.name)}</b>${dm.title ? ` · ${esc(dm.title)}` : ''}</span>` : ''}
        ${lead.nextActionAt ? `<span class="badge" style="color:var(--amber)">${icon('clock')} ${esc(fmtDateTime(lead.nextActionAt))}</span>` : ''}
      </div>
      <div class="contact-bar">
        ${phoneButtons(lead) || '<span class="badge" style="color:var(--red)">Sin teléfono</span>'}
        ${email ? `<a class="btn" href="${attr(mailto(email.email, lead.outreach.email.subject, lead.outreach.email.body))}" data-act="email">${icon('mail')} ${esc(email.email)}</a>` : ''}
        ${links}
      </div>
      <div class="tabs" role="tablist">
        ${[['script', 'Guion de llamada'], ['email', 'Correos'], ['analysis', 'Análisis'], ['contacts', 'Contactos'], ['track', 'Seguimiento']]
          .map(([k, l]) => `<button class="tab ${current.tab === k ? 'on' : ''}" data-tab="${k}" role="tab">${l}${k === 'track' && lead.notes.length ? ` (${lead.notes.length})` : ''}</button>`).join('')}
      </div>
    </div>`;
}

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
    <div class="script">${esc(fill(o.callOpener))}<button class="btn sm ghost copy" data-copy="${attr(fill(o.callOpener))}">${icon('copy')}</button></div>

    <div class="section-title">Preguntas de descubrimiento</div>
    <ol class="qs">${o.discoveryQuestions.map((q) => `<li>${esc(fill(q))}</li>`).join('') || '<li class="muted">—</li>'}</ol>

    <div class="section-title">Por qué le sirve (para tu argumento)</div>
    <p style="margin:0">${esc(lead.recommendation.why)}</p>
    ${lead.recommendation.roi ? `<p class="muted" style="margin:8px 0 0"><b style="color:var(--text)">ROI:</b> ${esc(lead.recommendation.roi)}</p>` : ''}

    <div class="section-title">Objeciones probables</div>
    <div class="stack">
      ${[...o.objections, ...(svc?.objections || []).slice(0, 2)].map((x) => `<div class="objection"><b>"${esc(x.objection)}"</b>${esc(fill(x.response))}</div>`).join('') || '<span class="muted">—</span>'}
    </div>

    ${o.voicemail ? `<div class="section-title">Buzón de voz</div><div class="script" style="border-left-color:var(--amber)">${esc(fill(o.voicemail))}<button class="btn sm ghost copy" data-copy="${attr(fill(o.voicemail))}">${icon('copy')}</button></div>` : ''}

    <div class="section-title">Objetivo de la llamada</div>
    <p class="muted" style="margin:0">${esc(state.config.company.callGoal || '')} ${esc(state.config.company.pricingGuidance?.freeOffer ? '· ' + state.config.company.pricingGuidance.freeOffer : '')}</p>

    <div class="section-title">Registrar resultado</div>
    ${outcomeButtons()}
  `;
}

function outcomeButtons() {
  return `<div class="outcomes">${OUTCOMES.map((o) => `<button class="btn sm" data-outcome="${o.key}">${esc(o.label)}</button>`).join('')}</div>`;
}

function emailBlock(title, to, mail) {
  if (!mail?.body) return '';
  return `
    <div class="section-title">${esc(title)}</div>
    <div class="card" style="padding:16px">
      <div class="row between"><div><span class="dim small">Asunto</span><div style="font-weight:600">${esc(fill(mail.subject))}</div></div>
        <div class="row">
          <button class="btn sm" data-copy="${attr(fill(mail.subject) + '\n\n' + fill(mail.body))}">${icon('copy')} Copiar</button>
          ${to ? `<a class="btn sm primary" href="${attr(mailto(to, mail.subject, mail.body))}" data-act="email">${icon('mail')} Abrir en correo</a>` : ''}
        </div>
      </div>
      <div style="white-space:pre-wrap;margin-top:14px;line-height:1.65">${esc(fill(mail.body))}</div>
    </div>`;
}

function emailTab(lead) {
  const email = bestEmail(lead);
  return `
    ${!email ? '<div class="callout warn">Este lead no tiene correo. Usa “Preparar con IA” para intentar encontrarlo.</div>' : ''}
    ${email?.confidence === 'pattern' ? '<div class="callout warn">Ojo: el correo es deducido (patrón), no se vio publicado. Confírmalo en la llamada.</div>' : ''}
    ${emailBlock('Primer correo (o después del buzón de voz)', email?.email, lead.outreach.email)}
    ${emailBlock('Seguimiento (3 días después sin respuesta)', email?.email, lead.outreach.followUpEmail)}
    <p class="small dim" style="margin-top:14px">Los correos incluyen pie de baja (CAN-SPAM). Si el contacto pide no recibir más correos, márcalo como “No contactar”.</p>`;
}

function analysisTab(lead) {
  const a = lead.analysis;
  const dims = [['fit', 'Encaje'], ['need', 'Necesidad'], ['reachability', 'Contactabilidad'], ['budget', 'Presupuesto'], ['timing', 'Momento']];
  const b = lead.business;
  return `
    <div class="grid g2">
      <div>
        <div class="section-title">Resumen</div>
        <p style="margin:0">${esc(a.summary || b.description || '—')}</p>
        <div class="section-title">Dolores detectados</div>
        <ul class="list">${a.painPoints.map((p) => `<li>${esc(p)}</li>`).join('') || '<li class="muted">—</li>'}</ul>
        ${a.websiteIssues.length ? `<div class="section-title">Problemas de su web</div><ul class="list">${a.websiteIssues.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      </div>
      <div>
        <div class="section-title">Puntaje ${lead.score}/100 · Tier ${esc(lead.tier)}</div>
        <div class="bars">${dims.map(([k, l]) => `<div class="bar"><span class="muted">${l}</span><div class="track"><div class="fill" style="width:${lead.scores[k] * 10}%"></div></div><span class="mono small">${lead.scores[k]}</span></div>`).join('')}</div>
        ${lead.breakdown?.length ? `<div class="small dim" style="margin-top:10px">${lead.breakdown.map(esc).join(' · ')}</div>` : ''}
        ${lead.scoreNotes ? `<p class="small muted">${esc(lead.scoreNotes)}</p>` : ''}
        <div class="section-title">Ficha</div>
        <dl class="kv small">
          <dt>Nicho</dt><dd>${esc(nicheName(b.niche))}</dd>
          <dt>Madurez digital</dt><dd>${esc({ low: 'Baja', medium: 'Media', high: 'Alta' }[a.digitalMaturity] || '—')}</dd>
          ${b.employees ? `<dt>Empleados</dt><dd>${esc(b.employees)}</dd>` : ''}
          ${b.yearsInBusiness ? `<dt>Años operando</dt><dd>${esc(b.yearsInBusiness)}</dd>` : ''}
          ${b.locations ? `<dt>Sedes</dt><dd>${esc(b.locations)}</dd>` : ''}
          ${a.currentTools.length ? `<dt>Herramientas</dt><dd>${a.currentTools.map(esc).join(', ')}</dd>` : ''}
          <dt>Dirección</dt><dd>${esc([b.address, b.city, b.state, b.zip].filter(Boolean).join(', ') || '—')}</dd>
          <dt>Otros servicios</dt><dd>${lead.recommendation.secondaryServiceIds.map((id) => esc(serviceName(id))).join(', ') || '—'}</dd>
        </dl>
      </div>
    </div>
    <div class="section-title">Señales de compra (evidencia)</div>
    <div>${a.signals.map((s) => `<div class="signal"><span class="badge">${esc(s.type)}</span><div>${esc(s.detail)}${s.source ? `<br><a class="src" href="${attr(s.source)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : ''}</div></div>`).join('') || '<span class="muted">Sin señales registradas</span>'}</div>
    ${lead.sources.length ? `<div class="section-title">Fuentes consultadas</div><div class="stack" style="gap:4px">${lead.sources.map((s) => `<a class="src" href="${attr(s)}" target="_blank" rel="noopener">${esc(s)}</a>`).join('')}</div>` : ''}`;
}

function contactsTab(lead) {
  const c = lead.contacts;
  const conf = { verified: ['Verificado', 'var(--green)'], listed: ['Directorio', 'var(--amber)'], pattern: ['Deducido', 'var(--red)'] };
  return `
    <div class="section-title">Decisores</div>
    ${c.decisionMakers.map((d) => `<div class="card" style="padding:14px;margin-bottom:8px"><div class="row between"><div><b>${esc(d.name)}</b> <span class="muted">${esc(d.title)}</span></div><div class="row">
      ${d.phone ? `<a class="btn sm call" href="tel:${attr(d.phone)}">${icon('phone')} ${esc(d.phone)}</a>` : ''}
      ${d.email ? `<a class="btn sm" href="${attr(mailto(d.email, lead.outreach.email.subject, lead.outreach.email.body))}">${icon('mail')} ${esc(d.email)}</a>` : ''}
      ${d.linkedin ? `<a class="btn sm ghost" href="${attr(d.linkedin)}" target="_blank" rel="noopener">${icon('linkedin')}</a>` : ''}
    </div></div>${d.source ? `<a class="src" href="${attr(d.source)}" target="_blank" rel="noopener">${esc(d.source)}</a>` : ''}</div>`).join('') || '<p class="muted">No identificado. Pregunta en la llamada: “Who handles decisions about operations/technology?”</p>'}
    <div class="section-title">Teléfonos</div>
    <div class="table-wrap"><table><tbody>${c.phones.map((p) => `<tr><td><a href="tel:${attr(p.number)}" class="mono">${esc(p.display)}</a></td><td>${esc(p.label)}${p.person ? ` · ${esc(p.person)}` : ''}</td><td class="small">${p.source ? `<a class="src" href="${attr(p.source)}" target="_blank" rel="noopener">${esc(p.source)}</a>` : '<span class="dim">sin fuente</span>'}</td><td><button class="btn sm ghost" data-copy="${attr(p.display)}">${icon('copy')}</button></td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</tbody></table></div>
    <div class="section-title">Correos</div>
    <div class="table-wrap"><table><tbody>${c.emails.map((e) => `<tr><td class="mono">${esc(e.email)}</td><td><span class="small" style="color:${conf[e.confidence][1]}">● ${conf[e.confidence][0]}</span>${e.generic ? ' <span class="badge">genérico</span>' : ''}${e.person ? ` · ${esc(e.person)}` : ''}</td><td class="small">${e.source ? `<a class="src" href="${attr(e.source)}" target="_blank" rel="noopener">${esc(e.source)}</a>` : ''}</td><td><button class="btn sm ghost" data-copy="${attr(e.email)}">${icon('copy')}</button></td></tr>`).join('') || '<tr><td class="muted">—</td></tr>'}</tbody></table></div>`;
}

function trackTab(lead) {
  return `
    <div class="grid g2">
      <div class="field"><label>Estado</label>
        <select class="input" data-act="status">${state.statuses.map((s) => `<option value="${s}" ${s === lead.status ? 'selected' : ''}>${esc(STATUS[s])}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Próxima acción</label>
        <div class="row"><input class="input" type="datetime-local" data-act="next" value="${lead.nextActionAt ? attr(toLocalInput(lead.nextActionAt)) : ''}" />
        ${lead.nextActionAt ? `<button class="btn sm ghost" data-act="clear-next" title="Quitar">${icon('x')}</button>` : ''}</div>
      </div>
    </div>
    <div class="section-title">Resultado de llamada</div>
    ${outcomeButtons()}
    <div class="section-title">Nueva nota</div>
    <textarea class="input" data-act="note-text" placeholder="Qué dijo, con quién hablaste, próximos pasos…"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary sm" data-act="add-note">${icon('plus')} Guardar nota</button></div>
    ${lead.notes.length ? `<div class="section-title">Notas</div><div class="stack">${[...lead.notes].reverse().map((n) => `<div class="card" style="padding:12px 14px"><div class="small dim">${esc(n.by)} · ${esc(fmtDateTime(n.at))}</div><div style="white-space:pre-wrap;margin-top:4px">${esc(n.text)}</div></div>`).join('')}</div>` : ''}
    <div class="section-title">Actividad</div>
    <div class="timeline">${[...lead.activity].reverse().map((a) => `<div class="tl ${esc(a.type)}"><span class="dot"></span><div><div>${esc(a.text)}</div><div class="small dim">${esc(timeAgo(a.at))}${a.by ? ` · ${esc(a.by)}` : ''}</div></div></div>`).join('')}</div>
    <div class="section-title">IA</div>
    <div class="row wrap">
      <button class="btn" data-act="prep">${icon('sparkles')} Preparar llamada con IA</button>
      <button class="btn ghost" data-act="prep-copy">${icon('copy')} Copiar comando para Claude Code</button>
      <button class="btn ghost danger" data-act="delete">${icon('trash')} Eliminar lead</button>
    </div>`;
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function render() {
  const lead = leadById(current.id);
  const root = document.getElementById('drawer-root');
  if (!lead) { closeLead(); return; }
  const body = { script: scriptTab, email: emailTab, analysis: analysisTab, contacts: contactsTab, track: trackTab }[current.tab](lead);
  const scroll = root.querySelector('.drawer-body')?.scrollTop || 0;
  const sameLead = root.dataset.lead === lead.id;
  root.dataset.lead = lead.id;
  root.innerHTML = `<div class="drawer-backdrop" data-act="close"></div><aside class="drawer" role="dialog" aria-label="${attr(lead.business.name)}">${header(lead)}<div class="drawer-body">${body}</div></aside>`;
  if (sameLead) root.querySelector('.drawer-body').scrollTop = scroll;
  document.removeEventListener('keydown', onKey);
  document.addEventListener('keydown', onKey);
  root.querySelector('.drawer').addEventListener('click', handleClick);
  root.querySelector('.drawer-backdrop').addEventListener('click', closeLead);
  root.querySelector('[data-act="status"]')?.addEventListener('change', (e) => patch({ status: e.target.value }, 'Estado actualizado'));
  root.querySelector('[data-act="next"]')?.addEventListener('change', (e) => patch({ nextActionAt: e.target.value ? new Date(e.target.value).toISOString() : null }, 'Próxima acción guardada'));
}

function handleClick(e) {
  const el = e.target.closest('[data-act],[data-tab],[data-copy],[data-outcome]');
  if (!el) return;
  const lead = leadById(current.id);
  if (el.dataset.tab) { current.tab = el.dataset.tab; render(); return; }
  if (el.dataset.copy !== undefined) { copy(el.dataset.copy); return; }
  if (el.dataset.outcome) { recordOutcome(lead, OUTCOMES.find((o) => o.key === el.dataset.outcome)); return; }
  switch (el.dataset.act) {
    case 'close': closeLead(); break;
    case 'star': patch({ starred: !lead.starred }); break;
    case 'call': patch({ logCall: `Llamada a ${el.dataset.num}` }); break; // el enlace tel: sigue su curso
    case 'email': patch({ logEmail: 'Correo abierto en el cliente de correo' }); break;
    case 'clear-next': patch({ nextActionAt: null }); break;
    case 'add-note': {
      const text = document.querySelector('[data-act="note-text"]').value.trim();
      if (text) patch({ note: text }, 'Nota guardada');
      break;
    }
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
  modal(`
    <h2>${esc(o.label)}</h2>
    <div class="stack">
      <div class="field"><label>Nota (opcional)</label><textarea class="input" id="oc-note" placeholder="Detalles de la conversación…"></textarea></div>
      ${needsDate || suggested ? `<div class="field"><label>${needsDate ? (o.key === 'meeting' ? 'Fecha de la reunión' : 'Volver a llamar el') : 'Siguiente intento (sugerido)'}</label>
        <input class="input" type="datetime-local" id="oc-date" value="${suggested ? attr(toLocalInput(suggested.toISOString())) : ''}" /></div>` : ''}
      ${o.email ? '<div class="callout">Siguiente paso recomendado: envía el correo preparado (pestaña Correos).</div>' : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="oc-save">${icon('check')} Guardar</button></div>
    </div>`, (m, close) => {
    m.querySelector('#oc-save').addEventListener('click', () => {
      const note = m.querySelector('#oc-note').value.trim();
      const date = m.querySelector('#oc-date')?.value;
      if (needsDate && !date) { toast('Indica la fecha', true); return; }
      close();
      patch({
        status: o.status,
        outcome: o.label,
        logCall: o.log,
        note: note || undefined,
        nextActionAt: ['lost', 'not_fit', 'dnc'].includes(o.status) ? null : date ? new Date(date).toISOString() : lead.nextActionAt,
      }, `Registrado: ${o.label}`);
      if (o.email) current.tab = 'email';
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
