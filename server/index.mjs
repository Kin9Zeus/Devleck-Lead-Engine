// Servidor local de Devleck Lead Engine (sin dependencias). Solo escucha en 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import {
  ROOT, INSIGHTS_FILE, CONFIG_FILES, loadAllConfig, saveConfig, loadLeads, updateLeads, loadSettings, saveSettings, readJson,
} from '../lib/store.mjs';
import { STATUSES, computeScore } from '../lib/leads.mjs';
import { localTimeInfo } from '../lib/normalize.mjs';
import { runs, getClaudeVersion, findClaude } from './runner.mjs';

const PORT = Number(process.env.PORT) || 4600;
const UI_DIR = path.join(ROOT, 'ui');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const pkg = readJson(path.join(ROOT, 'package.json'), {});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5_000_000) throw new HttpError(413, 'Cuerpo demasiado grande');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'JSON inválido'); }
}

const git = (args, timeout = 20000) => new Promise((resolve) => {
  execFile('git', args, { cwd: ROOT, timeout }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || err?.message || '').trim() }));
});

async function systemInfo(fetchRemote) {
  const info = { version: pkg.version, node: process.versions.node, claude: { installed: !!findClaude(), version: getClaudeVersion() }, git: { repo: false } };
  const inside = await git(['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return info;
  info.git.repo = true;
  info.git.branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out;
  info.git.commit = (await git(['log', '-1', '--format=%h · %s · %cr'])).out;
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']);
  info.git.upstream = upstream.ok ? upstream.out : '';
  if (upstream.ok) {
    if (fetchRemote) await git(['fetch', '--quiet'], 30000);
    const counts = (await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])).out.split(/\s+/).map(Number);
    info.git.ahead = counts[0] || 0;
    info.git.behind = counts[1] || 0;
    if (info.git.behind) info.git.incoming = (await git(['log', '--format=%h %s', 'HEAD..@{u}', '-n', '15'])).out.split('\n').filter(Boolean);
  }
  info.git.dirty = (await git(['status', '--porcelain', '--', 'config', 'prompts', 'lib', 'server', 'ui', 'scripts'])).out.split('\n').filter(Boolean);
  return info;
}

function decorateLead(lead) {
  return { ...lead, local: localTimeInfo(lead.business.state) };
}

function requireAdmin() {
  if (!loadSettings().isAdmin) throw new HttpError(403, 'Solo el administrador puede modificar la configuración compartida. Actívalo en Configuración si eres el administrador.');
}

function validateConfig(name, data) {
  if (!data || typeof data !== 'object') throw new HttpError(400, 'Configuración inválida');
  if (['services', 'niches'].includes(name)) {
    if (!Array.isArray(data.items)) throw new HttpError(400, `"${name}" debe tener una lista "items"`);
    const ids = new Set();
    for (const item of data.items) {
      if (!item.id || !/^[a-z0-9-]+$/.test(item.id)) throw new HttpError(400, `Id inválido "${item.id}" (usa minúsculas, números y guiones)`);
      if (ids.has(item.id)) throw new HttpError(400, `Id duplicado: ${item.id}`);
      if (!item.name) throw new HttpError(400, `Falta el nombre en ${item.id}`);
      ids.add(item.id);
    }
  }
  if (name === 'team' && !Array.isArray(data.members)) throw new HttpError(400, '"team" debe tener una lista "members"');
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

route('GET', '/api/bootstrap', async () => ({ config: loadAllConfig(), settings: loadSettings(), statuses: STATUSES, insights: readJson(INSIGHTS_FILE, null) }));

route('GET', '/api/system', async (req, res, p, url) => systemInfo(url.searchParams.get('fetch') === '1'));

route('POST', '/api/system/update', async () => {
  const before = await systemInfo(true);
  if (!before.git.repo || !before.git.upstream) throw new HttpError(400, 'Esta copia no está conectada a un repositorio remoto (git clone).');
  if (before.git.dirty.length) throw new HttpError(409, `Tienes cambios locales en archivos de la herramienta:\n${before.git.dirty.join('\n')}\nGuárdalos o descártalos antes de actualizar.`);
  const pull = await git(['pull', '--ff-only'], 60000);
  if (!pull.ok) throw new HttpError(500, `No se pudo actualizar: ${pull.err}`);
  return { ok: true, output: pull.out, restartRequired: true };
});

route('GET', '/api/settings', async () => loadSettings());
route('PUT', '/api/settings', async (req) => {
  const body = await readBody(req);
  const allowed = ['workerId', 'repName', 'repEmail', 'repPhone', 'isAdmin', 'defaultStates', 'defaultLeadCount', 'defaultMinEmployees', 'model', 'excludeChains', 'requirePhone'];
  return saveSettings(Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k))));
});

route('PUT', '/api/config/:name', async (req, res, p) => {
  requireAdmin();
  if (!CONFIG_FILES.includes(p.name)) throw new HttpError(404, 'Configuración desconocida');
  const body = await readBody(req);
  validateConfig(p.name, body);
  saveConfig(p.name, body);
  // Re-puntuar si cambian pesos o prioridades.
  if (['scoring', 'niches'].includes(p.name)) {
    const cfg = loadAllConfig();
    updateLeads((db) => { for (const l of db.leads) Object.assign(l, computeScore(l, cfg)); });
  }
  return { ok: true };
});

route('GET', '/api/leads', async () => {
  const { leads, updatedAt } = loadLeads();
  return { updatedAt, leads: leads.map(decorateLead) };
});

route('PATCH', '/api/leads/:id', async (req, res, p) => {
  const body = await readBody(req);
  const s = loadSettings();
  const lead = updateLeads((db) => {
    const l = db.leads.find((x) => x.id === p.id);
    if (!l) return null;
    const at = new Date().toISOString();
    if (body.status && body.status !== l.status) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Estado inválido');
      l.activity.push({ at, type: 'status', by: s.workerId, text: `${l.status} → ${body.status}${body.outcome ? ` · ${body.outcome}` : ''}` });
      l.status = body.status;
    }
    if (body.note) {
      const note = { at, by: s.repName || s.workerId, text: String(body.note).slice(0, 4000) };
      l.notes.push(note);
      l.activity.push({ at, type: 'note', by: s.workerId, text: note.text.slice(0, 140) });
    }
    if ('nextActionAt' in body) {
      l.nextActionAt = body.nextActionAt || null;
      if (body.nextActionAt) l.activity.push({ at, type: 'schedule', by: s.workerId, text: `Próxima acción: ${body.nextActionAt}` });
    }
    if (body.logCall) l.activity.push({ at, type: 'call', by: s.workerId, text: body.logCall });
    if (body.logEmail) l.activity.push({ at, type: 'email', by: s.workerId, text: body.logEmail });
    if (body.starred !== undefined) l.starred = !!body.starred;
    l.updatedAt = at;
    return l;
  });
  if (!lead) throw new HttpError(404, 'Lead no encontrado');
  return decorateLead(lead);
});

route('DELETE', '/api/leads/:id', async (req, res, p) => {
  const ok = updateLeads((db) => {
    const i = db.leads.findIndex((x) => x.id === p.id);
    if (i < 0) return false;
    db.leads.splice(i, 1);
    return true;
  });
  if (!ok) throw new HttpError(404, 'Lead no encontrado');
  return { ok: true };
});

route('GET', '/api/insights', async () => readJson(INSIGHTS_FILE, null));

route('GET', '/api/runs', async () => runs.list().slice(0, 50));
route('POST', '/api/runs', async (req) => {
  const body = await readBody(req);
  if (!['prospect', 'niches', 'call-prep'].includes(body.type)) throw new HttpError(400, 'Tipo de ejecución inválido');
  if (!loadSettings().workerId) throw new HttpError(400, 'Configura tu perfil (Configuración) antes de lanzar búsquedas.');
  try {
    return runs.start(body.type, body.params || {});
  } catch (err) {
    throw new HttpError(400, err.message);
  }
});
route('GET', '/api/runs/:id', async (req, res, p) => {
  const run = runs.get(p.id);
  if (!run) throw new HttpError(404, 'Ejecución no encontrada');
  return { ...run, events: runs.events(p.id) };
});
route('POST', '/api/runs/:id/stop', async (req, res, p) => ({ ok: runs.stop(p.id) }));
route('GET', '/api/runs/:id/stream', async (req, res, p) => {
  if (!runs.get(p.id)) throw new HttpError(404, 'Ejecución no encontrada');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const write = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const listener = (e) => write(e);
  runs.on(`event:${p.id}`, listener);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); runs.off(`event:${p.id}`, listener); });
  return undefined;
});

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(UI_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(UI_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'No encontrado');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  // Protección contra DNS rebinding: solo aceptar peticiones dirigidas a localhost.
  const host = (req.headers.host || '').split(':')[0];
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return send(res, 403, 'Forbidden');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method !== 'GET' && req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) return send(res, 403, 'Forbidden');
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (!m) continue;
        const result = await r.handler(req, res, m.groups || {}, url);
        if (result !== undefined) send(res, 200, result);
        return;
      }
      return send(res, 404, { error: 'Ruta no encontrada' });
    }
    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    send(res, 405, 'Método no permitido');
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.message || 'Error interno' });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`El puerto ${PORT} ya está en uso: probablemente la herramienta ya está abierta en http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  ▲ Devleck Lead Engine v${pkg.version}\n  → ${url}\n  (Ctrl+C para cerrar)\n`);
  if (!process.argv.includes('--no-open')) {
    const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(opener, () => {});
  }
});
