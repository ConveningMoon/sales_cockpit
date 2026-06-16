# Prompt inicial para Claude Code — Arranque del proyecto

Eres el desarrollador de un proyecto nuevo: una herramienta interna de prospeccion
(ITMANO Sales Cockpit). Antes de escribir codigo, sigue estrictamente este orden y respeta
los principios del `CLAUDE.md`.

## Fase 0 — Diagnostico (NO escribas codigo todavia)

1. Lee completo el archivo `CLAUDE.md` en la raiz del repo. Lee tambien
   `supabase/migrations/001_sales_cockpit_schema.sql` y, si existen, los archivos en
   `/prompts/`.
2. Haz un analisis profundo del estado actual del proyecto: que existe, que falta, y si el
   repo esta vacio o ya tiene algo. No asumas nada.
3. Resume con tus propias palabras, para confirmar que entendiste:
   (a) el objetivo del proyecto, (b) el stack, (c) la decision de despliegue local-first +
   solo Agent SDK, (d) los dos flujos (entrante y batch), (e) el modelo de datos.
4. Lista cualquier duda, ambiguedad, riesgo o decision de diseno que necesites resolver
   ANTES de implementar — en especial los puntos de la seccion "Por verificar / preguntas
   abiertas" del CLAUDE.md (auth del Agent SDK y su credito mensual, LH2 -> localhost,
   payload del webhook, flujo de migraciones de Supabase).
5. Propon un plan concreto, en pasos pequenos, para el **Slice 1 (Fundaciones)**: scaffold
   de Next.js (App Router + TS + Tailwind v4 + shadcn/ui), conexion a Supabase y aplicacion
   de la migracion 001, variables de entorno necesarias, proteccion/auth local, cableado y
   verificacion del Agent SDK, y un healthcheck. Indica que archivos crearias y en que orden.

## PARA aqui

No implementes nada hasta que Dylan revise tu resumen, responda tus preguntas y apruebe el
plan del Slice 1.

---

Recuerda en todo momento: pregunta antes de asumir; analisis profundo y estado actual
primero; PRs pequenos; nada destructivo sin permiso; strings visibles al usuario en espanol
neutro latino; y si algo cambia durante el trabajo, actualiza el `CLAUDE.md`.
