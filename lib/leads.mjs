// Validación, normalización, puntaje y deduplicación de leads.
// Claude produce los leads; este módulo es la fuente de verdad sobre qué entra a la base.
import { normalizePhone, normalizeEmail, normalizeDomain, normalizeUrl, normalizeState, slug, stateTimezone } from './normalize.mjs';

export const STATUSES = ['new', 'attempted', 'callback', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'not_fit', 'dnc'];
const SCORE_DIMS = ['fit', 'need', 'reachability', 'budget', 'timing'];
const CONFIDENCE = ['verified', 'listed', 'pattern'];
const PHONE_LABELS = ['main', 'direct', 'mobile', 'office', 'tollfree', 'other'];

const str = (v, max = 4000) => (v == null ? '' : String(v).trim().slice(0, max));
const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const strList = (v, max = 600) => arr(v).map((x) => str(typeof x === 'object' ? JSON.stringify(x) : x, max)).filter(Boolean);
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function newLeadId() {
  return `L${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Claves para detectar duplicados: dominio, teléfonos y nombre+ciudad. */
export function dedupeKeys(lead) {
  const keys = new Set();
  const domain = normalizeDomain(lead.business?.website);
  // Dominios de directorios/redes no identifican al negocio.
  if (domain && !/(facebook|instagram|yelp|google|linktr|wix|squarespace|godaddysites|business\.site)\./.test(domain + '.')) keys.add(`d:${domain}`);
  for (const p of lead.contacts?.phones || []) {
    const n = normalizePhone(p.number);
    if (n) keys.add(`p:${n.digits}`);
  }
  const nameKey = slug(lead.business?.name);
  if (nameKey) keys.add(`n:${nameKey}|${slug(lead.business?.city)}|${lead.business?.state || ''}`);
  return [...keys];
}

export function isBlocked(lead, blocklist = {}) {
  const domain = normalizeDomain(lead.business?.website);
  if (domain && (blocklist.domains || []).map(normalizeDomain).includes(domain)) return 'dominio en blocklist';
  const phones = new Set((blocklist.phones || []).map((p) => normalizePhone(p)?.digits).filter(Boolean));
  if ((lead.contacts?.phones || []).some((p) => phones.has(normalizePhone(p.number)?.digits))) return 'teléfono en blocklist';
  const names = (blocklist.names || []).map(slug).filter(Boolean);
  if (names.includes(slug(lead.business?.name))) return 'nombre en blocklist';
  return '';
}

/** Puntaje final 0-100 a partir de las sub-puntuaciones de la IA y config/scoring.json. */
export function computeScore(lead, { scoring = {}, niches = {} } = {}) {
  const weights = scoring.weights || { fit: 0.3, need: 0.25, reachability: 0.2, budget: 0.15, timing: 0.1 };
  const adj = scoring.adjustments || {};
  const totalW = SCORE_DIMS.reduce((s, d) => s + (weights[d] || 0), 0) || 1;
  let score = SCORE_DIMS.reduce((s, d) => s + (lead.scores?.[d] ?? 0) * (weights[d] || 0), 0) / totalW * 10;
  const breakdown = [];

  const niche = (niches.items || []).find((n) => n.id === lead.business?.niche);
  if (niche) {
    const delta = ((niche.priority ?? 3) - 3) * (adj.nichePriorityPointsPerLevel ?? 3);
    if (delta) { score += delta; breakdown.push(`Prioridad del nicho ${niche.priority}: ${delta > 0 ? '+' : ''}${delta}`); }
  }
  const phones = lead.contacts?.phones || [];
  const emails = lead.contacts?.emails || [];
  if (!phones.length) { score -= adj.noPhonePenalty ?? 20; breakdown.push(`Sin teléfono: -${adj.noPhonePenalty ?? 20}`); }
  if (!emails.some((e) => e.confidence !== 'pattern')) { score -= adj.noVerifiedEmailPenalty ?? 5; breakdown.push(`Sin correo verificado: -${adj.noVerifiedEmailPenalty ?? 5}`); }
  if ((lead.contacts?.decisionMakers || []).some((d) => d.name)) { score += adj.decisionMakerBonus ?? 4; breakdown.push(`Decisor identificado: +${adj.decisionMakerBonus ?? 4}`); }
  if (phones.some((p) => ['direct', 'mobile'].includes(p.label))) { score += adj.directPhoneBonus ?? 3; breakdown.push(`Teléfono directo: +${adj.directPhoneBonus ?? 3}`); }

  score = Math.round(clamp(score, 0, 100));
  const tiers = scoring.tiers || { A: 75, B: 55 };
  const tier = score >= tiers.A ? 'A' : score >= tiers.B ? 'B' : 'C';
  return { score, tier, breakdown };
}

function normalizeContacts(raw = {}, errors, warnings) {
  const phones = [];
  const seenPhones = new Set();
  for (const p of arr(raw.phones)) {
    const item = typeof p === 'string' ? { number: p } : p || {};
    const n = normalizePhone(item.number);
    if (!n) { if (item.number) warnings.push(`Teléfono descartado (no es un número válido de USA): ${item.number}`); continue; }
    if (seenPhones.has(n.digits)) continue;
    seenPhones.add(n.digits);
    if (!item.source) warnings.push(`El teléfono ${n.display} no tiene fuente (source)`);
    phones.push({
      number: n.e164, display: n.display, ext: n.ext || undefined,
      label: PHONE_LABELS.includes(item.label) ? item.label : 'main',
      person: str(item.person, 120), source: str(item.source, 500),
    });
  }
  const emails = [];
  const seenEmails = new Set();
  for (const e of arr(raw.emails)) {
    const item = typeof e === 'string' ? { email: e } : e || {};
    const n = normalizeEmail(item.email);
    if (!n) { if (item.email) warnings.push(`Correo descartado (formato inválido): ${item.email}`); continue; }
    if (seenEmails.has(n.email)) continue;
    seenEmails.add(n.email);
    let confidence = CONFIDENCE.includes(item.confidence) ? item.confidence : 'listed';
    if (!item.source && confidence !== 'pattern') { warnings.push(`El correo ${n.email} no tiene fuente; marcado como "pattern"`); confidence = 'pattern'; }
    emails.push({ email: n.email, generic: n.generic, confidence, person: str(item.person, 120), source: str(item.source, 500) });
  }
  // Primero los mejores contactos: directos y verificados.
  const phoneRank = { direct: 0, mobile: 1, main: 2, office: 3, tollfree: 4, other: 5 };
  phones.sort((a, b) => phoneRank[a.label] - phoneRank[b.label]);
  const confRank = { verified: 0, listed: 1, pattern: 2 };
  emails.sort((a, b) => confRank[a.confidence] - confRank[b.confidence] || Number(a.generic) - Number(b.generic));

  const decisionMakers = arr(raw.decisionMakers || raw.decisionMaker).map((d) => ({
    name: str(d?.name, 120), title: str(d?.title, 120), linkedin: normalizeUrl(d?.linkedin),
    phone: normalizePhone(d?.phone)?.e164 || '', email: normalizeEmail(d?.email)?.email || '', source: str(d?.source, 500),
  })).filter((d) => d.name);

  return { phones, emails, decisionMakers };
}

/**
 * Valida y normaliza un lead producido por la IA.
 * @returns {{ lead: object|null, errors: string[], warnings: string[] }}
 */
export function validateLead(raw, config, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') return { lead: null, errors: ['El lead no es un objeto JSON'], warnings };
  const services = (config.services?.items || []).filter((s) => s.active !== false);
  const nicheIds = (config.niches?.items || []).map((n) => n.id);
  const b = raw.business || {};

  const state = normalizeState(b.state);
  const business = {
    name: str(b.name, 200),
    niche: str(b.niche, 80),
    category: str(b.category, 200),
    website: normalizeUrl(b.website),
    address: str(b.address, 300),
    city: str(b.city, 120),
    state,
    zip: str(b.zip, 12),
    googleMapsUrl: normalizeUrl(b.googleMapsUrl),
    rating: num(b.rating),
    reviewCount: num(b.reviewCount),
    employees: str(b.employees, 40),
    yearsInBusiness: num(b.yearsInBusiness),
    locations: num(b.locations),
    description: str(b.description, 1500),
    socials: {
      instagram: normalizeUrl(b.socials?.instagram), facebook: normalizeUrl(b.socials?.facebook),
      linkedin: normalizeUrl(b.socials?.linkedin), other: normalizeUrl(b.socials?.other),
    },
    timezone: stateTimezone(state),
  };
  if (!business.name) errors.push('Falta business.name');
  if (!state) errors.push(`business.state inválido: "${b.state || ''}" (usa el código de 2 letras de USA, ej. TX)`);
  if (!business.city) warnings.push('Falta business.city');
  if (!business.niche) errors.push('Falta business.niche');
  else if (!nicheIds.includes(business.niche)) warnings.push(`Nicho "${business.niche}" no está en config/niches.json (se acepta como nicho personalizado)`);

  const contacts = normalizeContacts(raw.contacts, errors, warnings);
  if (!contacts.phones.length && !contacts.emails.length) errors.push('Sin teléfono ni correo válidos: el lead no es contactable');
  else if (!contacts.phones.length) {
    if (opts.requirePhone) errors.push('Sin teléfono válido (requirePhone está activo). Busca el teléfono en la web, Google Business, Yelp, BBB o Facebook.');
    else warnings.push('Sin teléfono: prioridad baja para llamadas');
  }

  const r = raw.recommendation || {};
  const service = services.find((s) => s.id === r.serviceId);
  if (!service) errors.push(`recommendation.serviceId "${r.serviceId || ''}" no existe o no está activo. Opciones: ${services.map((s) => s.id).join(', ')}`);
  const recommendation = {
    serviceId: service?.id || str(r.serviceId, 80),
    serviceName: service?.name || '',
    secondaryServiceIds: strList(r.secondaryServiceIds, 80).filter((id) => services.some((s) => s.id === id) && id !== r.serviceId),
    why: str(r.why, 2000),
    angle: str(r.angle, 1000),
    estimatedDeal: { min: num(r.estimatedDeal?.min), max: num(r.estimatedDeal?.max) },
    roi: str(r.roi, 1000),
  };
  if (!recommendation.why) errors.push('Falta recommendation.why (por qué este servicio para este negocio, con evidencia)');

  const o = raw.outreach || {};
  const outreach = {
    callOpener: str(o.callOpener, 2000),
    discoveryQuestions: strList(o.discoveryQuestions),
    objections: arr(o.objections).map((x) => ({ objection: str(x?.objection, 400), response: str(x?.response, 1200) })).filter((x) => x.objection),
    voicemail: str(o.voicemail, 1200),
    email: { subject: str(o.email?.subject, 200), body: str(o.email?.body, 5000) },
    followUpEmail: { subject: str(o.followUpEmail?.subject, 200), body: str(o.followUpEmail?.body, 5000) },
  };
  if (!outreach.callOpener) errors.push('Falta outreach.callOpener');
  if (!outreach.email.subject || !outreach.email.body) errors.push('Falta outreach.email.subject o outreach.email.body');
  if (!outreach.discoveryQuestions.length) warnings.push('Sin preguntas de descubrimiento');

  const a = raw.analysis || {};
  const analysis = {
    summary: str(a.summary, 2000),
    painPoints: strList(a.painPoints),
    signals: arr(a.signals).map((s) => (typeof s === 'string' ? { type: 'other', detail: str(s, 600), source: '' } : { type: str(s?.type, 40) || 'other', detail: str(s?.detail, 600), source: str(s?.source, 500) })).filter((s) => s.detail),
    digitalMaturity: ['low', 'medium', 'high'].includes(a.digitalMaturity) ? a.digitalMaturity : 'medium',
    currentTools: strList(a.currentTools, 120),
    websiteIssues: strList(a.websiteIssues),
  };
  if (!analysis.summary) warnings.push('Falta analysis.summary');
  if (!analysis.signals.length) warnings.push('Sin señales de compra con evidencia: el puntaje "need" debería ser bajo');

  const scores = {};
  for (const d of SCORE_DIMS) {
    const v = num(raw.scores?.[d]);
    if (v == null) errors.push(`Falta scores.${d} (0-10)`);
    scores[d] = clamp(v ?? 0, 0, 10);
  }

  if (errors.length) return { lead: null, errors, warnings };

  const lead = {
    business, contacts, analysis, recommendation, outreach, scores,
    scoreNotes: str(raw.scoreNotes, 1500),
    sources: strList(raw.sources, 500).slice(0, 30),
  };
  Object.assign(lead, computeScore(lead, config));
  return { lead, errors, warnings };
}

function mergeLists(existing = [], incoming = [], key) {
  const map = new Map(existing.map((x) => [x[key], x]));
  for (const item of incoming) if (!map.has(item[key])) map.set(item[key], item);
  return [...map.values()];
}

/**
 * Inserta/actualiza leads en la base. Mantiene estado, notas y actividad de los existentes.
 * @returns reporte con creados, actualizados, rechazados y advertencias por lead.
 */
export function ingestLeads(db, rawLeads, config, opts = {}) {
  const report = { created: [], updated: [], rejected: [], skipped: [], warnings: [] };
  const index = new Map();
  for (const l of db.leads) for (const k of l.dedupeKeys || dedupeKeys(l)) index.set(k, l);
  const now = new Date().toISOString();
  const minScore = config.scoring?.minScoreToKeep ?? 0;

  rawLeads.forEach((raw, i) => {
    const label = raw?.business?.name || `#${i + 1}`;
    const { lead, errors, warnings } = validateLead(raw, config, opts);
    if (!lead) { report.rejected.push({ index: i, name: label, errors, warnings }); return; }
    const blocked = isBlocked(lead, config.blocklist);
    if (blocked) { report.skipped.push({ name: label, reason: blocked }); return; }
    if (lead.score < minScore) { report.skipped.push({ name: label, reason: `Puntaje ${lead.score} < mínimo ${minScore}` }); return; }
    if (warnings.length) report.warnings.push({ name: label, warnings });

    const keys = dedupeKeys(lead);
    const existing = keys.map((k) => index.get(k)).find(Boolean);
    if (existing) {
      existing.business = { ...existing.business, ...Object.fromEntries(Object.entries(lead.business).filter(([, v]) => v !== '' && v != null)) };
      existing.contacts = {
        phones: mergeLists(lead.contacts.phones, existing.contacts.phones, 'number'),
        emails: mergeLists(lead.contacts.emails, existing.contacts.emails, 'email'),
        decisionMakers: mergeLists(lead.contacts.decisionMakers, existing.contacts.decisionMakers, 'name'),
      };
      Object.assign(existing, {
        analysis: lead.analysis, recommendation: lead.recommendation, outreach: lead.outreach,
        scores: lead.scores, scoreNotes: lead.scoreNotes,
        sources: [...new Set([...(existing.sources || []), ...lead.sources])].slice(0, 40),
        updatedAt: now,
      });
      Object.assign(existing, computeScore(existing, config));
      existing.dedupeKeys = dedupeKeys(existing);
      existing.activity = [...(existing.activity || []), { at: now, type: 'enriched', by: opts.worker || '', text: `Actualizado por búsqueda ${opts.runId || 'manual'}` }];
      for (const k of existing.dedupeKeys) index.set(k, existing);
      report.updated.push({ id: existing.id, name: existing.business.name, score: existing.score, tier: existing.tier });
      return;
    }
    const full = {
      id: newLeadId(),
      ...lead,
      dedupeKeys: keys,
      status: 'new',
      owner: opts.worker || '',
      runId: opts.runId || '',
      createdAt: now,
      updatedAt: now,
      nextActionAt: null,
      notes: [],
      activity: [{ at: now, type: 'created', by: opts.worker || '', text: `Encontrado por búsqueda ${opts.runId || 'manual'}` }],
    };
    db.leads.push(full);
    for (const k of keys) index.set(k, full);
    report.created.push({ id: full.id, name: full.business.name, score: full.score, tier: full.tier });
  });
  return report;
}

/** Lista compacta de negocios ya conocidos para que la IA no los vuelva a investigar. */
export function knownBusinesses(db, { niche, state } = {}) {
  return db.leads
    .filter((l) => (!niche || l.business.niche === niche) && (!state || l.business.state === state))
    .map((l) => [l.business.name, l.business.city, l.business.state, normalizeDomain(l.business.website), l.contacts.phones[0]?.display || ''].filter(Boolean).join(' | '));
}
