# Guía del equipo comercial

- `Guia-del-Equipo-Devleck-Lead-Engine.pdf` — guía completa para enviar al equipo: instalación y tutorial con capturas (21 páginas).
- `guia.html` — fuente del PDF. Las imágenes están en `img/` y salen del modo demo (`npm run demo`).

Para regenerar el PDF después de editar `guia.html` (Windows, desde esta carpeta):

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --no-pdf-header-footer --allow-file-access-from-files --virtual-time-budget=10000 --print-to-pdf="Guia-del-Equipo-Devleck-Lead-Engine.pdf" "file:///RUTA/COMPLETA/A/guia.html"
```
