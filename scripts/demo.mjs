#!/usr/bin/env node
// Modo demo: arranca la interfaz con datos FICTICIOS en .demo-workspace/ (nunca toca workspace/).
// Uso: npm run demo            → http://localhost:4601
//      npm run demo -- --reset → regenera los datos de ejemplo
// Los negocios, personas, dominios (.example, RFC 2606) y teléfonos (555-01xx) son inventados.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(ROOT, '.demo-workspace');
process.env.DEVLECK_WORKSPACE = DEMO_DIR;
process.env.PORT ||= '4601';

if (process.argv.includes('--reset')) fs.rmSync(DEMO_DIR, { recursive: true, force: true });

const { loadAllConfig, writeJson, LEADS_FILE, SETTINGS_FILE, INSIGHTS_FILE, RUNS_DIR } = await import('../lib/store.mjs');
const { validateLead, computeScore, dedupeKeys, newLeadId } = await import('../lib/leads.mjs');

const HOUR = 3600e3;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function seed() {
  const config = loadAllConfig();
  writeJson(SETTINGS_FILE, {
    workerId: 'demo', repName: 'Alex Rivera', repEmail: 'alex@devleck.com', repPhone: '+1 (305) 555-0100',
    isAdmin: true, defaultStates: ['TX', 'FL'], defaultLeadCount: 10, defaultMinEmployees: 2, model: '', excludeChains: true, requirePhone: true,
  });

  const specs = [
    { name: 'Harborline Jewelers', niche: 'jewelry-stores', category: 'Custom jeweler', city: 'Austin', state: 'TX', area: '512', svc: 'ai-jewelry-design-studio', dm: ['Elena Marsh', 'Owner & Master Jeweler'], scores: [9, 9, 8, 7, 8], deal: [8000, 14000], rating: 4.9, reviews: 412, status: 'new', starred: true,
      summary: 'Family-owned jeweler known for custom engagement rings. Designs in-house but outsources CAD modeling; customers wait 3–5 days for renders.',
      pains: ['3–5 day wait for CAD renders', 'Customers leave to "think about it" before approving a design', 'Paying an external CAD freelancer per piece'],
      signals: [['reviews', 'Several recent reviews mention waiting over a week to see the 3D design'], ['hiring', 'Open job post for a part-time CAD jewelry designer'], ['website', '"Design your own ring" page relies on a contact form']],
      angle: 'Show the customer a photorealistic 3D render of their ring while they are still in the store.',
      why: 'They sell custom engagement rings as their core product, outsource CAD (open job post) and their reviews repeatedly mention long waits for the design. Faster renders directly increase first-visit closes.' },
    { name: 'Bluebonnet Med Spa', niche: 'med-spas', category: 'Medical spa', city: 'Houston', state: 'TX', area: '713', svc: 'ai-receptionist', dm: ['Dr. Priya Nair', 'Medical Director'], scores: [9, 9, 8, 8, 8], deal: [4000, 8000], rating: 4.8, reviews: 268, status: 'callback', due: -1 * HOUR,
      summary: 'Two-location med spa running paid social ads; bookings handled by phone and Instagram DMs.',
      pains: ['Ad leads arrive after hours and go unanswered until next day', 'Front desk juggling phones and walk-ins'],
      signals: [['ads', 'Active paid campaigns on Instagram and Facebook'], ['growth', 'Second location opened this year'], ['reviews', 'Reviews mention calls going to voicemail']],
      angle: 'Every ad lead gets answered and booked in under a minute — day or night.',
      why: 'They pay for leads through ads but only answer during business hours; reviews mention voicemail. An AI receptionist that books into their calendar recovers paid leads immediately.' },
    { name: 'Keystone HVAC & Plumbing', niche: 'home-services', category: 'HVAC contractor', city: 'Tampa', state: 'FL', area: '813', svc: 'ai-receptionist', dm: ['Mike Delaney', 'Owner'], scores: [9, 8, 8, 8, 7], deal: [3500, 7000], rating: 4.7, reviews: 530, status: 'new',
      summary: '24/7 emergency HVAC and plumbing company with 14 trucks. Hiring a dispatcher and a customer service rep.',
      pains: ['Missed emergency calls at night', 'Dispatch coordinated by phone and whiteboard'],
      signals: [['hiring', 'Hiring a dispatcher and a CSR'], ['growth', 'Fleet grew from 9 to 14 trucks'], ['website', 'Website promises 24/7 service but only has a contact form']],
      angle: 'Answer every emergency call at 2 a.m. and book the job before the customer calls the next company.',
      why: 'They advertise 24/7 emergency service and are hiring CSRs and dispatchers — clear phone-capacity pain with high-value emergency jobs.' },
    { name: 'Ridgeway Injury Law', niche: 'law-firms', category: 'Personal injury firm', city: 'Miami', state: 'FL', area: '305', svc: 'ai-receptionist', dm: ['Carla Ridgeway', 'Managing Partner'], scores: [9, 7, 7, 9, 7], deal: [5000, 9000], rating: 4.8, reviews: 189, status: 'meeting', due: 26 * HOUR,
      summary: 'Bilingual personal injury firm promising free 24/7 consultations.',
      pains: ['Intake calls after hours', 'Spanish-speaking callers need immediate response'],
      signals: [['website', 'Promises 24/7 free consultations'], ['hiring', 'Hiring a bilingual intake specialist']],
      angle: 'Bilingual 24/7 intake so no case goes to the firm down the street.',
      why: 'PI firms win cases on intake speed; they promise 24/7 consultations and are hiring bilingual intake staff.' },
    { name: 'Northgate Family Dental', niche: 'dental-practices', category: 'Dental practice', city: 'Dallas', state: 'TX', area: '214', svc: 'ai-receptionist', dm: ['Rachel Kim', 'Office Manager'], scores: [8, 7, 7, 7, 6], deal: [3000, 6000], rating: 4.6, reviews: 341, status: 'attempted', due: 2 * HOUR,
      summary: 'Three-dentist family practice without online booking.', pains: ['No online booking', 'Phone tag for recalls'],
      signals: [['website', 'No online booking; "call to schedule" only'], ['hiring', 'Hiring a front desk coordinator']],
      angle: 'Let patients book and reschedule 24/7 without calling the front desk.', why: 'No online booking and an open front-desk role indicate scheduling overload.' },
    { name: 'Summit Freight Logistics', niche: 'logistics-trucking', category: 'Freight brokerage', city: 'Atlanta', state: 'GA', area: '404', svc: 'process-automation', dm: ['Jordan Blake', 'Director of Operations'], scores: [8, 8, 6, 9, 7], deal: [9000, 15000], rating: 4.5, reviews: 64, status: 'proposal',
      summary: 'Mid-size freight broker handling invoicing and proof-of-delivery paperwork manually.', pains: ['Manual invoicing from PODs', 'Customers call for load status'],
      signals: [['hiring', 'Hiring two billing clerks'], ['growth', 'New Dallas office announced']],
      angle: 'Turn proof-of-delivery into an invoice automatically — no billing clerks copying data.', why: 'Hiring billing clerks while expanding means admin cost scales with revenue — the exact problem automation removes.' },
    { name: 'Aurelia Custom Rings', niche: 'jewelry-stores', category: 'Bespoke jeweler', city: 'Scottsdale', state: 'AZ', area: '480', svc: 'ai-jewelry-design-studio', dm: ['Marco Bellini', 'Founder'], scores: [9, 7, 7, 7, 6], deal: [7000, 12000], rating: 4.9, reviews: 156, status: 'new',
      summary: 'Bespoke jeweler with in-house casting and a strong Instagram presence of custom pieces.', pains: ['Design revisions take several rounds'],
      signals: [['tech', 'Mentions in-house CAD and casting'], ['reviews', 'Reviews praise designs but mention multiple revision rounds']],
      angle: 'Cut revision rounds by showing three AI-generated design variations in the first meeting.', why: 'In-house CAD and casting make the integration straightforward, and reviews point to slow revision cycles.' },
    { name: 'Cypress Creek Animal Hospital', niche: 'veterinary-clinics', category: 'Veterinary hospital', city: 'Charlotte', state: 'NC', area: '704', svc: 'ai-receptionist', dm: [], scores: [8, 6, 6, 6, 5], deal: [3000, 6000], rating: 4.7, reviews: 298, status: 'new',
      summary: 'Independent animal hospital with phones that ring constantly.', pains: ['Phones overwhelm the front desk'],
      signals: [['reviews', 'Reviews mention long hold times']], angle: 'Answer routine calls automatically so staff can focus on the patients in the building.', why: 'Hold-time complaints and no online booking.' },
    { name: 'Lakeshore CPA Group', niche: 'accounting-firms', category: 'CPA firm', city: 'Chicago', state: 'IL', area: '312', svc: 'process-automation', dm: ['Daniel Ortiz', 'Managing Partner'], scores: [7, 6, 6, 8, 5], deal: [5000, 10000], rating: 4.6, reviews: 48, status: 'new',
      summary: 'Growing CPA firm collecting client documents by email.', pains: ['Document collection by email', 'Manual data entry'],
      signals: [['hiring', 'Hiring staff accountants']], angle: 'Automate document collection and data entry before next tax season.', why: 'Hiring during a talent shortage; documents still arrive by email.' },
    { name: 'Copperline Fabrication', niche: 'manufacturing', category: 'Metal fabrication', city: 'Columbus', state: 'OH', area: '614', svc: 'custom-web-platform', dm: ['Greg Holloway', 'President'], scores: [7, 6, 5, 8, 6], deal: [15000, 30000], rating: 4.4, reviews: 22, status: 'new',
      summary: 'Contract metal fabricator quoting RFQs by email and spreadsheet.', pains: ['Slow RFQ quoting'],
      signals: [['growth', 'Expanding to a second shop'], ['hiring', 'Hiring an estimator']], angle: 'A customer portal for RFQs, quotes and order status.', why: 'Expansion plus an estimator opening points to quoting bottlenecks.' },
    { name: 'Palmetto Property Management', niche: 'property-management', category: 'Property management', city: 'Charleston', state: 'SC', area: '843', svc: 'ai-receptionist', dm: [], scores: [6, 5, 5, 6, 4], deal: [3000, 6000], rating: 4.1, reviews: 87, status: 'new', noEmail: true,
      summary: 'Residential property manager with ~600 units.', pains: ['After-hours maintenance calls'],
      signals: [['reviews', 'Tenants mention slow maintenance response']], angle: '24/7 maintenance intake that triages emergencies.', why: 'Maintenance response complaints in reviews.' },
    { name: 'Silverleaf Home Care', niche: 'home-health', category: 'Home care agency', city: 'Orlando', state: 'FL', area: '407', svc: 'process-automation', dm: ['Angela Brooks', 'Administrator'], scores: [8, 7, 7, 7, 7], deal: [6000, 12000], rating: 4.8, reviews: 112, status: 'won',
      summary: 'Home care agency scheduling 80+ caregivers with spreadsheets.', pains: ['Caregiver scheduling on spreadsheets'],
      signals: [['hiring', 'Constant caregiver hiring']], angle: 'Automated caregiver scheduling and compliance paperwork.', why: 'Scheduling 80+ caregivers manually is error-prone and costly.' },
  ];

  const leads = specs.map((s, i) => {
    const domain = `${slugify(s.name)}.example`;
    const raw = {
      business: { name: s.name, niche: s.niche, category: s.category, website: `https://${domain}`, address: `${120 + i * 37} Main Street`, city: s.city, state: s.state,
        rating: s.rating, reviewCount: s.reviews, employees: '10-25', yearsInBusiness: 6 + i, locations: s.niche === 'med-spas' ? 2 : 1, description: s.summary },
      contacts: {
        phones: [{ number: '(212) 212-2121', label: 'main', source: `https://${domain}/contact` }], // reemplazado abajo por un 555-01xx ficticio
        emails: s.noEmail ? [] : [{ email: `${s.dm[0] ? s.dm[0].split(' ').pop().toLowerCase() : 'info'}@${domain}`, confidence: i % 4 === 3 ? 'listed' : 'verified', source: `https://${domain}/contact` }, { email: `info@${domain}`, confidence: 'verified', source: `https://${domain}/contact` }],
        decisionMakers: s.dm.length ? [{ name: s.dm[0], title: s.dm[1], source: `https://${domain}/about` }] : [],
      },
      analysis: { summary: s.summary, painPoints: s.pains, signals: s.signals.map(([type, detail]) => ({ type, detail, source: `https://${domain}` })), digitalMaturity: i % 3 === 0 ? 'low' : 'medium',
        currentTools: s.niche === 'jewelry-stores' ? ['Shopify', 'Rhino (outsourced)'] : [], websiteIssues: i % 2 ? ['No online booking', 'Slow on mobile'] : ['Copyright 2019 in footer'] },
      recommendation: { serviceId: s.svc, secondaryServiceIds: ['web-performance-seo'], why: s.why, angle: s.angle, estimatedDeal: { min: s.deal[0], max: s.deal[1] },
        roi: 'Recovering 2–3 customers a month covers the investment within the first quarter.' },
      outreach: {
        callOpener: `Hi, this is {repName} with Devleck — we build automation and AI tools for ${config.niches.items.find((n) => n.id === s.niche)?.name.toLowerCase() || 'businesses like yours'}. ${s.angle} Do you have 30 seconds for me to explain why I called you specifically?`,
        discoveryQuestions: ['How do you handle this today?', 'Roughly how many times a week does it happen?', 'What does one lost customer cost you?', 'Who besides you would weigh in on a decision like this?', 'If it worked, when would you want it running?'],
        objections: [{ objection: 'Send me an email.', response: 'Happy to — so it is actually useful, can I ask one quick question about how you handle it today?' }],
        voicemail: `Hi${s.dm[0] ? ` ${s.dm[0].split(' ')[0]}` : ''}, {repName} from Devleck. ${s.angle} I'll send a short email too — call me back at {repPhone}.`,
        email: { subject: s.angle.split(' ').slice(0, 6).join(' ').replace(/[—,.]$/, ''), body: `Hi${s.dm[0] ? ` ${s.dm[0].split(' ')[0]}` : ''},\n\n${s.why}\n\n${s.angle} We're a senior engineering studio: fixed price per phase, weekly demos, and you own the code.\n\nWorth a 15-minute call this week?\n\n{repName}\nDevleck — Software & Digital Solutions\n{repEmail} · devleck.com\n\nIf this isn't relevant, just reply "no thanks" and I won't follow up.` },
        followUpEmail: { subject: 'Quick follow-up', body: `Hi${s.dm[0] ? ` ${s.dm[0].split(' ')[0]}` : ''},\n\nFollowing up on my note — happy to show a 10-minute demo with your own use case.\n\n{repName}` },
      },
      scores: Object.fromEntries(['fit', 'need', 'reachability', 'budget', 'timing'].map((k, j) => [k, s.scores[j]])),
      scoreNotes: 'Demo data.',
      sources: [`https://${domain}`, `https://${domain}/contact`],
    };
    const { lead, errors } = validateLead(raw, config);
    if (!lead) throw new Error(`Demo lead inválido (${s.name}): ${errors.join('; ')}`);
    const n = String(10 + i).padStart(2, '0');
    lead.contacts.phones = [{ number: `+1${s.area}55501${n}`, display: `(${s.area}) 555-01${n}`, label: s.dm.length && i % 3 === 0 ? 'direct' : 'main', person: '', source: `https://${domain}/contact` }];
    Object.assign(lead, computeScore(lead, config));
    const createdAt = iso(-(i + 1) * 5 * HOUR);
    const activity = [{ at: createdAt, type: 'created', by: 'demo', text: 'Encontrado por búsqueda R-DEMO' }];
    if (['attempted', 'callback', 'meeting', 'proposal', 'won'].includes(s.status)) activity.push({ at: iso(-26 * HOUR), type: 'call', by: 'demo', text: s.status === 'attempted' ? 'Llamada sin respuesta' : 'Conversación con el decisor' });
    if (s.status !== 'new') activity.push({ at: iso(-25 * HOUR), type: 'status', by: 'demo', text: `new → ${s.status}` });
    return {
      id: newLeadId() + i, ...lead, dedupeKeys: dedupeKeys(lead), status: s.status, owner: 'demo', runId: i < 8 ? 'R20261014-090000' : '',
      starred: !!s.starred, createdAt, updatedAt: createdAt, nextActionAt: s.due != null ? iso(s.due) : null,
      notes: s.status === 'meeting' ? [{ at: iso(-25 * HOUR), by: 'Alex Rivera', text: 'Carla wants to see the Spanish intake flow. Demo booked for Thursday 10am ET.' }] : [],
      activity,
    };
  });
  writeJson(LEADS_FILE, { version: 1, leads, updatedAt: iso(0) });

  const ins = (id, opportunityScore, growth, whyNow, bestServices, pitchAngle, hotMarkets) => ({ id, name: config.niches.items.find((n) => n.id === id)?.name || id, opportunityScore, growth, whyNow, bestServices, pitchAngle, hotMarkets, isNew: false });
  writeJson(INSIGHTS_FILE, {
    generatedAt: iso(-3 * HOUR),
    summary: 'Demo analysis. Appointment-driven local services with high inbound call volume show the strongest combination of pain and ability to pay; custom jewelers are a focused, low-competition niche for the AI design product.',
    niches: [
      ins('med-spas', 88, 'high', 'Fast-growing category that relies on paid ads and phone/DM booking — every unanswered lead is wasted ad spend.', ['ai-receptionist', 'generative-content'], 'Answer and book every ad lead in under a minute.', ['Houston, TX', 'Miami, FL', 'Scottsdale, AZ']),
      ins('home-services', 85, 'high', 'Emergency jobs are high-ticket and won by whoever answers first; owners are in the field.', ['ai-receptionist', 'process-automation'], 'Never miss a 2 a.m. emergency call.', ['Tampa, FL', 'Phoenix, AZ', 'Dallas, TX']),
      ins('jewelry-stores', 82, 'medium', 'Custom engagement rings are high-value and won in the first visit; few tools serve independent jewelers.', ['ai-jewelry-design-studio', 'web-performance-seo'], 'Show the 3D render while the customer is still in the store.', ['Austin, TX', 'Scottsdale, AZ', 'Miami, FL']),
      ins('law-firms', 80, 'medium', 'PI and immigration intake is a speed race; many firms promise 24/7 but answer 9–5.', ['ai-receptionist', 'private-ai-knowledge'], 'Bilingual 24/7 intake.', ['Miami, FL', 'Houston, TX']),
      ins('home-health', 76, 'high', 'Aging population and caregiver scheduling complexity drive admin cost.', ['process-automation'], 'Automate caregiver scheduling.', ['Orlando, FL', 'Phoenix, AZ']),
      ins('dental-practices', 72, 'medium', 'Front-desk turnover and recall campaigns keep phones overloaded.', ['ai-receptionist'], 'Online booking and recalls without phone tag.', ['Dallas, TX', 'Charlotte, NC']),
    ],
    sources: [],
  });

  const runDir = path.join(RUNS_DIR, 'R20261014-090000');
  writeJson(path.join(runDir, 'run.json'), {
    id: 'R20261014-090000', type: 'prospect', label: 'Prospección', status: 'done', worker: 'demo', startedAt: iso(-4 * HOUR), endedAt: iso(-4 * HOUR + 23 * 60e3), turns: 96,
    params: { niche: 'jewelry-stores', serviceFocus: 'ai-jewelry-design-studio', states: ['TX', 'AZ'], cities: ['Austin', 'Scottsdale'], count: 8, requirePhone: true, excludeChains: true, signals: ['reviews', 'hiring'] },
    summary: 'Demo run.',
  });
  const t0 = Date.now() - 4 * HOUR;
  const ev = [
    ['status', 'Iniciando Prospección con Claude Code…'], ['status', 'Sesión de Claude iniciada · modelo claude-opus-5-5'],
    ['tool', 'Cargando contexto del trabajador', 'db'], ['tool', 'Leyendo archivo: config/services.json', 'file'], ['tool', 'Revisando negocios ya registrados', 'db'],
    ['text', 'Plan: custom jewelers in Austin and Scottsdale that design in-house (engagement rings, CAD). Signals: reviews about render wait times and CAD designer job posts.'],
    ['tool', 'Buscando: "custom engagement rings" jeweler Austin, TX', 'search'], ['tool', 'Buscando: "design your own ring" Scottsdale AZ', 'search'],
    ['tool', 'Leyendo: https://harborlinejewelers.example/contact', 'globe'], ['tool', 'Leyendo: https://harborlinejewelers.example/about', 'globe'],
    ['tool', 'Buscando: Harborline Jewelers reviews design wait', 'search'], ['tool', 'Buscando: "CAD jewelry designer" job Austin TX', 'search'],
    ['tool', 'Leyendo: https://aureliacustomrings.example', 'globe'],
    ['text', 'Discarded 3 candidates: two mall chain stores (excludeChains) and one store that only resells brand jewelry (service disqualifier).'],
    ['tool', 'Escribiendo: workspace/inbox/R20261014-090000-1.json', 'save'], ['tool', 'Guardando lote de leads en la base', 'db'],
    ['saved', 'Lote guardado: 4 nuevos · 0 actualizados · 0 rechazados · 0 omitidos'],
    ['tool', 'Buscando: bespoke jeweler Scottsdale in-house casting', 'search'], ['tool', 'Guardando lote de leads en la base', 'db'],
    ['saved', 'Lote guardado: 4 nuevos · 0 actualizados · 0 rechazados · 0 omitidos'],
    ['result', 'Saved 8 new leads (5 tier A, 3 tier B).\n\nCall first:\n1. Harborline Jewelers (Austin) — outsources CAD, reviews mention week-long waits for renders.\n2. Aurelia Custom Rings (Scottsdale) — in-house casting, multiple revision rounds.\n\nNext: Miami and Dallas custom jewelers.'],
    ['end', 'Finalizado (done) · 8 leads de esta búsqueda', null, 'done'],
  ];
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), ev.map(([kind, text, ic, status], j) => JSON.stringify({ at: new Date(t0 + j * 62e3).toISOString(), kind, text, ...(kind === 'tool' ? { icon: ic, tool: ic === 'search' ? 'WebSearch' : ic === 'globe' ? 'WebFetch' : 'Read' } : {}), ...(status ? { status } : {}) })).join('\n') + '\n');
}

if (!fs.existsSync(LEADS_FILE)) {
  seed();
  console.log('  Datos de demostración creados en .demo-workspace/ (todo es ficticio).');
}
await import('../server/index.mjs');
