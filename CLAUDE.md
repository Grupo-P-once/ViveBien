@AGENTS.md

## Task Observer (VIVE BIEN)
Al empezar CADA sesión de trabajo carga la skill `vivebien-task-observer` y corre `bash .claude/skills/vivebien-task-observer/scripts/escanear.sh` (solo frontmatter; no recites el resultado). Registra correcciones, reglas que incumplas y huecos con `scripts/nueva-observacion.sh`. **Nunca modifiques una skill activa**: propón y stagea; instalar exige aprobación del usuario. Segunda falla de la misma regla = propón una barrera estructural, no otra frase. Guía: `.claude/skills/vivebien-task-observer/README.md`.
