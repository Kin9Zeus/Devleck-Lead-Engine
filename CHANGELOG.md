# Changelog

## v1.1.0 — 2026-11-07

### Embudo de ventas
- Los leads se separan en listas por etapa: Por contactar · En intento · Interesados · Reunión · Propuesta · Ganados · Cerrados sin venta.
- Nueva vista **Embudo** (tablero) con arrastrar y soltar para cambiar de etapa.
- **Cercanía al sí** (0–100%): combina la etapa, el nivel de interés que asigna el vendedor y la calidad del lead. Todas las listas se pueden ordenar por cercanía.
- **Nivel de interés** del lead (1 Frío → 5 Listo para cerrar), que se asigna desde la ficha o al registrar el resultado de una llamada.
- Nuevos resultados de llamada: "Propuesta enviada" y "Cerró — ganado".

### Tareas, seguimientos y notas
- **Próximos pasos** por lead, ordenados por prioridad: tareas sugeridas según el estado del lead (desaparecen solas al cumplirse) y tareas manuales con prioridad y fecha.
- Nueva vista **Agenda**: seguimientos y tareas vencidos, de hoy y de los próximos 7 días. Incluye un feed de notas del equipo.
- **Recordatorios** dentro de la app y, si los activas, en el escritorio. Contador rojo en el menú y en la pestaña del navegador cuando hay seguimientos vencidos.
- Programación rápida de seguimientos (+1 h, mañana 9:00, +3 días, +1 semana).
- **Notas visibles**: la última nota aparece en todas las listas y tarjetas, se pueden fijar arriba y la búsqueda incluye su texto.

### Datos manuales
- Agregar teléfonos, correos y personas (con notas) a cualquier lead, y editar los datos del negocio.
- Lo editado a mano queda marcado como "manual" y la IA nunca lo sobrescribe al volver a investigar el lead.

### Sistema de colores
- Colores consistentes para etapa, interés, cercanía, prioridad, urgencia del seguimiento y tier, con una **Guía de colores** integrada.

### Nichos
- **Potencial calibrado** para los 26 nichos con una rúbrica fija de seis dimensiones (crecimiento, dolor, capacidad de pago, encaje, tamaño de mercado, contactabilidad) y datos de mercado de EE. UU. citados.
- La prioridad (★) ahora se deriva del potencial. `/nichos` usa la misma rúbrica y el puntaje se calcula a partir de las dimensiones.

### Catálogo
- Precios ajustados a la realidad de un equipo senior en Colombia que vende a EE. UU., con mensualidades donde aplica.
- **Guía de ventas** en español para cada servicio: qué es, cómo funciona, ejemplo real, preguntas para calificar, cómo hablar del precio y glosario.
- Nuevo servicio: **AI Adoption Training & Coaching** (capacitación en IA para equipos y personas), aplicable a todos los nichos.

### Seguridad de los datos
- Al arrancar, los leads de versiones anteriores se migran sin perder información, y se guarda una copia diaria en `workspace/backups/`. Antes de cada actualización se hace una copia adicional.

### Otros
- Nuevo logo.
- Modo demo actualizado (`npm run demo`).

## v1.0.0 — 2026-10-07
- Primera versión: prospección con Claude Code, validación y puntaje de leads, cola de llamadas, inteligencia de nichos, catálogo y actualizaciones desde la app.
