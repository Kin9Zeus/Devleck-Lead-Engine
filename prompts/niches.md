# Inteligencia de nichos — ¿a quién le vendemos ahora en USA?

Objetivo: decirle al equipo de ventas **qué nichos atacar primero**, con evidencia actual, cruzando el
mercado de USA con el catálogo de Devleck. Sé un analista, no un vendedor: si un nicho no conviene, dilo.

## Parámetros (opcionales, en el mensaje)
- `focus`: nichos o servicios a evaluar (ej. "joyerías y AI design", o un `serviceId`).
- `states`: estados/región a considerar.
- `discover`: si es true (por defecto), propone también 3–5 nichos **nuevos** que no estén en `config/niches.json`.

## Pasos

1. Lee `config/services.json`, `config/niches.json`, `config/company.json` y, si existe, `workspace/niche-insights.json` (análisis previo).
2. Investiga con búsqueda web (prioriza fuentes de 2025–2026):
   - Crecimiento: BLS Employment Projections, Census (Business Formation Statistics, County Business Patterns),
     IBISWorld "fastest growing industries", reportes de asociaciones del sector, noticias (bizjournals, Forbes, WSJ).
   - Adopción tecnológica / dolor: encuestas del sector sobre falta de personal, costos laborales, adopción de IA,
     quejas frecuentes en reseñas, volumen de vacantes administrativas (Indeed/LinkedIn).
   - Capacidad de pago: ingresos promedio, márgenes, ticket promedio del cliente final.
   - Fragmentación: muchas PyMEs independientes (bueno) vs. pocas cadenas grandes (malo para nosotros).
   - Competencia: cuántos SaaS verticales ya dominan el nicho (mucha competencia = ángulo de customización).
3. Para cada nicho evaluado calcula `opportunityScore` 0–100 ponderando: crecimiento (25), dolor que resolvemos
   (25), capacidad de pago (20), encaje con el catálogo (20), facilidad de contacto telefónico (10).
4. Identifica mercados calientes (ciudades/estados donde el nicho crece más) y el mejor ángulo de venta.

## Salida

Escribe `workspace/inbox/niche-insights-<fecha>.json`:

```json
{
  "summary": "3–5 frases en español: dónde está la mejor oportunidad ahora y por qué.",
  "niches": [
    {
      "id": "jewelry-stores",
      "name": "Jewelry stores & custom jewelers",
      "opportunityScore": 82,
      "growth": "high|medium|low",
      "growthEvidence": [{ "detail": "…", "source": "https://…" }],
      "painEvidence": [{ "detail": "…", "source": "https://…" }],
      "whyNow": "…",
      "bestServices": ["ai-jewelry-design-studio"],
      "pitchAngle": "…",
      "hotMarkets": ["Dallas, TX", "Miami, FL"],
      "estimatedDealSize": "$6k–$15k",
      "risks": "…",
      "searchKeywords": ["…"],
      "recommendedPriority": 5
    }
  ],
  "sources": ["https://…"]
}
```

Usa ids existentes de `config/niches.json` cuando corresponda; para nichos nuevos crea un id en kebab-case.
Luego ejecuta `node scripts/cli.mjs insights <archivo>`.

Termina con un resumen en español: top 5 nichos con su puntaje y la acción sugerida
(ej. "Prospectar med spas en Miami y Houston con AI Receptionist"). Si un nicho nuevo vale la pena,
sugiere al administrador agregarlo a `config/niches.json`.
