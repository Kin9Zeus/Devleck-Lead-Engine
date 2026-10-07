# Devleck Lead Engine — Guía del equipo comercial

Herramienta interna de **Devleck** para encontrar, calificar y contactar clientes en **USA**.
La investigación la hace **Claude Code con la cuenta de cada trabajador** (sin APIs de pago). El resultado es una
lista de negocios que sí pueden comprar nuestros servicios, cada uno con:

- **Teléfono y correo** verificados, con la fuente de cada dato, y el decisor cuando se encuentra.
- **Qué venderle y por qué**, con evidencia real del negocio (reseñas, vacantes, problemas de su web, crecimiento).
- **Guion de llamada** en inglés (apertura, preguntas, objeciones, buzón de voz) y **correos** listos (primer contacto y seguimiento).
- **Puntaje 0–100 y tier A/B/C**, con hora local del negocio, para saber a quién llamar primero.

---

## 1. Instalación (una sola vez por trabajador)

Necesitas:
1. **Node.js 18+**: https://nodejs.org
2. **Git**: https://git-scm.com
3. **Claude Code**, con sesión iniciada en tu cuenta de Claude: https://claude.com/claude-code
   Después de instalarlo, abre una terminal, ejecuta `claude` y sigue el inicio de sesión.

```bash
git clone https://github.com/Kin9Zeus/Devleck-Lead-Engine.git
cd Devleck-Lead-Engine
npm run check
```

`npm run check` verifica que todo esté instalado. No hace falta `npm install`: la herramienta no tiene dependencias.

## 2. Uso diario

### Opción A: interfaz (recomendada)
- Windows: doble clic en **`iniciar.bat`**. Mac/Linux: `./iniciar.sh`. O en cualquier sistema: `npm start`.
- Se abre **http://localhost:4600**.
- La primera vez, ve a **Configuración**, elige quién eres, escribe tu nombre y correo, y elige tu territorio.

| Sección | Para qué sirve |
|---|---|
| **Panel** | Resumen: leads tier A pendientes, seguimientos de hoy, pipeline, y a quién llamar ahora. |
| **Cola de llamadas** | Lista ordenada para llamar uno tras otro: mejor puntaje, negocios abiertos ahora y seguimientos vencidos primero. |
| **Leads** | Base completa con filtros, búsqueda y exportación a CSV. |
| **Prospectar** | Configura una búsqueda (nicho, servicio a vender, estados, ciudades, cantidad, señales) y lánzala. |
| **Nichos** | Ranking de oportunidad por nicho en USA, con evidencia. "Actualizar análisis con IA" investiga el mercado. |
| **Búsquedas** | Progreso en vivo de cada investigación: qué busca Claude, qué páginas lee y cuántos leads guardó. |
| **Catálogo** | Servicios y productos que la IA puede ofrecer. |

En la ficha de cada lead: botón para **llamar** (abre tu app de llamadas), botón para **enviar correo** (abre tu correo con
el texto listo), guion, análisis, contactos y **registro del resultado** (no contestó, buzón, callback, reunión...).
Cada resultado programa el siguiente intento.

### Opción B: chat de Claude Code
Abre la carpeta con Claude Code (`claude` en la terminal, o la app de escritorio o VS Code) y usa:

| Comando | Ejemplo |
|---|---|
| `/prospectar` | `/prospectar joyerías que diseñen anillos a medida en Texas y Florida, vender ai-jewelry-design-studio, 10 leads` |
| `/nichos` | `/nichos qué nichos de salud conviene atacar con el AI Receptionist` |
| `/preparar-llamada` | `/preparar-llamada LMUY04...` (investiga más a fondo un lead y te da el brief de llamada) |
| `/nuevo-servicio` | (administrador) `/nuevo-servicio Sistema de IA para joyerías que modela en 3D con Blender...` |

Los leads del chat aparecen en la interfaz automáticamente.

> **Duración:** cada lead toma ~2–3 minutos de investigación real. 10 leads son ~20–30 minutos. Las búsquedas
> lanzadas desde la interfaz corren en segundo plano: puedes seguir llamando mientras tanto.

## 3. Administración (Aleck)

Todo lo compartido vive en `config/` y se distribuye por git:

| Archivo | Qué controla |
|---|---|
| `config/services.json` | **Catálogo**: qué vendemos, a quién, señales de compra, descalificadores, precios, pitch y objeciones. |
| `config/niches.json` | Nichos objetivo con **prioridad 1–5**. La prioridad sube o baja el puntaje de los leads del nicho. |
| `config/company.json` | Identidad, diferenciadores, tono, firma de correo y pie legal. |
| `config/scoring.json` | Pesos del puntaje y umbrales de tier A/B. |
| `config/team.json` | Equipo y **territorios** (estados por persona, para no llamar al mismo negocio dos veces). |
| `config/blocklist.json` | Clientes actuales y negocios que no se deben contactar. |

Puedes editar desde la interfaz (activa **"Soy administrador"** en Configuración), con `/nuevo-servicio` en Claude Code,
o directamente en los archivos JSON. Para **publicar** los cambios al equipo:

```bash
git add config prompts
git commit -m "Catálogo: nuevo producto AI Jewelry Design Studio"
git push
```

Los trabajadores reciben la actualización en **Configuración → Buscar actualizaciones → Actualizar ahora**
(o con `git pull`) y reinician la herramienta.

### Publicar el repositorio por primera vez
1. Crea un repositorio **privado** en GitHub (ej. `devleck/lead-engine`) e invita a los trabajadores con permiso de lectura.
2. En esta carpeta:
   ```bash
   git add .
   git commit -m "Devleck Lead Engine v1"
   git branch -M main
   git remote add origin https://github.com/Kin9Zeus/Devleck-Lead-Engine.git
   git push -u origin main
   ```

## 4. Cómo funciona

```
Trabajador → Interfaz (localhost:4600) ──lanza──> claude -p (cuenta del trabajador)
                    ▲                                   │ WebSearch / WebFetch: investiga negocios en USA
                    │                                   ▼
             workspace/leads.json  <── scripts/cli.mjs ingest  (valida, normaliza, deduplica y puntúa)
```

- `prompts/` contiene la metodología que sigue Claude (prospección, nichos, preparar llamada). Mejorar estos archivos mejora
  la calidad de todos los leads del equipo.
- `lib/leads.mjs` es la fuente de verdad: rechaza leads sin datos de contacto válidos o sin servicio del catálogo,
  normaliza teléfonos de USA, detecta duplicados (dominio, teléfono, nombre+ciudad), aplica la blocklist y calcula el
  puntaje con los pesos de `config/scoring.json`.
- `workspace/` es local de cada trabajador y **no se sube a git** (contiene sus leads y notas).

## 5. Buenas prácticas y cumplimiento

- Solo se usan datos de contacto **de negocios publicados públicamente**. Cada teléfono y correo lleva su fuente.
- Los correos incluyen un pie para darse de baja (**CAN-SPAM**). Si alguien pide no ser contactado, márcalo como
  **"No contactar"** y pídele al administrador agregarlo a `config/blocklist.json`.
- Llamadas B2B manuales desde tu teléfono. No uses marcadores automáticos ni mensajes pregrabados hacia celulares (TCPA).
- Correos marcados como **"Deducido"** no se vieron publicados: confírmalos en la llamada antes de escribirles.

## 6. Problemas frecuentes

| Problema | Solución |
|---|---|
| La búsqueda termina con "Failed to authenticate" o "OAuth session expired" | Tu sesión de Claude caducó: en una terminal ejecuta `claude`, escribe `/login` e inicia sesión de nuevo. |
| "No se encontró Claude Code" | Instálalo y reinicia la herramienta. Verifica con `claude --version`. |
| El puerto 4600 está ocupado | La herramienta ya está abierta: entra a http://localhost:4600. Para usar otro puerto: `PORT=4700 npm start`. |
| "Tienes cambios locales" al actualizar | Modificaste archivos de la herramienta. Descártalos con `git checkout -- .` (tus leads no se tocan) y actualiza. |
| Pocos leads en una búsqueda | Amplía estados o ciudades, desactiva "Solo leads con teléfono", o elige otro nicho en **Nichos**. |

## Desarrollo

```bash
npm test          # pruebas de normalización, validación, puntaje y deduplicación
npm run check     # diagnóstico del entorno
node scripts/cli.mjs help
```
