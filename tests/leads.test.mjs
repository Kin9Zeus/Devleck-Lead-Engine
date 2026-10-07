import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeEmail, normalizeState, normalizeDomain } from '../lib/normalize.mjs';
import { validateLead, ingestLeads, computeScore, dedupeKeys } from '../lib/leads.mjs';

const config = {
  services: { items: [{ id: 'ai-receptionist', name: 'AI Receptionist', active: true }, { id: 'old', name: 'Old', active: false }] },
  niches: { items: [{ id: 'dental-practices', name: 'Dental', priority: 5 }] },
  scoring: { weights: { fit: 0.3, need: 0.25, reachability: 0.2, budget: 0.15, timing: 0.1 }, adjustments: {}, tiers: { A: 75, B: 55 }, minScoreToKeep: 0 },
  blocklist: { domains: ['blocked.com'], phones: [], names: [] },
};

const rawLead = (over = {}) => ({
  business: { name: 'Smile Dental LLC', niche: 'dental-practices', website: 'www.smiledental.com', city: 'Austin', state: 'Texas', ...over.business },
  contacts: {
    phones: [{ number: '+1 (512) 482-1234', label: 'main', source: 'https://smiledental.com/contact' }],
    emails: [{ email: 'Info@SmileDental.com', confidence: 'verified', source: 'https://smiledental.com/contact' }],
    decisionMakers: [{ name: 'Dr. Ann Lee', title: 'Owner' }],
    ...over.contacts,
  },
  analysis: { summary: 'x', signals: [{ type: 'hiring', detail: 'Hiring front desk', source: 'https://indeed.com/x' }] },
  recommendation: { serviceId: 'ai-receptionist', why: 'Hiring front desk and reviews about missed calls' },
  outreach: { callOpener: 'Hi', discoveryQuestions: ['Q?'], email: { subject: 'S', body: 'B' } },
  scores: { fit: 9, need: 8, reachability: 8, budget: 7, timing: 7 },
  ...over.root,
});

test('normalizePhone', () => {
  assert.equal(normalizePhone('(512) 482-1234').e164, '+15124821234');
  assert.equal(normalizePhone('1-512-482-1234 ext. 12').ext, '12');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('(012) 482-1234'), null);
});

test('normalizeEmail / state / domain', () => {
  assert.equal(normalizeEmail('Info@Foo.com').generic, true);
  assert.equal(normalizeEmail('jane@foo.com').generic, false);
  assert.equal(normalizeEmail('logo@2x.png'), null);
  assert.equal(normalizeState('texas'), 'TX');
  assert.equal(normalizeState('ZZ'), '');
  assert.equal(normalizeDomain('https://www.Foo.com/contact'), 'foo.com');
});

test('validateLead acepta un lead completo y normaliza', () => {
  const { lead, errors } = validateLead(rawLead(), config);
  assert.deepEqual(errors, []);
  assert.equal(lead.business.state, 'TX');
  assert.equal(lead.contacts.phones[0].display, '(512) 482-1234');
  assert.equal(lead.contacts.emails[0].email, 'info@smiledental.com');
  assert.equal(lead.tier, 'A');
});

test('validateLead rechaza servicio inactivo y lead sin contactos', () => {
  const r1 = validateLead(rawLead({ root: { recommendation: { serviceId: 'old', why: 'x' } } }), config);
  assert.ok(r1.errors.some((e) => e.includes('serviceId')));
  const r2 = validateLead(rawLead({ contacts: { phones: [], emails: [] } }), config);
  assert.ok(r2.errors.some((e) => e.includes('contactable')));
  const r3 = validateLead(rawLead({ contacts: { phones: [] } }), config, { requirePhone: true });
  assert.ok(r3.errors.some((e) => e.includes('teléfono')));
});

test('computeScore penaliza la falta de teléfono', () => {
  const { lead } = validateLead(rawLead(), config);
  const without = { ...lead, contacts: { ...lead.contacts, phones: [] } };
  assert.ok(computeScore(without, config).score < lead.score - 15);
});

test('ingestLeads deduplica y conserva el estado del existente', () => {
  const db = { leads: [] };
  const r1 = ingestLeads(db, [rawLead()], config, { worker: 'w1', runId: 'R1' });
  assert.equal(r1.created.length, 1);
  db.leads[0].status = 'callback';
  const r2 = ingestLeads(db, [rawLead({ business: { website: 'https://smiledental.com/' } })], config, { runId: 'R2' });
  assert.equal(r2.updated.length, 1);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].status, 'callback');
  assert.ok(dedupeKeys(db.leads[0]).includes('p:5124821234'));
});

test('ingestLeads respeta la blocklist', () => {
  const db = { leads: [] };
  const r = ingestLeads(db, [rawLead({ business: { website: 'blocked.com' } })], config);
  assert.equal(r.skipped.length, 1);
  assert.equal(db.leads.length, 0);
});
