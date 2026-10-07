# Preparar llamada / enriquecer un lead

Objetivo: dejar al vendedor listo para una llamada de alta conversión con un lead concreto.

1. `node scripts/cli.mjs lead <id>` para ver el lead actual. Lee el servicio recomendado en `config/services.json`
   y `config/company.json`.
2. Investiga de nuevo (WebSearch/WebFetch), buscando sobre todo lo que **falte o esté débil**:
   - Decisor con nombre y cargo; teléfono directo o móvil de negocio publicado; correo verificado.
   - Noticias o cambios recientes (nueva sede, contratación, premios, reseñas recientes).
   - Confirmar que el negocio sigue abierto y que el teléfono es el correcto.
   - Herramientas que usan hoy (software de reservas, CRM, e-commerce) y competidores locales que ya lo hacen mejor.
3. Mejora el pitch con lo nuevo: `callOpener`, `discoveryQuestions`, `objections`, `voicemail`, `email`, `followUpEmail`.
   Si encuentras evidencia de que otro servicio encaja mejor, cambia `recommendation` y explica por qué.
4. Escribe el lead COMPLETO actualizado (mismo formato que `prompts/prospect.md`, sección 6; mismo `business.name`,
   `city`, `state` y `website` para que se fusione) en `workspace/inbox/enrich-<id>.json` como arreglo de 1 elemento
   y ejecuta `node scripts/cli.mjs ingest workspace/inbox/enrich-<id>.json`.
5. Responde en español con un **brief de llamada** de una pantalla:
   - Quién es y por qué le importa (2 líneas) · A quién pedir · Mejor hora (hora local del lead).
   - Lo que sabemos de su dolor (con evidencia) · Qué vender y rango de precio.
   - Opener exacto en inglés · 3 preguntas clave · 2 objeciones con respuesta · Siguiente paso a proponer.

Nunca inventes datos: todo dato de contacto nuevo lleva `source`.
