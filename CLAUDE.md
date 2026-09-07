# Seven Mixto Hurling — sistema de gestión del torneo

App web para gestionar un torneo social de hockey mixto de 64 equipos: inscripción
online, cobro con Mercado Pago, fase de grupos, 4 copas (Oro/Plata/Bronce/Madera),
resultados, llaves y panel de organización.

**Documento de arquitectura y decisiones:** `docs/arquitectura.html`
(publicado como Artifact — es la fuente de verdad del diseño funcional).

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- PostgreSQL + Prisma
- Auth.js v5 — sesiones de base de datos (Prisma adapter). Dos logins separados:
  magic link por email (Resend) para responsables de equipo, y usuario/contraseña
  fijo para staff (ver más abajo). Rol en `User.role`.
- Mercado Pago Checkout Pro
- Resend (email transaccional)
- Vitest (unit + integration) · Playwright (e2e)

## Principios

- **Motor de torneo puro** en `lib/tournament/` — sin DB, sin framework, 100% testeado:
  `pricing.ts`, `roster.ts`, `standings.ts`, `tiebreakers.ts`, `group-fixture.ts`,
  `scheduler.ts`, `cups.ts`, `bracket.ts`.
- **Servicios** en `lib/services/` — orquestan motor + DB + transacciones + `AuditLog`.
- **Nunca** confiar en el precio del frontend: el backend lo recalcula (`calculatePrice`) y
  lo re-verifica en el webhook de pago.
- Autorización server-side siempre: `lib/auth/guards.ts` (`requireRole`, `requireTeamAccess`).
  Ocultar botones en el front no cuenta.
- Toda mutación crítica corre en una transacción que también escribe `AuditLog` (`writeAudit(tx, …)`).
- Dinero: enteros en **centavos de ARS**.
- El torneo NO está hardcodeado a 64: todo sale de `TournamentConfig`. El default está
  optimizado para 64 / 16×4 / 4 copas / 6 canchas.

## Acceso admin (staff) — leer antes de tocar auth

`/admin` es **solo para staff** y usa un login separado del de los equipos:

- **`/staff`** — usuario/contraseña fijos (`lib/auth/staff.ts`). Sin `STAFF_USERNAME` /
  `STAFF_PASSWORD` / `STAFF_PASSWORD_HASH` configurados: en **desarrollo** cae a
  `admin` / `admin`; en **producción** el login queda cerrado (nunca un default inseguro).
  Hash para producción: `npm run hash:password -- "contraseña"` → `STAFF_PASSWORD_HASH`.
- **`/ingresar`** — magic link por email, para responsables de equipo (`TEAM_MANAGER`).
  Si ese email está en `ADMIN_EMAILS`, al entrar se le promueve a `ADMIN` igual (login
  alternativo cuando Resend está configurado).
- Ambos flujos terminan en una `Session` de Auth.js normal — `getSessionUser`/`requireRole`
  no distinguen cómo se creó la sesión.
- `middleware.ts` redirige `/admin/*` sin sesión a `/staff` (no a `/ingresar`).
  `app/(admin)/admin/layout.tsx` hace el mismo chequeo server-side (`getSessionUser`).

## Estructura

```
app/(public)      home, /torneo, /reglamento, /inscripcion (wizard), /ingresar
app/staff         login de staff (usuario/contraseña) → /admin
app/(team)        /mi-equipo (portal del responsable: datos, plantel, partidos, grupo/copa)
app/(admin)/admin dashboard, equipos, torneo (grupos/resultados/copas), pagos,
                  lista de espera, auditoría, configuración
app/api           /auth, /webhooks/mercadopago, /cron/*, /admin/export/{teams,players},
                  /registrations/[id]/status
lib/tournament    motor puro (pricing, roster, standings, tiebreakers, group-fixture,
                  scheduler, cups, bracket, + *-view.ts de lectura para UI)
lib/services      registration, payment, groups, results, cups, config, admin-teams,
                  waitlist, notification(-dispatch), audit
lib/auth          config (edge-safe), index (Node, magic link), staff (usuario/contraseña),
                  guards, types
lib/email         send.ts (Resend), templates.ts (un render por NotificationType)
prisma            schema.prisma, migrations, seed.ts
tests/unit        motor puro
tests/integration servicios contra DB de test (.env.test → seven_mixto_test)
tests/e2e         Playwright contra `npm run start` + DB de dev
```

## Comandos

```bash
docker compose up -d          # Postgres local
cp .env.example .env          # completar AUTH_SECRET, ADMIN_EMAILS, STAFF_*
npm run db:migrate            # aplicar migraciones
npm run db:seed               # crear torneo activo + config + admins
npm run dev                   # /admin -> /staff -> admin/admin (sin STAFF_* en dev)

npm test                      # vitest (unit + integration)
npm run test:e2e              # playwright (requiere build + start + seed)
npm run typecheck
npm run build
npm run hash:password -- "contraseña"   # genera STAFF_PASSWORD_HASH para prod
```

La DB de tests (`seven_mixto_test`) se migra aparte:
`DATABASE_URL=...seven_mixto_test npx prisma migrate deploy`.

## Estado — Fases 1-6 completas

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
reordena el grupo). Admin `/admin/torneo` (pipeline de pasos), `/admin/torneo/grupos`
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

Fase 6: notificaciones por email reales — `lib/email/templates.ts` (un render HTML/texto por
`NotificationType`, on-brand) + `lib/services/notification-dispatch.ts`
(`dispatchQueuedNotifications`: toma la cola `Notification(status=QUEUED)`, resuelve
destinatario, envía por Resend, marca SENT/FAILED/SKIPPED). Cron `/api/cron/notifications`
(cada 5 min): encola `MATCH_UPCOMING` para partidos que arrancan en 20–45 min y despacha la
cola. `registration.create` y `groups.publishGroups` ahora encolan `REGISTRATION_CONFIRMED` y
`FIXTURE_PUBLISHED`. Portal `/mi-equipo` ampliado con partidos propios, horario/cancha/rival,
resultado y grupo/copa en vivo (`lib/tournament/team-view.ts`). SEO: `robots.ts`, `sitemap.ts`,
`opengraph-image.tsx`. E2E: `playwright.config.ts` + `tests/e2e/` contra `npm run start`.
**Acceso staff**: login `/staff` con usuario/contraseña (`lib/auth/staff.ts`) — ver sección
arriba; resuelve que `/admin` dependiera únicamente del magic link (que no llega si Resend no
está configurado).

Nota tests: los de integración comparten una DB → corren en serie (`fileParallelism: false`).
133 tests verdes.

Pendiente / próximo: deploy productivo (Vercel + Neon/Supabase, variables de entorno,
credenciales reales de MP y Resend, `STAFF_PASSWORD_HASH`), pulido visual final, más
cobertura e2e (pago, admin).

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
