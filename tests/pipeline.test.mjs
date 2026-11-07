import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLead, closeness, computeTasks, followUpState, applyLeadUpdate, EditError, decorate } from '../lib/pipeline.mjs';
import { ingestLeads } from '../lib/leads.mjs';

const config = {
  services: { items: [{ id: 'ai-receptionist', name: 'AI Receptionist', active: true }] },
  niches: { items: [{ id: 'dental-practices', name: 'Dental', priority: 3 }] },
  scoring: { weights: { fit: 0.3, need: 0.25, reachability: 0.2, budget: 0.15, timing: 0.1 }, adjustments: {}, tiers: { A: 75, B: 55 }, minScoreToKeep: 0 },
  blocklist: {},
};

// Lead tal como lo guardaba la versión 1.0 (sin tasks, interest, manualFields ni ids de notas).
const v1Lead = () => ({
  id: 'L1', status: 'new', score: 80, tier: 'A', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', nextActionAt: null,
  business: { name: 'Smile Dental', niche: 'dental-practices', city: 'Austin', state: 'TX', website: 'https://smile.example' },
  contacts: { phones: [{ number: '+15124821234', display: '(512) 482-1234', label: 'main' }], emails: [], decisionMakers: [] },
  scores: { fit: 9, need: 8, reachability: 7, budget: 7, timing: 6 },
  analysis: {}, recommendation: { serviceId: 'ai-receptionist' }, outreach: {},
  notes: [{ at: '2026-10-02T10:00:00.000Z', by: 'Ana', text: 'Llamar después de las 2pm' }],
  activity: [{ at: '2026-10-01T10:00:00.000Z', type: 'created', text: 'x' }],
});

test('migrateLead conserva los datos de la v1.0 y agrega los campos nuevos', () => {
  const l = migrateLead(v1Lead());
  assert.equal(l.notes.length, 1);
  assert.equal(l.notes[0].text, 'Llamar después de las 2pm');
  assert.ok(l.notes[0].id);
  assert.deepEqual(l.tasks, []);
  assert.equal(l.interest, 0);
  assert.equal(l.statusChangedAt, '2026-10-01T10:00:00.000Z');
});

test('closeness sube con la etapa y el interés', () => {
  const base = migrateLead(v1Lead());
  const meeting = { ...base, status: 'meeting', interest: 4, statusChangedAt: new Date().toISOString() };
  const proposal = { ...base, status: 'proposal', interest: 5, statusChangedAt: new Date().toISOString() };
  assert.ok(closeness(base) < closeness(meeting));
  assert.ok(closeness(meeting) < closeness(proposal));
  assert.equal(closeness({ ...base, status: 'won' }), 100);
  assert.equal(closeness({ ...base, status: 'lost' }), 0);
});

test('followUpState clasifica vencido, hoy y próximo', () => {
  const now = new Date('2026-11-07T12:00:00');
  assert.equal(followUpState({ nextActionAt: '2026-11-06T12:00:00' }, now), 'overdue');
  assert.equal(followUpState({ nextActionAt: new Date('2026-11-07T18:00:00').toISOString() }, now), 'today');
  assert.equal(followUpState({ nextActionAt: new Date('2026-11-10T09:00:00').toISOString() }, now), 'soon');
  assert.equal(followUpState({}, now), 'none');
});

test('computeTasks prioriza el seguimiento vencido y la primera llamada', () => {
  const l = migrateLead(v1Lead());
  l.nextActionAt = new Date(Date.now() - 3600e3).toISOString();
  const tasks = computeTasks(l);
  assert.equal(tasks[0].priority, 'high');
  assert.ok(tasks.some((t) => t.id === 'auto:first-call'));
  assert.ok(tasks.some((t) => t.id === 'auto:find-email'));
});

test('applyLeadUpdate agrega contactos manuales, valida y registra actividad', () => {
  const l = migrateLead(v1Lead());
  applyLeadUpdate(l, { addPhone: { number: '512-555-2020'.replace('555', '482'), label: 'mobile', person: 'Dr. Lee' } }, { by: 'ana', config });
  assert.equal(l.contacts.phones[0].label, 'mobile');
  assert.equal(l.contacts.phones[0].manual, true);
  applyLeadUpdate(l, { addEmail: { email: 'Dr.Lee@Smile.example' }, addPerson: { name: 'Dr. Ann Lee', title: 'Owner', primary: true } }, { by: 'ana', config });
  assert.equal(l.contacts.emails[0].email, 'dr.lee@smile.example');
  assert.equal(l.contacts.decisionMakers[0].name, 'Dr. Ann Lee');
  assert.throws(() => applyLeadUpdate(l, { addPhone: { number: '123' } }), EditError);
  assert.ok(l.activity.filter((a) => a.type === 'edit').length >= 3);
});

test('applyLeadUpdate maneja interés, tareas y notas fijadas', () => {
  const l = migrateLead(v1Lead());
  applyLeadUpdate(l, { status: 'meeting' });
  assert.equal(l.interest, 4, 'al agendar reunión el interés mínimo es Caliente');
  applyLeadUpdate(l, { interest: 2 });
  assert.equal(l.interest, 2);
  applyLeadUpdate(l, { addTask: { title: 'Enviar caso de éxito', priority: 'high' } });
  const t = l.tasks[0];
  applyLeadUpdate(l, { completeTask: t.id });
  assert.equal(l.tasks[0].done, true);
  applyLeadUpdate(l, { note: 'Decide el socio', pinned: true });
  const d = decorate(l);
  assert.equal(d.lastNote.text, 'Decide el socio');
});

test('re-ingestar un lead no pisa los datos editados a mano', () => {
  const db = { leads: [] };
  const raw = {
    business: { name: 'Smile Dental', niche: 'dental-practices', website: 'smile.example', city: 'Austin', state: 'TX', address: '1 AI St' },
    contacts: { phones: [{ number: '(512) 482-1234', source: 'x' }], emails: [{ email: 'info@smile.example', confidence: 'verified', source: 'x' }] },
    recommendation: { serviceId: 'ai-receptionist', why: 'x' },
    outreach: { callOpener: 'Hi', discoveryQuestions: ['Q'], email: { subject: 'S', body: 'B' } },
    scores: { fit: 8, need: 8, reachability: 8, budget: 8, timing: 8 },
  };
  ingestLeads(db, [raw], config);
  const lead = db.leads[0];
  applyLeadUpdate(lead, { business: { address: '99 Real Address' }, addPhone: { number: '(512) 482-9999', label: 'direct' } }, { config });
  ingestLeads(db, [raw], config);
  assert.equal(db.leads.length, 1);
  assert.equal(lead.business.address, '99 Real Address');
  assert.equal(lead.contacts.phones[0].display, '(512) 482-9999');
});
