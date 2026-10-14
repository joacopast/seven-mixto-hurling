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

Manual de uso para la organización: `docs/manual-organizacion.html`, publicado como
Artifact (https://claude.ai/artifact/3ffBmjArdGrBckc4Jq8DQx) — login de staff, mapa del
panel, checklist antes de abrir inscripción, confirmar pagos por transferencia, lista de
espera, armar grupos/fixture/copas, auditoría, día del evento y FAQ.

Pendiente / próximo: deploy productivo (Vercel + Neon/Supabase, variables de entorno,
credenciales reales de Resend, `STAFF_PASSWORD_HASH`), cargar alias/CBU/WhatsApp reales,
pulido visual final, más cobertura e2e (pago, admin).
