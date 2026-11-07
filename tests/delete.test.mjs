import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestLeads, removeLeads, restoreLeads, knownBusinesses } from '../lib/leads.mjs';

const config = {
  services: { items: [{ id: 'ai-receptionist', name: 'AI Receptionist', active: true }] },
  niches: { items: [{ id: 'dental-practices', name: 'Dental', priority: 3 }] },
  scoring: { weights: { fit: 0.3, need: 0.25, reachability: 0.2, budget: 0.15, timing: 0.1 }, adjustments: {}, tiers: { A: 75, B: 55 }, minScoreToKeep: 0 },
  blocklist: {},
};
const raw = (name, domain, phone) => ({
  business: { name, niche: 'dental-practices', website: domain, city: 'Austin', state: 'TX', address: '1 AI St' },
  contacts: { phones: [{ number: phone, source: 'x' }], emails: [] },
  recommendation: { serviceId: 'ai-receptionist', why: 'x' },
  outreach: { callOpener: 'Hi', discoveryQuestions: ['Q'], email: { subject: 'S', body: 'B' } },
  scores: { fit: 8, need: 8, reachability: 8, budget: 8, timing: 8 },
});
const seed = () => {
  const db = { leads: [] };
  ingestLeads(db, [raw('Smile Dental', 'smile.example', '(512) 482-1234'), raw('Bright Dental', 'bright.example', '(512) 482-5678')], config);
  return db;
};

test('removeLeads elimina solo los leads pedidos y recuerda los negocios eliminados', () => {
  const db = seed();
  const [a, b] = db.leads;
  const removed = removeLeads(db, [a.id]);
  assert.equal(removed.length, 1);
  assert.deepEqual(db.leads.map((l) => l.id), [b.id]);
  assert.equal(db.deleted.length, 1);
  assert.equal(db.deleted[0].name, 'Smile Dental');
});

test('un negocio eliminado no vuelve a entrar en una búsqueda futura', () => {
  const db = seed();
  removeLeads(db, [db.leads[0].id]);
  const report = ingestLeads(db, [raw('Smile Dental', 'smile.example', '(512) 482-1234')], config);
  assert.equal(report.created.length, 0);
  assert.equal(report.skipped.length, 1);
  assert.equal(db.leads.length, 1);
  // La IA recibe el negocio en la lista de "ya conocidos" para no investigarlo otra vez.
  assert.ok(knownBusinesses(db).some((k) => k.startsWith('Smile Dental')));
});

test('con forget=false el negocio puede volver a encontrarse', () => {
  const db = seed();
  removeLeads(db, [db.leads[0].id], { forget: false });
  assert.equal(db.deleted, undefined);
  const report = ingestLeads(db, [raw('Smile Dental', 'smile.example', '(512) 482-1234')], config);
  assert.equal(report.created.length, 1);
});

test('restoreLeads deshace la eliminación sin duplicar ni guardar campos calculados', () => {
  const db = seed();
  const target = db.leads[0];
  const removed = removeLeads(db, [target.id]).map((l) => ({ ...l, closeness: 50, tasksOpen: [], local: { open: true } }));
  const back = restoreLeads(db, removed);
  assert.equal(back.length, 1);
  assert.equal(db.leads.length, 2);
  assert.equal('closeness' in db.leads.find((l) => l.id === target.id), false);
  assert.equal(db.deleted.length, 0);
  assert.equal(restoreLeads(db, removed).length, 0); // ya existe: no se duplica
});

test('removeLeads con ids inexistentes no cambia nada', () => {
  const db = seed();
  assert.deepEqual(removeLeads(db, ['nope']), []);
  assert.equal(db.leads.length, 2);
  assert.equal(db.deleted, undefined);
});
