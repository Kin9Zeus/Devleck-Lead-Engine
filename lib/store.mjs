// Almacenamiento en archivos JSON con escritura atómica y bloqueo entre procesos.
// El servidor y el CLI (ejecutado por Claude) escriben los mismos archivos,
// así que toda escritura de leads pasa por withLock().
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const WS_DIR = path.join(ROOT, 'workspace');
export const INBOX_DIR = path.join(WS_DIR, 'inbox');
export const RUNS_DIR = path.join(WS_DIR, 'runs');
export const LEADS_FILE = path.join(WS_DIR, 'leads.json');
export const SETTINGS_FILE = path.join(WS_DIR, 'settings.json');
export const INSIGHTS_FILE = path.join(WS_DIR, 'niche-insights.json');

export const CONFIG_FILES = ['company', 'services', 'niches', 'scoring', 'team', 'blocklist'];

for (const dir of [WS_DIR, INBOX_DIR, RUNS_DIR]) fs.mkdirSync(dir, { recursive: true });

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function readJson(file, fallback = null) {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`No se pudo leer ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  // En Windows rename puede fallar con EPERM si otro proceso está leyendo; reintentar.
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
      sleep(50);
    }
  }
}

export function withLock(name, fn, timeoutMs = 15000) {
  const lockDir = path.join(WS_DIR, `.${name}.lock`);
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        // Bloqueo huérfano (proceso muerto): liberarlo tras 30 s.
        if (Date.now() - fs.statSync(lockDir).mtimeMs > 30000) fs.rmSync(lockDir, { recursive: true, force: true });
      } catch { /* otro proceso lo liberó */ }
      if (Date.now() - start > timeoutMs) throw new Error(`Tiempo de espera agotado esperando el bloqueo "${name}"`);
      sleep(40);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

export function loadConfig(name) {
  if (!CONFIG_FILES.includes(name)) throw new Error(`Configuración desconocida: ${name}`);
  return readJson(path.join(CONFIG_DIR, `${name}.json`), {});
}

export function loadAllConfig() {
  return Object.fromEntries(CONFIG_FILES.map((n) => [n, loadConfig(n)]));
}

export function saveConfig(name, data) {
  if (!CONFIG_FILES.includes(name)) throw new Error(`Configuración desconocida: ${name}`);
  writeJson(path.join(CONFIG_DIR, `${name}.json`), data);
}

export function loadLeads() {
  const db = readJson(LEADS_FILE, null);
  return db && Array.isArray(db.leads) ? db : { version: 1, leads: [] };
}

export function updateLeads(mutator) {
  return withLock('leads', () => {
    const db = loadLeads();
    const result = mutator(db);
    db.updatedAt = new Date().toISOString();
    writeJson(LEADS_FILE, db);
    return result;
  });
}

export const DEFAULT_SETTINGS = {
  workerId: '',
  repName: '',
  repEmail: '',
  repPhone: '',
  isAdmin: false,
  defaultStates: [],
  defaultLeadCount: 10,
  defaultMinEmployees: 2,
  model: '',
  excludeChains: true,
  requirePhone: true,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(readJson(SETTINGS_FILE, {}) || {}) };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  writeJson(SETTINGS_FILE, next);
  return next;
}
