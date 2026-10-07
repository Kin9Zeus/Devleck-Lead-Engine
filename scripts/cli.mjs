#!/usr/bin/env node
// CLI que usa Claude Code (y los trabajadores) para operar la base de leads.
// Uso: node scripts/cli.mjs <comando> [opciones]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  ROOT, INBOX_DIR, INSIGHTS_FILE, loadAllConfig, loadLeads, updateLeads, loadSettings, readJson, writeJson,
} from '../lib/store.mjs';
import { ingestLeads, validateLead, knownBusinesses, STATUSES } from '../lib/leads.mjs';
import { normalizeState } from '../lib/normalize.mjs';

const [, , cmd, ...rest] = process.argv;
const args = { _: [] };
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    args[k] = v ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true);
  } else args._.push(a);
}

const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));
const fail = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1); };

function readLeadFile(file) {
  if (!file) fail('Indica el archivo JSON. Ej: node scripts/cli.mjs ingest workspace/inbox/lote-1.json');
  const abs = path.resolve(ROOT, file);
  const data = readJson(abs, undefined);
  if (data === undefined) fail(`No existe el archivo ${file}`);
  const leads = Array.isArray(data) ? data : Array.isArray(data?.leads) ? data.leads : [data];
  return { abs, leads };
}

const commands = {
  help() {
    out(`Devleck Lead Engine — CLI

  brief                         Contexto del trabajador: territorio, servicios activos, nichos y prioridades
  known [--niche id] [--state TX]  Negocios ya en la base (para no repetirlos)
  validate <archivo.json>       Valida un lote de leads sin guardarlo
  ingest <archivo.json> [--run id]  Valida, puntúa, deduplica y guarda un lote de leads
  insights <archivo.json>       Guarda el análisis de nichos generado por /nichos
  lead <id>                     Muestra un lead completo
  set-status <id> <estado> [--note "texto"]  Cambia el estado de un lead
  stats                         Resumen de la base de leads
  doctor                        Verifica que todo esté bien instalado

Estados: ${STATUSES.join(', ')}`);
  },

  brief() {
    const cfg = loadAllConfig();
    const s = loadSettings();
    const member = (cfg.team.members || []).find((m) => m.id === s.workerId);
    out({
      worker: { id: s.workerId || '(sin configurar)', name: s.repName, email: s.repEmail, phone: s.repPhone },
      territory: { states: s.defaultStates?.length ? s.defaultStates : member?.states || [], niches: member?.niches || [] },
      rules: { requirePhone: s.requirePhone, excludeChains: s.excludeChains, minEmployees: s.defaultMinEmployees, defaultLeadCount: s.defaultLeadCount },
      services: (cfg.services.items || []).filter((x) => x.active !== false).map((x) => `${x.id} — ${x.name} (${x.type})`),
      niches: (cfg.niches.items || []).filter((n) => n.active !== false).sort((a, b) => b.priority - a.priority).map((n) => `${n.id} — ${n.name} · prioridad ${n.priority} · crecimiento ${n.growth}`),
      leadsInDb: loadLeads().leads.length,
    });
  },

  known() {
    const state = args.state ? normalizeState(args.state) : undefined;
    const list = knownBusinesses(loadLeads(), { niche: args.niche, state });
    const block = loadAllConfig().blocklist;
    out(`# ${list.length} negocios ya registrados${args.niche ? ` en ${args.niche}` : ''}${state ? ` (${state})` : ''} — NO los vuelvas a investigar\n${list.join('\n') || '(ninguno)'}`);
    const blocked = [...(block.domains || []), ...(block.names || []), ...(block.phones || [])];
    if (blocked.length) out(`\n# Blocklist (nunca prospectar)\n${blocked.join('\n')}`);
  },

  validate() {
    const { leads } = readLeadFile(args._[0]);
    const cfg = loadAllConfig();
    const s = loadSettings();
    const results = leads.map((raw, i) => {
      const { lead, errors, warnings } = validateLead(raw, cfg, { requirePhone: s.requirePhone });
      return { index: i, name: raw?.business?.name, ok: !!lead, score: lead?.score, tier: lead?.tier, errors, warnings };
    });
    out(results);
    if (results.some((r) => !r.ok)) process.exitCode = 2;
  },

  ingest() {
    const { abs, leads } = readLeadFile(args._[0]);
    const cfg = loadAllConfig();
    const s = loadSettings();
    const runId = args.run || process.env.DEVLECK_RUN_ID || '';
    const report = updateLeads((db) => ingestLeads(db, leads, cfg, { requirePhone: s.requirePhone, worker: s.workerId, runId }));
    if (abs.startsWith(INBOX_DIR) && !report.rejected.length) fs.renameSync(abs, abs.replace(/\.json$/i, '.done.json'));
    out({
      resumen: `${report.created.length} nuevos · ${report.updated.length} actualizados · ${report.rejected.length} rechazados · ${report.skipped.length} omitidos`,
      ...report,
      siguientePaso: report.rejected.length
        ? 'Corrige los errores de los leads rechazados (sin inventar datos) y vuelve a ejecutar ingest SOLO con esos leads.'
        : 'OK',
    });
    if (report.rejected.length) process.exitCode = 2;
  },

  insights() {
    const { abs } = readLeadFile(args._[0]);
    const data = readJson(abs);
    const cfg = loadAllConfig();
    const serviceIds = new Set((cfg.services.items || []).map((x) => x.id));
    const niches = (data.niches || []).filter((n) => n?.id && n?.name).map((n) => ({
      ...n,
      opportunityScore: Math.max(0, Math.min(100, Number(n.opportunityScore) || 0)),
      bestServices: (n.bestServices || []).filter((id) => serviceIds.has(id)),
      isNew: !(cfg.niches.items || []).some((x) => x.id === n.id),
    })).sort((a, b) => b.opportunityScore - a.opportunityScore);
    if (!niches.length) fail('El archivo no contiene "niches" válidos (cada uno necesita id y name).');
    writeJson(INSIGHTS_FILE, { generatedAt: new Date().toISOString(), summary: data.summary || '', niches, sources: data.sources || [] });
    out(`Guardado el análisis de ${niches.length} nichos en workspace/niche-insights.json`);
  },

  lead() {
    const id = args._[0];
    const lead = loadLeads().leads.find((l) => l.id === id || l.business.name.toLowerCase() === String(id).toLowerCase());
    if (!lead) fail(`No encontré el lead ${id}`);
    out(lead);
  },

  'set-status'() {
    const [id, status] = args._;
    if (!STATUSES.includes(status)) fail(`Estado inválido. Opciones: ${STATUSES.join(', ')}`);
    const s = loadSettings();
    const ok = updateLeads((db) => {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) return false;
      const at = new Date().toISOString();
      lead.status = status;
      lead.updatedAt = at;
      lead.activity.push({ at, type: 'status', by: s.workerId, text: `Estado → ${status}${args.note ? `: ${args.note}` : ''}` });
      return true;
    });
    if (!ok) fail(`No encontré el lead ${id}`);
    out(`Lead ${id} → ${status}`);
  },

  stats() {
    const { leads } = loadLeads();
    const count = (fn) => leads.reduce((m, l) => { const k = fn(l); m[k] = (m[k] || 0) + 1; return m; }, {});
    out({
      total: leads.length,
      porTier: count((l) => l.tier),
      porEstado: count((l) => l.status),
      porNicho: count((l) => l.business.niche),
      porEstadoUSA: count((l) => l.business.state),
      porServicio: count((l) => l.recommendation.serviceId),
    });
  },

  doctor() {
    const checks = [];
    const major = Number(process.versions.node.split('.')[0]);
    checks.push([major >= 18, `Node.js ${process.versions.node} (se requiere 18+)`]);
    let claude = '';
    try { claude = execSync('claude --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no instalado */ }
    checks.push([!!claude, claude ? `Claude Code ${claude}` : 'Claude Code no encontrado — instala con: npm i -g @anthropic-ai/claude-code (o el instalador oficial)']);
    let git = '';
    try { git = execSync('git --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no instalado */ }
    checks.push([!!git, git || 'Git no encontrado — necesario para recibir actualizaciones']);
    try {
      const cfg = loadAllConfig();
      const active = (cfg.services.items || []).filter((x) => x.active !== false).length;
      checks.push([active > 0, `Catálogo: ${active} servicios/productos activos`]);
      checks.push([(cfg.niches.items || []).length > 0, `Nichos configurados: ${(cfg.niches.items || []).length}`]);
    } catch (err) { checks.push([false, err.message]); }
    const s = loadSettings();
    checks.push([!!s.workerId, s.workerId ? `Trabajador: ${s.repName || s.workerId}` : 'Falta configurar tu perfil (abre la interfaz → Configuración)']);
    for (const [ok, msg] of checks) console.log(`${ok ? '✔' : '✘'} ${msg}`);
    if (checks.some(([ok]) => !ok)) process.exitCode = 1;
  },
};

(commands[cmd] || commands.help)();
