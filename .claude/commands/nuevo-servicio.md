---
description: (Administrador) Agregar o actualizar un servicio/producto en el catálogo
argument-hint: [descripción del servicio o URL con información]
---
Vas a agregar o actualizar un servicio/producto en `config/services.json`.

Información inicial: $ARGUMENTS

1. Lee `config/services.json` (respeta exactamente la estructura de los items existentes) y `config/niches.json`.
2. Si la información es insuficiente, haz como máximo 5 preguntas concretas en un solo mensaje: qué es y qué entrega,
   a quién se le vende (nichos y tamaño), qué señales indican que un negocio lo necesita, qué lo descalifica, rango de
   precio y plazos, y prueba/demo disponible.
3. Investiga brevemente en la web el mercado de USA para ese servicio (dolores típicos, objeciones, competencia) y
   completa: `buyingSignals`, `disqualifiers`, `painPointsSolved`, `roi`, `pitch` (en inglés), `objections` (en inglés), `keywords`.
4. Si el servicio apunta a nichos que no existen en `config/niches.json`, crea esas entradas con la misma estructura.
5. Muestra un resumen del item creado y ejecuta `node scripts/cli.mjs brief` para validar que el JSON carga bien.
6. Recuerda al administrador publicar el cambio para el equipo:
   `git add config && git commit -m "Catálogo: <servicio>" && git push`
