# Seven Mixto — estado del desarrollo

Detalle de lo implementado por fase (movido desde CLAUDE.md para no cargarlo en cada sesión).

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

Cambio de medio de pago (post Fase 6): se reemplazó Mercado Pago como medio de pago
principal por **transferencia bancaria manual** — cobraba mucha comisión. Mercado Pago
queda implementado y testeado pero apagado por defecto.

- Schema: `TournamentConfig.paymentMethod` (`MANUAL_TRANSFER` default | `MERCADOPAGO`) +
  `bankHolderName/bankCuit/bankName/bankAlias/bankCbu/whatsappPhone/whatsappMessageTemplate`.
  `PaymentProvider` suma `MANUAL_TRANSFER`; `Payment.mpPreferenceId` ahora opcional
  (nulo en transferencias); `Payment.confirmedById`. Migración `manual_payment_method`.
- `lib/tournament/whatsapp.ts` (puro): `normalizePhone`, `renderWhatsAppMessage`
  (placeholders `{team}`/`{amount}`), `buildWhatsAppLink` → link `wa.me` con texto
  precargado. Con tests.
- `lib/services/payment.ts` → `confirmManualPayment(registrationId, {note}, ctx)`: crea
  un `Payment` provider `MANUAL_TRANSFER` con `amount = Registration.totalAmount` (nunca
  un monto tipeado a mano), confirma la inscripción, misma guarda de sobrecupo que
  `applyMpPayment` (→ `WAITLISTED_OVERBOOK` si ya no hay cupo), encola `PAYMENT_APPROVED`
  + `TEAM_APPROVED`, auditoría `payment.manual.confirm`. Idempotente si ya estaba
  confirmado; rechaza sobre una inscripción `CANCELLED`.
- UI: `/admin/configuracion` tiene la sección "Medio de pago" (radio + datos bancarios +
  WhatsApp + plantilla de mensaje, con warnings si falta algo). `/admin/equipos/[id]` y
  `/admin/pagos` (sección "Pendientes de confirmar", con link directo a WhatsApp del
  equipo) tienen el botón "Confirmar pago recibido". La página pública
  `/inscripcion/pago/[id]` muestra alias/CBU copiables + botón "Enviar comprobante por
  WhatsApp" cuando `paymentMethod = MANUAL_TRANSFER`; si se reactivara Mercado Pago,
  muestra el flujo de checkout de siempre. Copy de home/wizard/reglamento actualizado
  para no nombrar Mercado Pago.
- `seed.ts`: `paymentMethod: MANUAL_TRANSFER`, `paymentSurchargeBp: 0` (antes 6%, era el
  recargo de MP), datos bancarios en placeholder — **hay que cargar los reales en
  `/admin/configuracion` antes de abrir inscripciones**.

148 tests verdes.

Deploy (2026-10-14): Vercel Hobby + Neon + GitHub (`github.com/joacopast/seven-mixto-hurling`).
Vercel Hobby no permite Cron Jobs nativos más seguidos que 1/día (bloquea el deploy entero
si `vercel.json` los define) — por eso `vercel.json` quedó sin `crons` y los tres endpoints
(`/api/cron/notifications` cada 5 min, `/api/cron/reconcile-payments` cada hora,
`/api/cron/waitlist` cada 30 min) hay que pegarles desde un pinger externo gratuito
(cron-job.org) con header `Authorization: Bearer <CRON_SECRET>`. Al pasar a Vercel Pro antes
del evento, se puede volver a poner el `crons` nativo (está en el historial de git) y dar de
baja el pinger externo. `DIRECT_URL` se agregó al datasource de Prisma — `DATABASE_URL`
corre con el pooler de Neon en runtime, `DIRECT_URL` (sin pooler) solo la usa `prisma migrate`.

Manual de uso para la organización: `docs/manual-organizacion.html`, publicado como
Artifact (https://claude.ai/artifact/3ffBmjArdGrBckc4Jq8DQx) — login de staff, mapa del
panel, checklist antes de abrir inscripción, confirmar pagos por transferencia, lista de
espera, armar grupos/fixture/copas, auditoría, día del evento y FAQ.

Email (2026-10-14): se reemplazó Resend por SMTP genérico (`lib/email/send.ts` con
nodemailer, `lib/auth/index.ts` usa el provider `Nodemailer` de next-auth, id
`"nodemailer"` — ambos `signIn()` del magic link se actualizaron) — evita comprar y
verificar un dominio propio solo para mandar emails. Se probó Gmail primero pero esa
cuenta de Gmail no dejó activar verificación en 2 pasos (cuenta restringida/Workspace) —
se terminó usando **Brevo** (ex-Sendinblue, free, 300 emails/día), que solo pide
verificar el email remitente con un click, sin DNS. Config en producción:
`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`. Sin `SMTP_USER`/`SMTP_PASS` el magic
link se imprime en consola, igual que antes.

**Gotcha de Brevo que costó varias vueltas:** el `SMTP_USER` NO es el email de la cuenta
de Brevo — es un id generado que se ve en SMTP & API → pestaña SMTP, campo "Iniciar
sesión" (formato `xxxxxxx@smtp-brevo.com`). Usar el email de cuenta ahí da siempre
`535 Authentication failed`, con cualquier clave. También existe un aviso de "IPs no
autorizadas" en Brevo (relevante solo si se deja esa restricción activa; Vercel no tiene
IP de salida fija en el plan free, así que esa restricción se desactivó).

Deploy verificado end-to-end (2026-10-14): inscripción real contra producción con
Playwright, equipo ficticio, responsable con email real → confirmado en los logs de
Vercel (`vercel logs`) que el envío SMTP salió sin error tras corregir el `SMTP_USER`.
Si en algún momento se compra un dominio, Resend (u otro proveedor) se puede reactivar
reemplazando el transporte de `sendEmail` sin tocar el resto de la app.

Crons (2026-10-14): los 3 pings externos quedaron armados en cron-job.org vía su API
(console.cron-job.org) — `notifications` cada 5 min, `reconcile-payments` cada hora,
`waitlist` cada 30 min, cada uno con header `Authorization: Bearer <CRON_SECRET>`.
El `CRON_SECRET` se regeneró una vez (el original nunca se guardó, a propósito) y se
verificó con un curl directo al endpoint antes de configurar los jobs. Al pasar a
Vercel Pro, se puede volver al `crons` nativo de `vercel.json` (ver más arriba) y
deshabilitar/borrar estos 3 jobs en cron-job.org.

Finalizar torneo + podio (2026-10-14): el torneo **ya se auto-finaliza** al cargar la
última final de las 4 copas (`setCupMatchResult` en `lib/services/cups.ts`, línea ~474 —
no hizo falta agregar esto, ya estaba). Lo que sí se agregó: paso 6 en `/admin/torneo`
que muestra el podio (🥇🥈🥉) de las 4 copas cuando está FINISHED, y "Reabrir (corregir
resultado)" por si hace falta corregir algo después de finalizado (vuelve a
`CUPS_IN_PROGRESS`). El botón "Reabrir inscripción" ya existía también (paso 1, visible
con inscripción cerrada) — no hizo falta agregarlo. `getCupsWithBrackets` ahora trae
también `thirdPlaceNames` (antes solo campeón/subcampeón); nuevo
`TournamentPodium`/`CupPodium` en `components/bracket-view.tsx`, reusado en
`/admin/torneo` y en `/torneo` (sección "🏆 Resultados finales").

Vaciar torneo para una edición nueva (2026-10-14): `/admin/configuracion` → "Zona de
peligro" — borra equipos, jugadores, inscripciones, pagos, grupos, copas, llaves y
partidos del torneo activo; `Tournament`/`TournamentConfig` quedan (mismo id/slug),
status vuelve a `SETUP`. El `AuditLog` de la edición anterior NO se borra (su FK a
Tournament es `ON DELETE SET NULL`), queda como historial. Requiere escribir el nombre
exacto del torneo para habilitar el botón (`app/(admin)/admin/configuracion/danger-zone.tsx`),
revalidado server-side (`resetTournamentAction`). Servicio: `lib/services/reset.ts`
(`resetTournament`) — probado en `tests/integration/reset.test.ts` contra un torneo
completo (16 equipos, 4 grupos, 4 copas jugadas hasta la final) confirmando que se puede
armar un torneo nuevo desde cero después.

Edición de plantel desde el portal del equipo (2026-10-14): en `/mi-equipo` el
responsable ahora puede corregir los datos de un jugador ya cargado (nombre, documento,
fecha de nacimiento, género, camiseta, "juega/no juega") — **no agrega ni saca
jugadores**, así que no toca el precio de la inscripción (eso queda para otra etapa,
discutido pero no implementado: requeriría modelar un saldo pendiente distinto del
monto ya confirmado). `lib/services/admin-teams.ts` → `updatePlayer` (función genérica,
valida documento duplicado dentro del equipo); `lib/services/roster-self.ts` →
`updateMyPlayer` envuelve esa función para el caso del responsable: chequea que el
jugador sea de su equipo, que `TournamentConfig.rosterLockAt` no haya pasado, y la edad
mínima contra `tournament.startDate`. UI: `app/(team)/mi-equipo/player-row.tsx`
(fila con edición inline). Probado en `tests/integration/roster-self.test.ts` (6 tests:
edición ok, equipo ajeno, documento duplicado, plantel bloqueado, plantel sin bloquear,
edad mínima).

Torneo formato mundial — equipos son países (2026-10-14): decisión de negocio nueva,
cambia el modelo de equipo de raíz. `lib/countries.ts` — 195 países (193 ONU + Vaticano +
Palestina) en español (exónimos RAE/Fundéu: Catar, Baréin, Bangladés, Birmania, etc.),
cada uno con su código ISO 3166-1 alfa-3. El nombre del equipo (`Team.name`) ahora **tiene
que ser** uno de esos países — se valida con `isCountryName()` en los 3 lugares donde se
crea/edita un equipo: inscripción pública (`lib/services/registration.ts`), alta/edición
admin (`lib/services/admin-teams.ts`) y lista de espera (`lib/services/waitlist.ts`). Un
país, un equipo: los tres chequean que ese país no esté ya anotado (`registrationStatus
!= CANCELLED`) y tiran `DUPLICATE_TEAM`/`DUP_COUNTRY` si choca — chequeo a nivel
aplicación, no constraint de DB (ver nota abajo). Los tres `<select>` (wizard, alta admin,
lista de espera) deshabilitan con "(ya inscripto)" los países que ya están tomados, para
no hacer elegir algo que después va a rechazar.

`Team.shortName` (código ISO, ej. "ARG") pasa a ser **automático** — nunca se tipea,
sale de `countryCode()` al crear o editar el equipo. Se sacó `Team.clubTag` del todo
(migración `world_cup_teams_are_countries`, `DROP COLUMN`) y los campos "Nombre corto" /
"Club o barrio" de los 3 formularios (wizard, alta admin, editor admin) — ya no tienen
sentido con equipos = países.

Nota sobre la carrera de inscripción simultánea: el chequeo de "país ya tomado" es
best-effort a nivel aplicación (mismo criterio que ya usaba el cupo del torneo), no un
`@@unique` real en la base — agregar esa constraint pedía un índice único parcial (para
liberar el país si el equipo se cancela) y esto no es Postgres estándar en Prisma sin
SQL a mano. Para el volumen de este torneo no hace falta más que esto.

Pendiente / próximo: cargar alias/CBU/WhatsApp reales en `/admin/configuracion`,
pulido visual final, más cobertura e2e (pago, admin), pasar a Vercel Pro antes del
evento. Discutido pero no implementado: agregar/sacar jugadores desde el portal con
recálculo de pago cuando el plantel supera los 10 incluidos (el precio por jugador
extra ya existe en `calculatePrice`; falta decidir la política de baja/reembolso
parcial antes de tocar código).
