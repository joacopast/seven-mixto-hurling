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

Seña / pago parcial + datos de jugador (fiesta, dieta, edad) + CSV (2026-10-14):

- **Seña para reservar el cupo.** `RegistrationStatus.DEPOSIT_PAID` (nuevo, migración
  `deposit_payment_dietary_party`): un equipo puede pagar menos que el total y reservar
  su lugar sin confirmarse todavía. `lib/services/payment.ts` → `confirmManualPayment`
  ahora acepta `opts.amount` (centavos); si es `undefined` cobra el saldo completo (mismo
  comportamiento de siempre), si es menor al saldo crea el `Payment` APPROVED por ese
  monto, pasa el equipo a `DEPOSIT_PAID` (`paymentStatus: PENDING`) y encola
  `PAYMENT_APPROVED` con `payload.kind: "deposit"` (email distinto, "seña recibida").
  Cuando la suma de pagos aprobados llega al total, confirma igual que antes (guarda de
  cupo / sobrecupo incluida). Nueva función `getAmountPaid()` (suma de `Payment` APPROVED
  de una inscripción) — el saldo SIEMPRE se deriva de ahí, nunca de un campo cacheado.
  `DEPOSIT_PAID` cuenta como cupo ocupado (`OCCUPYING_STATUSES`). UI: `/admin/pagos`
  (tarjeta "Señas sin completar" + columnas Pagado/Falta en la tabla de pendientes, con
  input de monto para cargar una seña o el saldo completo) y `/admin/equipos/[id]`
  (mismo input de monto en el botón de confirmar pago). `/mi-equipo` e
  `/inscripcion/pago/[id]` muestran "ya pagaste X / falta Y" cuando hay una seña.
- **Restricción alimenticia, fiesta post torneo y edad por jugador.** `Player` suma
  `dietaryRestriction` (texto libre, opcional) y `attendsParty` (bool, default `true`).
  Se cargan en los 3 lugares donde se agrega/edita un jugador (wizard público, alta admin,
  portal del equipo). La edad se calcula siempre con `ageOn()` (ya existía en
  `lib/tournament/roster.ts`, usado por la validación de edad mínima) contra
  `tournament.startDate` — no se guarda, se muestra calculada en `/admin/equipos/[id]`,
  `/mi-equipo` y el CSV de jugadores.
- **CSV.** `/api/admin/export/players` suma columnas `edad`, `restriccion_alimenticia`,
  `va_a_la_fiesta`. `/api/admin/export/teams` suma `pagado_ars` / `falta_ars` (misma suma
  de pagos aprobados que usa `/admin/pagos`).

Avisos a la organización por email (2026-10-14): `lib/services/admin-alerts.ts` →
`notifyAdmin(tx, { title, lines, teamId?, teamName? })` encola un `Notification` tipo
`ADMIN_ALERT` (nuevo) a `ADMIN_NOTIFICATION_EMAILS` (env, coma-separado; default
`aftersevenmixto@gmail.com` si no está seteada) — reutiliza la misma cola/cron/plantilla
que ya usan los avisos a los equipos (`Notification.recipientEmail`, campo nuevo, se
resuelve antes que `recipientUser`/`recipientTeamId` en `dispatchQueuedNotifications`).
Se llama desde dentro de la misma transacción en cada mutación de equipos, pagos e
inscripciones: `registration.create`, las tres ramas de `confirmManualPayment`
(confirmación completa, seña, sobrecupo) y las de `applyMpPayment` (aprobado, monto
observado, sobrecupo, rechazado, devuelto), `joinWaitlist`, `promoteWaitlistEntry`,
`autoPromoteWaitlist` (expiración), y en `admin-teams.ts`: alta/edición/baja de equipo,
alta/edición/baja de jugador (esta última también cubre la autoedición del responsable
desde `/mi-equipo`, vía `updatePlayer` compartido). Para eventos que se pueden repetir
con el mismo contenido (editar equipo, editar jugador) el `dedupeKey` usa
`crypto.randomUUID()` en vez de datos del evento, para no pisar un aviso real con el
de `enqueueNotification`'s dedupe-by-key. Deliberadamente fuera de alcance: cambios de
estructura del torneo (grupos, copas, resultados, config) — el pedido fue específicamente
equipos/pagos/inscripciones.

Pausa de riego + nivel de hockey + reprogramar horarios + export .xlsx (2026-10-16,
migración `water_break_and_hockey_level`):

- **Pausa de riego entre partidos.** `TournamentConfig.waterBreakEveryMatches` /
  `waterBreakMinutes` (defaults 4 y 7) — 0 en cualquiera de los dos desactiva la pausa.
  El motor trabaja en "tandas" (`lib/tournament/scheduler.ts`): todas las canchas juegan
  en simultáneo por tanda, así que "cada N partidos por cancha" ≈ "cada N tandas".
  `scheduleMatches` ahora acepta `waterBreak: { everyTandas, minutes }` y `tandasBefore`
  (cuántas tandas ya transcurrieron antes de esta llamada) — necesario porque
  `generateCups` llama a `scheduleMatches` una vez por ronda de llave (octavos, cuartos,
  semis, final), cada vez reseteando el índice local de tanda a 0; sin `tandasBefore` el
  conteo de riego se reiniciaría en cada ronda y casi nunca llegaría a dispararse durante
  copas. `tandasBefore` se pasa como la cantidad de tandas GROUP ya jugadas + las tandas
  de copa ya agendadas en rondas anteriores del mismo `generateCups`, así la pausa sigue
  contando a lo largo de todo el día (grupos → copas) sin reiniciarse. El avance de
  `roundStart` entre llamadas queda **sin** los minutos de pausa (deliberado): el offset
  de pausa se recalcula entero en cada llamada a partir de `tandasBefore`, nunca se
  acumula a mano — mezclar ambos duplicaría la pausa.
- **Nivel de hockey por jugador.** `Player.playsHockey` (bool, default `true`) — select
  "¿Juega hockey?" (Sí/No) en los 3 lugares donde se carga/edita un jugador (wizard
  público, alta admin, portal del equipo vía `updatePlayer` compartido). Pensado para
  armar los grupos por nivel en un torneo social donde no todos los integrantes de un
  equipo tienen experiencia. (Nota: el 2026-10-16 se sacó el campo `isPlayer` que existía
  antes por separado — ver más abajo —, así que ahora `playsHockey` también hace ese
  trabajo: cuenta para la regla de cancha y la edad mínima.) Visible en
  `/admin/equipos/[id]`, `/mi-equipo` y el export de jugadores.
- **Reprogramar horarios en cascada.** `lib/services/schedule.ts` → `rescheduleRound`:
  cambia el `startsAt` de una tanda (`Round`, cualquier fase) y corre el mismo delta sobre
  **todas** las tandas que arrancan después en el torneo — de cualquier fase, porque
  físicamente es el mismo día y las mismas canchas (demorar un partido de grupos corre
  también los horarios de copas, que ya estaban agendados relativos al fin de grupos).
  Avisa `TIME_CHANGED` (tipo de notificación que ya existía en las plantillas pero nunca
  se usaba) a cada equipo con un partido afectado, con el horario de su partido afectado
  más próximo. UI: botón "Reprogramar" en cada tanda de `/admin/torneo/resultados` (no se
  agregó todavía a `/admin/torneo/copas`, que no agrupa por tanda visualmente — queda
  pendiente si hace falta editar ahí directamente). Auditado como `round.reschedule`.
- **Export en .xlsx.** `/api/admin/export/{teams,players}` ahora devuelven `.xlsx` (antes
  `.csv`) vía `lib/xlsx.ts` (`exceljs`): encabezado con fondo verde de marca, ancho de
  columna automático, fila de encabezado congelada y autofiltro. `lib/csv.ts` se borró
  (sin otros usos). Jugadores suma la columna "Nivel hockey".

Se sacó `Player.isPlayer`, `playsHockey` pasa a cubrir también su rol (2026-10-16,
migración `remove_is_player_merge_into_plays_hockey`): había dos campos de jugador
pisándose conceptualmente ("Juega" = participa de los partidos vs. "¿Juega hockey?" =
nivel para armar grupos) — a pedido de Joaco se unificaron en uno solo. `playsHockey`
ahora hace todo lo que hacía `isPlayer`: cuenta para la regla de cancha (7 en cancha,
máx. 3 hombres) y para la edad mínima en `lib/tournament/roster.ts`
(`RosterPlayerInput.isPlayer` → `.playsHockey`), y para contar "jugadores reales" por
equipo en `lib/services/groups.ts` (sorteo de grupos) y en el export de equipos. Se
borró el checkbox "Juega" / badge "Juega"-"No juega" de los 3 formularios de jugador y
de las tablas de `/admin/equipos/[id]` y `/mi-equipo` — queda un solo control/badge
("¿Juega hockey?" / "Jugador"-"No jugador"). El export de jugadores (`.xlsx`) muestra
ese campo como "Jugador"/"No jugador" en la columna "Jugador" (antes eran dos columnas,
"Juega" y "Nivel hockey").

Prioridad de cancha en copas + mostrar cancha en resultados de copa + simplificar el
paso "en juego" (2026-10-16): `lib/services/cups.ts` → `generateCups` ahora ordena los
partidos de cada ronda de copa por tier antes de agendarlos (Oro primero, luego Plata,
Bronce, Madera), porque el armado de tandas llena las canchas en orden 1, 2, 3… — así
las canchas 1-3 (las "mejores", a pedido de Joaco) le tocan primero a las copas de mayor
categoría en cada ronda, incluida la final (con 4 copas y 3 canchas "buenas", Madera es
la que queda con la cuarta). `findMany` con `id: { in: [...] }` no respeta el orden del
array de ids — el reordenamiento se hace a mano con un mapa `cupId → tier` construido al
crear las copas. `/admin/torneo/copas` (`CupResultRow`) ahora muestra la cancha de cada
partido (mismo formato "C1" que ya usaba `/admin/torneo/resultados`) — antes solo se veía
en el bracket público. Test: `tests/integration/cups.test.ts` ("prioriza las canchas 1,
2 y 3…") fija el comportamiento con un fixture de 4 copas × 4 canchas.

Se sacó el botón "Marcar 'en juego'" de `/admin/torneo` (paso 4): no hacía nada más que
cambiar una etiqueta de estado, y `setGroupMatchResult` ya pasa el torneo a
`GROUPS_IN_PROGRESS` solo con el primer resultado cargado (ver `lib/services/results.ts`)
— el botón era 100% redundante y la palabra "en juego" generaba dudas sobre si eso era
lo que habilitaba pasar a copas. Se reemplazó por un link directo a cargar resultados.
El paso 5 ("Generar copas y llaves" → ahora "Pasar a la fase de copas") ya bloqueaba
correctamente generar copas si falta algún resultado de grupos (`generateCups` tira
`GROUPS_NOT_FINISHED` si hay partidos pendientes — esto ya existía, no es nuevo); se
mejoró el mensaje para que diga cuántos resultados faltan en vez de un texto genérico.

Nombre completo del país en toda la web, sin abreviar (2026-10-17): a pedido de Joaco, se
sacó todo uso de `Team.shortName` (código ISO) como texto mostrado — quedaba en varios
lugares como abreviación tipo "ARG" al lado o en vez del nombre del país. Afectaba:
`components/standings-table.tsx` (tabla de posiciones), `lib/tournament/bracket-view.ts`
(nombres en las llaves de copa — público y admin), `lib/tournament/team-view.ts` (nombre
del rival en "Mis partidos" de `/mi-equipo`), `/mi-equipo` (subtítulo bajo el nombre del
equipo) y `/admin/equipos` (listado). Se sacó `teamShortName` de `GroupStandingRow`
(`groups-view.ts`) porque ya no lo usa nadie. El campo `Team.shortName` en la base **no
se tocó** — sigue derivándose solo del `countryCode()` al crear/editar un equipo — y
el CSV/XLSX de equipos sigue teniendo la columna "Código" (criterio: eso es un dato de
exportación/planilla, no "la web"; si Joaco también lo quiere sacar de ahí, avisar).

Página pública de plantel por equipo, con bandera (2026-10-24): a pedido de Joaco, una
vez publicado el fixture cualquier visitante puede clickear un equipo (en los grupos, el
fixture de horarios, las llaves y el podio de `/torneo`) y ver su plantel — solo nombre y
apellido, sin DNI/email/teléfono. Ruta nueva `app/(public)/equipos/[id]/page.tsx`, datos
vía `getPublicTeamRoster` (`lib/tournament/team-view.ts`) — devuelve `null` (→ 404) si el
equipo no existe o si el torneo todavía no llegó a `GROUPS_PUBLISHED`, para no filtrar
planteles antes de tiempo. La bandera es un emoji derivado del código ISO alfa-3 que ya
guarda `Team.shortName` (`countryFlag()` en `lib/countries.ts`, nueva dependencia
`i18n-iso-countries` solo para el mapeo alfa-3→alfa-2 que pide el emoji). Se agregó el
link `/equipos/{id}` en `standings-table.tsx`, en las tarjetas de partido de `/torneo` y
en `bracket-view.tsx` (partidos de copa + podio — para esto último se sumó `teamId` a
`runnerUpName`/`thirdPlaceNames`, que antes solo tenían el nombre). Reusa el mismo botón
"Inscribirse"/branding — sin librerías de banderas con imágenes, todo con un solo emoji.

Se agregaron 60 equipos random (países + plantel completo, confirmados/pagos) a
**producción** (2026-10-24) a pedido de Joaco, para que el equipo pueda probar el sistema
completo con datos reales de carga. Script `scripts/seed-add-teams.ts` (sin commitear,
dev tool como los otros dos scripts de prueba de la sesión anterior): a diferencia de
`seed-random-64.ts`, este NO vacía el torneo — lee los equipos ya existentes, evita
repetir país y solo agrega. Se usó porque producción ya tenía 3 equipos reales cargados
(Brasil, Argentina, Alemania) que no se podían tocar. Quedó el torneo en 63 equipos,
dejando 1 cupo libre para llegar a 64 con una inscripción real.

Mail por cada cambio de estado + mensaje de WhatsApp al confirmar pago (2026-10-24): a
pedido de Joaco. **Notificaciones**: se agregó `NotificationType.STATUS_CHANGED`
(migración `20261024180901_add_status_changed_notification_type`) para los caminos que
cambiaban `Team.registrationStatus` sin avisarle nunca al responsable — el resto de los
caminos (pago, promoción de lista de espera, rechazo/reembolso) ya encolaban un email
específico (`PAYMENT_APPROVED`, `TEAM_APPROVED`, `WAITLIST_INVITED`, `RESULT_POSTED`) y se
dejaron como estaban, para no mandar dos mails por el mismo evento. Quedaban mudos: el
cambio manual de estado del admin (`changeRegistrationStatus` en
`app/(admin)/admin/equipos/[id]/actions.ts`), el alta manual de un equipo
(`adminCreateTeam`), entrar a la lista de espera por primera vez (`joinWaitlist`) y
volver a la lista de espera por no pagar a tiempo (`autoPromoteWaitlist` → bloque de
expiración, en `lib/services/waitlist.ts`). Los cuatro ahora encolan `STATUS_CHANGED`
dentro de la misma transacción; el render vive en `lib/email/templates.ts`
(`REGISTRATION_STATUS_LABEL` para el texto del estado + dos variantes con `extra.kind`
para lista de espera). **Mensaje de WhatsApp**: `buildNextStepsMessage()`
(`lib/tournament/whatsapp.ts`, función pura, con test unitario) arma un texto fijo —
nombre del equipo, link a `/mi-equipo`, cómo entrar (magic link, mismo mail de la
inscripción) y qué se puede hacer desde el portal — pensado para prevenir las preguntas
básicas repetidas. Se muestra en un `<textarea>` de solo lectura con botón "Copiar"
(`components/copy-textarea.tsx`, reutilizable) en los dos lugares donde se confirma un
pago manual: `/admin/equipos/[id]` (`ConfirmPaymentButton`) y `/admin/pagos`
(`PendingPaymentRow`) — solo en la confirmación completa (`outcome: "CONFIRMED"`), no en
seña ni sobrecupo. `confirmManualPayment` ahora devuelve `teamName` para no hacer una
consulta aparte. Bug encontrado y corregido en el camino: en ambos lugares, el
`router.refresh()` que sigue a la confirmación hacía que el componente dejara de
renderizarse (en la ficha de equipo, porque el padre deja de mostrar el botón una vez
`CONFIRMED`; en `/admin/pagos`, porque la fila sale de la lista de pendientes) — el
mensaje de WhatsApp aparecía un instante y desaparecía solo. Se arregló pasando el
`registrationStatus` al componente y dejándolo decidir internamente si ya se confirmó en
esta sesión (ficha de equipo), y en `/admin/pagos` directamente no se refresca la lista
hasta que el admin toca "Listo, actualizar lista" (para poder copiar el mensaje antes de
que la fila desaparezca).

Optimización mobile de toda la app, con foco en el panel de staff (2026-10-26): a pedido
de Joaco, porque el uso real va a ser mayormente desde el celular. Auditoría previa
(agente de exploración) identificó 4 problemas concretos — se corrigieron los 4:

1. **Nav del panel sin manejo responsive** (`app/(admin)/admin/layout.tsx`): la barra de
   7 links desbordaba en pantallas angostas. Se extrajo a `app/(admin)/admin/admin-nav.tsx`
   (client component): fila horizontal normal desde `md`, menú hamburguesa (botón de 44px,
   SVG inline, sin librería de íconos) debajo de `md` que se cierra solo al navegar; marca
   el link activo en ambos modos.
2. **Touch targets chicos**: `buttonSizes.sm` en `components/ui.tsx` pasó de `h-8` (32px)
   a `h-9` (36px). Más importante: **todos los inputs/selects (`inputBase` en
   `components/ui.tsx`) pasaron de `text-sm` fijo a `text-base sm:text-sm`** — en 14px,
   iOS Safari hace zoom automático al enfocar un campo; en 16px no. Este cambio solo
   (una línea) toca el 100% de los formularios de la app, inscripción pública incluida.
3. **Carga de resultados de grupos y copas** (`result-row.tsx`, `cup-result-row.tsx`,
   las pantallas que más se van a usar desde el celular, courtside): el form de cada
   partido era un único `flex flex-wrap` que amontonaba cancha, equipos, inputs de goles,
   botón walkover y botón guardar en una sola línea que rompía de forma impredecible. Se
   reescribió a 3 líneas fijas (meta → equipos+goles → acciones), inputs de gol de
   `h-8 w-12` a `h-11 w-14` con `text-base` (evita el zoom de iOS), botones de acción con
   más padding. De paso se encontró y sacó el `min-w-[36rem]` de la tabla de copas
   (`torneo/copas/page.tsx`) — forzaba scroll horizontal y con el form ya apilado
   verticalmente estaba de más (en 390px de ancho literalmente cortaba el nombre del
   equipo visitante fuera de la pantalla, sin ningún indicio visual de que había que
   scrollear).
4. **Confirmar pagos en `/admin/pagos`** (segunda pantalla de mayor uso): la fila de
   "pendientes de confirmar" necesitaba scroll horizontal en la tabla para llegar a la
   acción. Se separó en dos variantes que comparten el mismo estado/lógica vía un hook
   (`usePendingPaymentConfirm` en `pending-row.tsx`): `PendingPaymentCard` (tarjeta
   apilada, una sola columna, visible debajo de `md`) y `PendingPaymentRow` (la tabla de
   siempre, visible desde `md`) — ambas montadas siempre, CSS decide cuál se ve, sin JS
   de detección de viewport. La tabla de historial de pagos más abajo en la misma página
   no se tocó (sigue con scroll horizontal intencional, aceptable para un log).

Quedó sin tocar a propósito (ya usaban el patrón de scroll horizontal intencional —
`overflow-x-auto` + `min-w-[Nrem]` — y la auditoría los marcó como aceptables, no rotos):
el listado de `/admin/equipos`, el plantel en `/admin/equipos/[id]`, `/admin/espera`,
`/admin/auditoria` y la tabla de historial de `/admin/pagos`. Si en algún momento se
sienten incómodos desde el celular, el mismo patrón de tarjeta-en-mobile/tabla-en-desktop
usado en pagos se puede repetir ahí.

Fix: nombres largos se salían de la pantalla en la carga de resultados (2026-10-26).
Joaco reportó partidos "fuera de pantalla" en `/admin/torneo/resultados` y
`/admin/torneo/copas` en mobile. Causa real (no era el mismo problema que el
`min-w-[36rem]` sacado el 26/10 por la tarde): con `table-layout: auto` (default de
`<table>`), el algoritmo de ancho de columnas calcula el "min-content" a partir del texto
`white-space: nowrap` de los `<span className="truncate">` — ve que el texto completo sin
cortar "necesita" ese ancho y expande la tabla para dar lugar, **ignorando por completo
el `overflow:hidden` del truncate**. Con nombres cortos esto no se nota (el ancho natural
igual entraba en la pantalla), pero con dos equipos de nombre largo en el mismo partido
(ej. "República Centroafricana" vs "San Vicente y las Granadinas") la tabla se expandía
muy por encima del viewport y, como el wrapper tiene `overflow-hidden`, el texto quedaba
directamente invisible — ni se podía hacer scroll para verlo. Se agregó `table-fixed`
(`table-layout: fixed`) a las dos tablas (`resultados/page.tsx`, `torneo/copas/page.tsx`)
— con layout fijo el ancho de columna no depende del contenido, así que el truncate de
adentro sí se respeta. De paso se blindó el `<select>` de walkover en ambos componentes
(mismo problema en potencia: su ancho también depende de la opción más larga) con
`max-w-[40%] truncate`. Verificado con un partido de prueba renombrado a dos países de
nombre largo — sin el fix desbordaba ~160px fuera de un viewport de 360px; con el fix,
0px de overflow.

Pendiente / próximo: cargar alias/CBU/WhatsApp reales en `/admin/configuracion`,
pulido visual final, más cobertura e2e (pago, admin), pasar a Vercel Pro antes del
evento, **medir cuántos usuarios simultáneos soporta Vercel Hobby + Neon free antes del
evento** (discutido con Joaco: Hobby no tiene SLA de concurrencia documentado — en la
práctica aguanta boom bursts cortos tipo "se abre la inscripción", el cuello de botella
más probable es el pool de conexiones de Neon free, no Vercel; recomendado hacer un load
test liviano contra producción antes de confiar en esto a ciegas). Discutido pero no
implementado: agregar/sacar jugadores desde el portal con recálculo de pago cuando el
plantel supera los 10 incluidos (el precio por jugador extra ya existe en
`calculatePrice`; falta decidir la política de baja/reembolso parcial antes de tocar
código).
