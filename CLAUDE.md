# Seven Mixto Hurling — sistema de gestión del torneo

App web para gestionar un torneo social de hockey mixto de 64 equipos: inscripción
online, cobro con Mercado Pago, fase de grupos, 4 copas (Oro/Plata/Bronce/Madera),
resultados, llaves y panel de organización.

**Documento de arquitectura y decisiones:** `docs/arquitectura.html`
(publicado como Artifact — es la fuente de verdad del diseño funcional).

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- PostgreSQL + Prisma
- Auth.js v5 — magic link por email (Resend). Rol en `User.role`; `ADMIN` por allowlist `ADMIN_EMAILS`.
- Mercado Pago Checkout Pro (Fase 2, aún no implementado)
- Vitest (unit + integration) · Playwright (e2e, pendiente)

## Principios

- **Motor de torneo puro** en `lib/tournament/` — sin DB, sin framework, 100% testeado.
  `pricing.ts`, `roster.ts` ya existen. Faltan: standings, tiebreakers, cups, bracket, fixture, scheduler.
- **Servicios** en `lib/services/` — orquestan motor + DB + transacciones + `AuditLog`.
- **Nunca** confiar en el precio del frontend: el backend lo recalcula (`calculatePrice`) y
  lo re-verifica en el webhook de pago.
- Autorización server-side siempre: `lib/auth/guards.ts` (`requireRole`, `requireTeamAccess`).
  Ocultar botones en el front no cuenta.
- Toda mutación crítica corre en una transacción que también escribe `AuditLog` (`writeAudit(tx, …)`).
- Dinero: enteros en **centavos de ARS**.
- El torneo NO está hardcodeado a 64: todo sale de `TournamentConfig`. El default está
  optimizado para 64 / 16×4 / 4 copas / 6 canchas.

## Estructura

```
app/(public)      home, /torneo, /reglamento, /inscripcion (wizard), /ingresar
app/(team)        /mi-equipo (portal del responsable)
app/(admin)/admin dashboard, equipos, configuración
app/api           /auth, /admin/export/{teams,players}
lib/tournament    motor puro (pricing, roster, queries, status)
lib/services      registration, waitlist, audit
lib/auth          config (edge-safe), index (Node), guards, types
prisma            schema.prisma, migrations, seed.ts
tests/unit        motor puro
tests/integration servicios contra DB de test (.env.test → seven_mixto_test)
```

## Comandos

```bash
docker compose up -d          # Postgres local
cp .env.example .env          # completar AUTH_SECRET, ADMIN_EMAILS
npm run db:migrate            # aplicar migraciones
npm run db:seed               # crear torneo activo + config + admins
npm run dev

npm test                      # vitest (unit + integration)
npm run typecheck
npm run build
```

La DB de tests (`seven_mixto_test`) se migra aparte:
`DATABASE_URL=...seven_mixto_test npx prisma migrate deploy`.

## Estado — Fases 1-5 completas

Fase 1: schema completo, auth, inscripción (wizard → `Registration` en `PENDING_PAYMENT`),
portal del equipo, panel admin (resumen, equipos, buscar, cambiar estado, export CSV),
lista de espera, motor de precios y validación de plantel con tests.

Fase 2: Mercado Pago Checkout Pro. `lib/payments/mercadopago.ts` (cliente REST + firma webhook),
`lib/services/payment.ts` (`createCheckoutForRegistration`, `applyMpPayment` core, webhook
idempotente vía `WebhookEvent`, `reconcilePendingPayments`). Rutas `/api/webhooks/mercadopago`,
`/api/cron/reconcile-payments` (`CRON_SECRET`, Vercel Cron en `vercel.json`),
`/api/registrations/[id]/status`. Página `/inscripcion/pago/[id]` (checkout + poller) y
`/admin/pagos`. Sin `MP_ACCESS_TOKEN` degrada a "pago no habilitado" sin romperse.
El webhook re-consulta SIEMPRE el pago a la API de MP; nunca confía en el body.

Fase 3: motor puro de torneo en `lib/tournament/` — `standings.ts` (tabla), `tiebreakers.ts`
(cascada configurable con mini-tabla H2H y sorteo determinista por hash), `group-fixture.ts`
(round-robin círculo + balance de localía), `scheduler.ts` (empaqueta grupo-fechas en tandas
sin choque de equipo). Servicios `lib/services/groups.ts` (sorteo auto serpiente/manual,
`saveGroupAssignment`, `generateGroupPhaseFixture`) y `lib/services/results.ts`
(`setGroupMatchResult` → recalcula GroupTeam en la misma transacción; corregir un resultado
reordena el grupo). Admin `/admin/torneo` (pipeline de 4 pasos), `/admin/torneo/grupos`
(editor), `/admin/torneo/resultados` (carga inline). Público `/torneo` muestra grupos con
posiciones (dots Oro/Plata/Bronce/Madera) + horarios/resultados por tanda.

Fase 4: `lib/tournament/cups.ts` (`assignCups`: 1º→Oro … 4º→Madera, siembra por rendimiento)
y `bracket.ts` (`buildSingleElimBracket(size)` genérico, siembra canónica, `resolveBracket`).
`lib/services/cups.ts` — `generateCups` (crea Cup + Bracket + BracketMatch + Match, octavos con
equipos, resto TBD, agenda ronda por ronda; atómico y reversible sin resultados) y
`setCupMatchResult` (goles / penales si empata / walkover → `winnerTeamId` → propaga al
`feedsWinnerTo`; si el downstream ya tenía resultado exige `confirmCascade` y limpia la rama;
la final marca campeón/subcampeón/3os y cierra el torneo). Admin `/admin/torneo/copas`,
público `/torneo` con `<BracketView>` (columnas por ronda, scroll horizontal en mobile).

Fase 5: `lib/services/config.ts` (config del torneo editable — precios en pesos↔centavos,
recargo %↔bp, tiebreakers, contenido; bloquea equipos/grupos si ya hay estructura; warnings).
`lib/services/admin-teams.ts` (alta/edición de equipo, alta/baja de jugador con anti-duplicado,
eliminación con guarda de partidos, asignar seed). `waitlist.ts` extendido: `promoteWaitlistEntry`
+ `autoPromoteWaitlist` (expira invitaciones vencidas, llena cupos) + cron `/api/cron/waitlist`.
UI: `/admin/configuracion` (form completo), `/admin/equipos/nuevo`, edición + jugadores en
`/admin/equipos/[id]`, `/admin/espera`, `/admin/auditoria` (log navegable con filtros).

Pendiente: Fase 6 (notificaciones por email + e2e + deploy productivo).

Nota tests: los de integración comparten una DB → corren en serie (`fileParallelism: false`).
125 tests verdes.

## Diseño / marca

Referencia: Instagram @sevenmixtohurling. Una sola apariencia comprometida (no hay
tema claro): **verde pino profundo de fondo**, tipografía **serif crema de alto contraste**
(Playfair Display, en mayúsculas) + Montserrat para texto, tarjetas de esquinas muy
redondeadas (`rounded-card`), **acento naranja del zorro** (`--pop`) usado con moderación,
píldoras negras (`bg-pill`) para destacar precios. Botón primario = crema sobre verde.
Tokens en `app/globals.css`; utilidades semánticas en `tailwind.config.ts` (`bg-surface`,
`text-ink`, `border-line`, `text-pop-soft`, …).

Pendiente: el logo oficial del año (copa + laurel, lo diseñan aparte). Por ahora se usa
un escudo SVG en línea (`<Crest/>` en `components/ui.tsx`) que evoca el logo. Falta también
la mascota (zorro) — no tenemos el asset.

Nota: al tocar `tailwind.config.ts`, reiniciar `next dev` con `rm -rf .next` (cachea utilidades).

## Decisiones de negocio confirmadas

Evento de 1 día · copas por eliminación directa simple sin 3er puesto · asignación de copa
por posición en el grupo · inscripción abierta por orden de llegada · sorteo de grupos manual ·
comisión MP sumada al precio (`paymentSurchargeBp`) · reembolso total ante cualquier baja ·
solo pago por Mercado Pago (sin pago manual) · edad mínima 16 · DNI obligatorio ·
multi-equipo por responsable · lista de espera con promoción automática.
