# Devleck Lead Engine — instrucciones para Claude

Esta herramienta la usa el equipo comercial de **Devleck** (estudio de ingeniería de software: automatización,
IA aplicada, plataformas web/móviles) para encontrar clientes en **USA** y llamarlos.
Los usuarios hablan español; los textos dirigidos a los prospectos (guiones, correos) van en **inglés**.

## Comandos del equipo
- `/prospectar <parámetros>` → sigue `prompts/prospect.md`
- `/nichos [enfoque]` → sigue `prompts/niches.md`
- `/preparar-llamada <id>` → sigue `prompts/call-prep.md`
- `/nuevo-servicio <info>` → solo administrador; edita `config/services.json`

Si el usuario pide algo equivalente en lenguaje natural ("búscame 10 joyerías en Florida"), aplica el prompt correspondiente.

## Mapa
- `config/` — fuente de verdad que controla el administrador y se versiona en git: `company.json`, `services.json`
  (catálogo), `niches.json`, `scoring.json`, `team.json` (territorios), `blocklist.json`.
  **No modifiques `config/` salvo con `/nuevo-servicio` o si el usuario lo pide explícitamente.**
- `workspace/` — datos locales de cada trabajador (no se suben a git): `leads.json`, `inbox/` (lotes para ingerir),
  `runs/` (registros de búsquedas lanzadas desde la interfaz), `settings.json`, `niche-insights.json`.
- `scripts/cli.mjs` — única vía para escribir leads: `brief`, `known`, `validate`, `ingest`, `insights`, `lead`, `set-status`, `stats`.
  **Nunca edites `workspace/leads.json` a mano.**
- `server/` + `ui/` — interfaz web local (`npm start` → http://localhost:4600). Node sin dependencias.
- `lib/` — normalización, validación, deduplicación y puntaje (compartido por CLI y servidor).

## Reglas de oro
1. Nunca inventes datos de contacto ni cifras. Todo teléfono/correo lleva la URL fuente.
2. Solo recomienda servicios activos del catálogo; el `why` debe citar evidencia real del negocio.
3. Respeta la blocklist y no repitas negocios existentes (`node scripts/cli.mjs known`).
4. Solo datos públicos de contacto de negocios. Correos con pie de baja (CAN-SPAM). Nada de datos personales de domicilio.
5. Guarda por lotes con `ingest` y corrige los rechazos sin inventar.

## Desarrollo de la herramienta
- Sin dependencias npm a propósito (los trabajadores solo necesitan Node 18+, git y Claude Code).
- Tests: `npm test`. Verificación del entorno: `npm run check`.
