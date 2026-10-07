@echo off
title Devleck Lead Engine
cd /d "%~dp0"
where node >nul 2>nul || (echo Necesitas instalar Node.js 18 o superior: https://nodejs.org & pause & exit /b 1)
where claude >nul 2>nul || echo AVISO: no se encontro Claude Code. Instalalo desde https://claude.com/claude-code y ejecuta "claude" una vez para iniciar sesion.
node server/index.mjs
pause
