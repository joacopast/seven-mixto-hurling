import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { formatArs } from "@/lib/tournament/pricing";
import { buildWhatsAppLink } from "@/lib/tournament/whatsapp";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";
import { mercadoPagoConfigured } from "@/lib/payments/mercadopago";
import { Badge, Card, ButtonLink } from "@/components/ui";
import { PayButton } from "./pay-button";
import { StatusPoller } from "./status-poller";
import { CopyField } from "./copy-field";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pago de la inscripción", robots: { index: false } };

const PAYABLE = ["PENDING_PAYMENT", "PAYMENT_STARTED", "PAYMENT_REJECTED"];

export default async function PagoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status: returnStatus } = await searchParams;

  const registration = await db.registration.findUnique({
    where: { id },
    include: { team: true },
  });
  if (!registration || !registration.team) notFound();

  const tournament = await getActiveTournament();
  const config = tournament.config!;
  const isManual = config.paymentMethod === "MANUAL_TRANSFER";

  const status = registration.status;
  const label = REGISTRATION_STATUS_LABEL[status];
  const mpReady = mercadoPagoConfigured();
  const amountLabel = formatArs(registration.totalAmount);

  const whatsappLink = isManual
    ? buildWhatsAppLink(
        config.whatsappPhone,
        config.whatsappMessageTemplate ?? "Hola! Te paso el comprobante de la inscripción de {team} (${amount}).",
        { team: registration.team.name, amount: amountLabel.replace("$", "") },
      )
    : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <p className="eyebrow">Seven Mixto · Inscripción</p>
      <h1 className="mt-2 font-display text-3xl font-semibold uppercase tracking-tight text-paper">
        {registration.team.name}
      </h1>

      {(status === "CONFIRMED" || status === "PAYMENT_APPROVED") && (
        <Card className="mt-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-wash text-accent">
            ✓
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-paper">
            Inscripción confirmada
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Tu pago quedó registrado y el equipo está adentro. Te enviamos la confirmación por
            email.
          </p>
          <Link
            href="/mi-equipo"
            className="mt-5 inline-flex rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-bg-deep"
          >
            Ir al portal del equipo
          </Link>
        </Card>
      )}

      {status === "OBSERVED" && (
        <Card className="mt-6 border-l-[3px] border-l-warn">
          <h2 className="font-display text-xl font-semibold text-paper">Estamos revisando tu pago</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Detectamos algo que necesita revisión manual de la organización. Te vamos a contactar
            por email o WhatsApp. No hace falta que transfieras de nuevo.
          </p>
        </Card>
      )}

      {status === "WAITLISTED" && (
        <Card className="mt-6 border-l-[3px] border-l-info">
          <h2 className="font-display text-xl font-semibold text-paper">Lista de espera</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Los cupos se completaron. Si ya transferiste, la organización va a gestionar el
            reembolso total. Te avisamos si se libera un lugar.
          </p>
        </Card>
      )}

      {status === "CANCELLED" && (
        <Card className="mt-6 border-l-[3px] border-l-danger">
          <h2 className="font-display text-xl font-semibold text-paper">Inscripción cancelada</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Esta inscripción fue cancelada. Si creés que es un error, escribinos.
          </p>
        </Card>
      )}

      {PAYABLE.includes(status) && (
        <>
          <Card className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Estado</span>
              <Badge tone={status === "PAYMENT_REJECTED" ? "danger" : "warn"}>{label}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-soft">Total a pagar</span>
              <span className="font-mono text-xl font-semibold text-paper">{amountLabel}</span>
            </div>
          </Card>

          {isManual ? (
            <>
              <Card className="mt-4">
                <h2 className="font-display text-lg font-semibold text-paper">
                  Datos para transferir
                </h2>
                <div className="mt-3 rounded-2xl bg-pill px-4">
                  {config.bankHolderName && <CopyField label="Titular" value={config.bankHolderName} />}
                  {config.bankCuit && <CopyField label="CUIT / CUIL" value={config.bankCuit} />}
                  {config.bankName && <CopyField label="Banco" value={config.bankName} />}
                  {config.bankAlias && <CopyField label="Alias" value={config.bankAlias} />}
                  {config.bankCbu && <CopyField label="CBU / CVU" value={config.bankCbu} />}
                  {!config.bankAlias && !config.bankCbu && (
                    <p className="py-3 text-sm text-ink-faint">
                      La organización todavía no cargó los datos bancarios. Escribinos y te los
                      pasamos.
                    </p>
                  )}
                </div>
                <p className="mt-3 text-xs text-ink-faint">
                  Transferí exactamente <strong>{amountLabel}</strong> y mandanos el comprobante.
                  Tu inscripción queda <strong>confirmada</strong> cuando lo verifiquemos — te
                  avisamos por email.
                </p>
              </Card>

              <div className="mt-4">
                {whatsappLink ? (
                  <ButtonLink
                    href={whatsappLink}
                    target="_blank"
                    size="lg"
                    className="w-full"
                  >
                    Enviar comprobante por WhatsApp
                  </ButtonLink>
                ) : (
                  <p className="rounded-2xl border border-line border-l-[3px] border-l-warn bg-surface p-4 text-sm text-ink-soft">
                    La organización todavía no cargó un WhatsApp de contacto. Escribinos por las
                    redes para mandarte el comprobante.
                  </p>
                )}
              </div>
            </>
          ) : (
            <Card className="mt-4">
              {status === "PAYMENT_STARTED" && returnStatus ? (
                <StatusPoller registrationId={registration.id} />
              ) : !mpReady ? (
                <p className="text-sm text-ink-soft">
                  El pago con Mercado Pago todavía no está habilitado. Tu equipo quedó{" "}
                  <strong>pendiente de pago</strong>: te avisamos por email en cuanto puedas
                  abonar.
                </p>
              ) : (
                <div>
                  <PayButton registrationId={registration.id} />
                  {status === "PAYMENT_REJECTED" && (
                    <p className="mt-2 text-xs text-ink-faint">
                      El intento anterior fue rechazado. Podés probar con otro medio de pago.
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          <p className="mt-4 text-center text-xs text-ink-faint">
            {isManual
              ? "Nunca te pedimos los datos de tu tarjeta ni una clave bancaria."
              : "Pago procesado por Mercado Pago. Nunca guardamos datos de tu tarjeta."}
          </p>
        </>
      )}
    </div>
  );
}
