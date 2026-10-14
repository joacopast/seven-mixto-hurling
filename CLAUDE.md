# Seven Mixto Hurling — sistema de gestión del torneo

App web para gestionar un torneo social de hockey mixto de 64 equipos: inscripción
online, cobro por transferencia bancaria (comprobante por WhatsApp, confirmado a mano
por el admin), fase de grupos, 4 copas (Oro/Plata/Bronce/Madera), resultados, llaves
y panel de organización.

**Documento de arquitectura y decisiones:** `docs/arquitectura.html`
(publicado como Artifact — es la fuente de verdad del diseño funcional).

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- PostgreSQL + Prisma
- Auth.js v5 — sesiones de base de datos (Prisma adapter). Dos logins separados:
  magic link por email (SMTP) para responsables de equipo, y usuario/contraseña
  fijo para staff (ver más abajo). Rol en `User.role`.
- Medio de pago por defecto: **transferencia bancaria manual** (alias/CBU cargados en
  `TournamentConfig`, comprobante por WhatsApp, confirmación a mano por el admin —
  `confirmManualPayment`). Mercado Pago Checkout Pro queda implementado y funcional pero
  **apagado por defecto** (`TournamentConfig.paymentMethod`): cobra comisión, no se usa.
- Email transaccional por SMTP genérico (`lib/email/send.ts`, nodemailer) — en producción,
  Brevo free (sin necesidad de dominio propio verificado). Ver nota de `SMTP_USER` en
  `docs/ESTADO.md`: no es el email de la cuenta, es el id que muestra Brevo en SMTP & API.
- Vitest (unit + integration) · Playwright (e2e)

## Principios

- **Motor de torneo puro** en `lib/tournament/` — sin DB, sin framework, 100% testeado:
  `pricing.ts`, `roster.ts`, `standings.ts`, `tiebreakers.ts`, `group-fixture.ts`,
  `scheduler.ts`, `cups.ts`, `bracket.ts`.
- **Servicios** en `lib/services/` — orquestan motor + DB + transacciones + `AuditLog`.
- **Nunca** confiar en el precio del frontend ni en un monto tipeado por el admin: el
  backend siempre lo recalcula (`calculatePrice`) y `confirmManualPayment` toma el monto
  de `Registration.totalAmount`, nunca de un input. Si algún día se reactiva Mercado Pago,
  el webhook también lo re-verifica.
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
  alternativo cuando SMTP está configurado).
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
lib/services      registration, payment (confirmManualPayment + MP dormido), groups,
                  results, cups, config, admin-teams, waitlist, notification(-dispatch), audit
lib/auth          config (edge-safe), index (Node, magic link), staff (usuario/contraseña),
                  guards, types
lib/email         send.ts (SMTP/nodemailer), templates.ts (un render por NotificationType)
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

## Estado

Fases 1-6 completas + cambio de medio de pago (148 tests verdes). El detalle por fase
(qué archivo hace qué) está en `docs/ESTADO.md`: leer solo la sección que toque la tarea.

- Tests de integración: comparten una DB → corren en serie (`fileParallelism: false`).
- Deploy: Vercel Hobby + Neon + GitHub (`joacopast/seven-mixto-hurling`), en marcha —
  detalle en `docs/ESTADO.md`. Próximo: cuenta de Gmail + contraseña de aplicación para
  `SMTP_USER`/`SMTP_PASS`, cron-job.org para los `/api/cron/*`, datos bancarios reales en
  `/admin/configuracion`, pulido visual final, más e2e, y pasar a Vercel Pro antes del
  evento (crons nativos + en regla comercialmente).
- Al terminar un cambio relevante, agregarlo en `docs/ESTADO.md`, no acá.

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
**pago por transferencia bancaria (alias/CBU) con comprobante por WhatsApp, confirmado a
mano por el admin — no se usa Mercado Pago por la comisión** · reembolso total ante
cualquier baja · edad mínima 16 · DNI obligatorio · multi-equipo por responsable · lista
de espera con promoción automática.
