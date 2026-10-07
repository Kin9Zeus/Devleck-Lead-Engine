// Lanza Claude Code en modo no interactivo (claude -p) con la cuenta del trabajador
// y convierte su salida stream-json en eventos legibles para la interfaz.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ROOT, RUNS_DIR, readJson, writeJson, loadSettings, loadLeads } from '../lib/store.mjs';

const isWin = process.platform === 'win32';
const ALLOWED_TOOLS = ['WebSearch', 'WebFetch', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(node scripts/cli.mjs:*)', 'PowerShell(node scripts/cli.mjs:*)'];

const PROMPT_FILES = { prospect: 'prompts/prospect.md', niches: 'prompts/niches.md', 'call-prep': 'prompts/call-prep.md' };
const RUN_LABELS = { prospect: 'Prospección', niches: 'Inteligencia de nichos', 'call-prep': 'Preparar llamada' };

let claudeBin = null;
export function findClaude() {
  if (claudeBin !== null) return claudeBin;
  try {
    const out = execSync(isWin ? 'where claude' : 'command -v claude', { stdio: ['ignore', 'pipe', 'ignore'], shell: isWin ? undefined : '/bin/sh' }).toString().trim().split(/\r?\n/);
    // En Windows preferimos el .exe (instalador nativo) sobre el .cmd de npm.
    claudeBin = (isWin ? out.find((p) => /\.exe$/i.test(p)) || out.find((p) => /\.(cmd|bat)$/i.test(p)) : out[0]) || '';
  } catch {
    claudeBin = '';
  }
  return claudeBin;
}

let claudeVersion = null;
export function getClaudeVersion() {
  if (claudeVersion !== null) return claudeVersion;
  const bin = findClaude();
  try {
    claudeVersion = bin ? execFileSync(bin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], shell: /\.(cmd|bat)$/i.test(bin), timeout: 15000 }).toString().trim() : '';
  } catch {
    claudeVersion = '';
  }
  return claudeVersion;
}

export function newRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `R${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function buildPrompt(type, runId, params) {
  const file = PROMPT_FILES[type];
  if (!file) throw new Error(`Tipo de ejecución desconocido: ${type}`);
  const lines = [
    'Te ejecuta la interfaz de Devleck Lead Engine en modo NO interactivo: no hagas preguntas; ante dudas usa los valores por defecto y continúa.',
    `runId: ${runId}`,
    `Lee y sigue al pie de la letra \`${file}\`.`,
  ];
  if (type === 'prospect') lines.push(`Nombra los lotes \`workspace/inbox/${runId}-<n>.json\` e ingiérelos con \`node scripts/cli.mjs ingest <archivo> --run ${runId}\`.`);
  if (type === 'call-prep') lines.push(`Lead: ${params.leadId}`);
  lines.push('', 'Parámetros:', '```json', JSON.stringify(params, null, 2), '```');
  return lines.join('\n');
}

function quoteWin(arg) {
  return /[\s"()*&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function summarizeTool(name, input = {}) {
  switch (name) {
    case 'WebSearch': return { icon: 'search', text: `Buscando: ${input.query}` };
    case 'WebFetch': return { icon: 'globe', text: `Leyendo: ${input.url}` };
    case 'Read': return { icon: 'file', text: `Leyendo archivo: ${path.relative(ROOT, input.file_path || '') || input.file_path}` };
    case 'Write': return { icon: 'save', text: `Escribiendo: ${path.relative(ROOT, input.file_path || '') || input.file_path}` };
    case 'Edit': return { icon: 'save', text: `Editando: ${path.relative(ROOT, input.file_path || '') || input.file_path}` };
    case 'Bash':
    case 'PowerShell': {
      const c = String(input.command || '');
      if (c.includes('cli.mjs ingest')) return { icon: 'db', text: 'Guardando lote de leads en la base' };
      if (c.includes('cli.mjs known')) return { icon: 'db', text: 'Revisando negocios ya registrados' };
      if (c.includes('cli.mjs brief')) return { icon: 'db', text: 'Cargando contexto del trabajador' };
      return { icon: 'terminal', text: c.slice(0, 160) };
    }
    case 'TodoWrite': return { icon: 'list', text: 'Actualizando plan de trabajo' };
    default: return { icon: 'tool', text: name };
  }
}

class RunManager extends EventEmitter {
  constructor() {
    super();
    this.procs = new Map();
    this.markInterrupted();
  }

  dir(id) { return path.join(RUNS_DIR, id); }

  markInterrupted() {
    for (const run of this.list()) {
      if (run.status === 'running') this.saveRun({ ...run, status: 'interrupted', endedAt: new Date().toISOString() });
    }
  }

  list() {
    if (!fs.existsSync(RUNS_DIR)) return [];
    return fs.readdirSync(RUNS_DIR)
      .map((id) => readJson(path.join(RUNS_DIR, id, 'run.json'), null))
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  }

  get(id) {
    if (!/^R[\d-]+$/.test(id)) return null;
    const run = readJson(path.join(this.dir(id), 'run.json'), null);
    if (run) run.leadsCreated = loadLeads().leads.filter((l) => l.runId === id).length;
    return run;
  }

  events(id) {
    const file = path.join(this.dir(id), 'events.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  saveRun(run) { writeJson(path.join(this.dir(run.id), 'run.json'), run); }

  push(id, event) {
    const e = { at: new Date().toISOString(), ...event };
    fs.appendFileSync(path.join(this.dir(id), 'events.jsonl'), JSON.stringify(e) + '\n');
    this.emit(`event:${id}`, e);
  }

  start(type, params = {}) {
    const bin = findClaude();
    if (!bin) throw new Error('No se encontró Claude Code. Instálalo y ejecuta "claude" una vez para iniciar sesión.');
    if ([...this.procs.keys()].length >= 2) throw new Error('Ya hay 2 búsquedas en curso. Espera a que termine una.');
    const settings = loadSettings();
    const id = newRunId();
    fs.mkdirSync(this.dir(id), { recursive: true });
    const run = { id, type, label: RUN_LABELS[type] || type, params, status: 'running', startedAt: new Date().toISOString(), worker: settings.workerId };
    this.saveRun(run);

    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'];
    if (settings.model) args.push('--model', settings.model);
    args.push('--allowedTools', ...ALLOWED_TOOLS);
    const useShell = isWin && /\.(cmd|bat)$/i.test(bin);
    const child = spawn(useShell ? quoteWin(bin) : bin, useShell ? args.map(quoteWin) : args, {
      cwd: ROOT,
      shell: useShell,
      windowsHide: true,
      env: { ...process.env, DEVLECK_RUN_ID: id },
    });
    this.procs.set(id, child);
    child.stdin.end(buildPrompt(type, id, params));
    this.push(id, { kind: 'status', text: `Iniciando ${run.label} con Claude Code…` });

    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) this.handleLine(id, line);
    });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => this.push(id, { kind: 'error', text: `No se pudo iniciar Claude: ${err.message}` }));
    child.on('close', (code) => {
      if (buffer.trim()) this.handleLine(id, buffer);
      this.procs.delete(id);
      const current = readJson(path.join(this.dir(id), 'run.json'), run);
      if (current.status === 'running') {
        current.status = code === 0 && !current.isError ? 'done' : 'error';
        if (code !== 0 && stderr.trim()) this.push(id, { kind: 'error', text: stderr.trim().slice(-1500) });
      }
      current.endedAt = new Date().toISOString();
      current.leadsCreated = loadLeads().leads.filter((l) => l.runId === id).length;
      this.saveRun(current);
      this.push(id, { kind: 'end', status: current.status, text: `Finalizado (${current.status}) · ${current.leadsCreated} leads de esta búsqueda` });
    });
    return run;
  }

  handleLine(id, line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === 'system' && msg.subtype === 'init') {
      this.push(id, { kind: 'status', text: `Sesión de Claude iniciada · modelo ${msg.model || 'por defecto'}` });
    } else if (msg.type === 'assistant') {
      for (const block of msg.message?.content || []) {
        if (block.type === 'text' && block.text.trim()) this.push(id, { kind: 'text', text: block.text.trim() });
        if (block.type === 'tool_use') this.push(id, { kind: 'tool', tool: block.name, ...summarizeTool(block.name, block.input) });
      }
    } else if (msg.type === 'user') {
      for (const block of msg.message?.content || []) {
        if (block.type !== 'tool_result') continue;
        const text = Array.isArray(block.content) ? block.content.map((c) => c.text || '').join('') : String(block.content || '');
        const resumen = text.match(/"resumen":\s*"([^"]+)"/);
        if (resumen) this.push(id, { kind: 'saved', text: `Lote guardado: ${resumen[1]}` });
        else if (block.is_error) this.push(id, { kind: 'warn', text: text.slice(0, 300) });
      }
    } else if (msg.type === 'result') {
      const run = readJson(path.join(this.dir(id), 'run.json'), {});
      run.summary = msg.result || '';
      run.isError = !!msg.is_error;
      run.durationMs = msg.duration_ms;
      run.turns = msg.num_turns;
      this.saveRun(run);
      this.push(id, { kind: msg.is_error ? 'error' : 'result', text: msg.result || '' });
      if (msg.is_error && /authenticat|log ?in|oauth|api key|credential/i.test(msg.result || '')) {
        this.push(id, { kind: 'warn', text: 'Tu sesión de Claude Code no está activa. Abre una terminal, ejecuta "claude", escribe /login, inicia sesión con tu cuenta y vuelve a lanzar la búsqueda.' });
      }
    }
  }

  stop(id) {
    const child = this.procs.get(id);
    if (!child) return false;
    const run = readJson(path.join(this.dir(id), 'run.json'), null);
    if (run) this.saveRun({ ...run, status: 'stopped' });
    if (isWin) {
      try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ya terminó */ }
    } else child.kill('SIGTERM');
    this.push(id, { kind: 'warn', text: 'Búsqueda detenida por el usuario. Los lotes ya guardados se conservan.' });
    return true;
  }
}

export const runs = new RunManager();
