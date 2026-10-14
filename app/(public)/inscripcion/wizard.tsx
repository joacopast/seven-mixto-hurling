"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Input, Select, Callout } from "@/components/ui";
import { cn } from "@/lib/cn";
import { calculatePrice, formatArs, type PricingConfig } from "@/lib/tournament/pricing";
import { validateRoster, type RosterConfig } from "@/lib/tournament/roster";
import { COUNTRIES } from "@/lib/countries";
import { submitRegistration } from "./actions";

export interface WizardConfig {
  /** Países ya anotados en el torneo (cualquier estado salvo cancelado) — no se pueden elegir de nuevo. */
  takenCountries: string[];
  basePlayers: number;
  earlyPrice: number;
  latePrice: number;
  extraPlayerPrice: number;
  priceChangeAtISO: string;
  paymentSurchargeBp: number;
  minPlayers: number;
  maxPlayers: number;
  playersOnField: number;
  maxMenOnField: number;
  minPlayerAge: number;
  tournamentStartISO: string;
  inclusions: string[];
}

interface PlayerDraft {
  firstName: string;
  lastName: string;
  docType: "DNI" | "PASSPORT";
  docNumber: string;
  birthDate: string;
  gender: "M" | "F" | "X";
  /** false = acompaña al equipo pero no juega (igual paga y disfruta del evento). */
  isPlayer: boolean;
  shirtNumber: string;
  phone: string;
  email: string;
  position: string;
  dietaryRestriction: string;
  /** Si va a quedarse a la fiesta post torneo. */
  attendsParty: boolean;
}

interface Draft {
  team: { name: string };
  manager: { contactName: string; contactEmail: string; contactPhone: string };
  players: PlayerDraft[];
}

const EMPTY_PLAYER: PlayerDraft = {
  firstName: "",
  lastName: "",
  docType: "DNI",
  docNumber: "",
  birthDate: "",
  gender: "F",
  isPlayer: true,
  shirtNumber: "",
  phone: "",
  email: "",
  position: "",
  dietaryRestriction: "",
  attendsParty: true,
};

const EMPTY_DRAFT: Draft = {
  team: { name: "" },
  manager: { contactName: "", contactEmail: "", contactPhone: "" },
  players: [],
};

const STORAGE_KEY = "smh:registration:draft:v1";

const STEPS = ["Equipo", "Responsable", "Jugadores", "Resumen", "Pago"] as const;

export function Wizard({ config }: { config: WizardConfig }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [blockingIssues, setBlockingIssues] = useState<string[]>([]);

  // Hidratar desde localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDraft({ ...EMPTY_DRAFT, ...(JSON.parse(raw) as Draft) });
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* noop */
    }
  }, [draft, hydrated]);

  const pricingConfig: PricingConfig = useMemo(
    () => ({
      basePlayers: config.basePlayers,
      earlyPrice: config.earlyPrice,
      latePrice: config.latePrice,
      extraPlayerPrice: config.extraPlayerPrice,
      priceChangeAt: new Date(config.priceChangeAtISO),
      paymentSurchargeBp: config.paymentSurchargeBp,
    }),
    [config],
  );

  const rosterConfig: RosterConfig = {
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    playersOnField: config.playersOnField,
    maxMenOnField: config.maxMenOnField,
    minPlayerAge: config.minPlayerAge,
  };

  const quote = useMemo(
    () => calculatePrice(pricingConfig, draft.players.length),
    [pricingConfig, draft.players.length],
  );

  const roster = useMemo(
    () =>
      validateRoster(
        rosterConfig,
        draft.players.map((p) => ({
          firstName: p.firstName,
          lastName: p.lastName,
          docNumber: p.docNumber,
          birthDate: p.birthDate ? new Date(`${p.birthDate}T00:00:00Z`) : new Date("invalid"),
          gender: p.gender,
          isPlayer: p.isPlayer,
          shirtNumber: p.shirtNumber ? Number(p.shirtNumber) : null,
        })),
        { referenceDate: new Date(config.tournamentStartISO) },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.players, config.tournamentStartISO],
  );

  const stepValid: boolean[] = [
    draft.team.name.trim().length > 0,
    draft.manager.contactName.trim().length > 0 &&
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.manager.contactEmail) &&
      draft.manager.contactPhone.trim().length > 0,
    draft.players.length >= config.minPlayers && roster.ok,
    true,
    true,
    true,
  ];

  const canContinue = stepValid[step];

  async function handleSubmit() {
    setSubmitting(true);
    setServerError(null);
    setBlockingIssues([]);
    try {
      const res = await submitRegistration({
        team: draft.team,
        manager: draft.manager,
        players: draft.players.map((p) => ({
          ...p,
          shirtNumber: p.shirtNumber === "" ? undefined : Number(p.shirtNumber),
        })),
      });
      if (!res.ok) {
        setServerError(res.error ?? "No se pudo completar la inscripción.");
        setBlockingIssues(res.blockingIssues ?? []);
        return;
      }
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
      // El paso de pago vive en su propia página (muestra los datos para
      // transferir y el link de WhatsApp). No limpiamos `submitting`: la
      // navegación sigue.
      window.location.href = `/inscripcion/pago/${res.data!.registrationId}`;
    } catch {
      setServerError("Ocurrió un error inesperado. Probá de nuevo.");
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-card border border-line bg-surface" />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div>
        <Progress step={step} />

        <div className="mt-6 rounded-card border border-line-soft bg-surface p-5 sm:p-6">
          {step === 0 && (
            <TeamStep draft={draft} setDraft={setDraft} takenCountries={config.takenCountries} />
          )}
          {step === 1 && <ManagerStep draft={draft} setDraft={setDraft} />}
          {step === 2 && (
            <PlayersStep draft={draft} setDraft={setDraft} config={config} roster={roster} />
          )}
          {step === 3 && <SummaryStep draft={draft} quote={quote} config={config} />}
          {step === 4 && (
            <PaymentStep
              quote={quote}
              submitting={submitting}
              serverError={serverError}
              blockingIssues={blockingIssues}
              onSubmit={handleSubmit}
            />
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Atrás
          </Button>
          {step < 4 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              Continuar
            </Button>
          )}
        </div>
      </div>

      <PriceSidebar quote={quote} config={config} playerCount={draft.players.length} />
    </div>
  );
}

/* ---------------- Progress ---------------- */

function Progress({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs",
            i === step
              ? "border-accent bg-accent-wash text-accent"
              : i < step
                ? "border-line text-ink-soft"
                : "border-line-soft text-ink-faint",
          )}
        >
          <span>{i + 1}</span>
          <span className="hidden sm:inline">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Steps ---------------- */

function TeamStep({
  draft,
  setDraft,
  takenCountries,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  takenCountries: string[];
}) {
  const taken = new Set(takenCountries);
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold text-ink">Datos del equipo</h2>
      <p className="text-sm text-ink-soft">
        Torneo formato mundial: tu equipo representa a un país. Un país, un equipo — elegí el que
        vas a defender.
      </p>
      <Field label="País" htmlFor="name">
        <Select
          id="name"
          value={draft.team.name}
          onChange={(e) => setDraft((d) => ({ ...d, team: { name: e.target.value } }))}
          required
        >
          <option value="">Elegí un país…</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name} disabled={taken.has(c.name) && c.name !== draft.team.name}>
              {c.name}
              {taken.has(c.name) && c.name !== draft.team.name ? " (ya inscripto)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-ink-faint">
        El escudo lo vas a poder subir después, desde el portal del equipo.
      </p>
    </div>
  );
}

function ManagerStep({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
}) {
  const set = (k: keyof Draft["manager"], v: string) =>
    setDraft((d) => ({ ...d, manager: { ...d.manager, [k]: v } }));
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold text-ink">Responsable del equipo</h2>
      <p className="text-sm text-ink-soft">
        Con este email vas a administrar el equipo. Te enviamos un enlace de acceso, sin contraseñas.
      </p>
      <Field label="Nombre y apellido" htmlFor="contactName">
        <Input
          id="contactName"
          value={draft.manager.contactName}
          onChange={(e) => set("contactName", e.target.value)}
          maxLength={80}
          required
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" htmlFor="contactEmail">
          <Input
            id="contactEmail"
            type="email"
            value={draft.manager.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
            required
          />
        </Field>
        <Field label="Teléfono" htmlFor="contactPhone">
          <Input
            id="contactPhone"
            value={draft.manager.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
            maxLength={30}
            required
          />
        </Field>
      </div>
    </div>
  );
}

function PlayersStep({
  draft,
  setDraft,
  config,
  roster,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  config: WizardConfig;
  roster: ReturnType<typeof validateRoster>;
}) {
  const [form, setForm] = useState<PlayerDraft>(EMPTY_PLAYER);
  const formRef = useRef<HTMLFormElement>(null);

  const canAdd =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.docNumber.trim() &&
    form.birthDate &&
    draft.players.length < config.maxPlayers;

  function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setDraft((d) => ({ ...d, players: [...d.players, form] }));
    setForm(EMPTY_PLAYER);
    formRef.current?.querySelector<HTMLInputElement>('input[name="firstName"]')?.focus();
  }

  function removePlayer(i: number) {
    setDraft((d) => ({ ...d, players: d.players.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Jugadores</h2>
        <span className="font-mono text-sm text-ink-soft">
          {draft.players.length}/{config.maxPlayers}
        </span>
      </div>

      <Callout tone="info">
        Plantel: entre {config.minPlayers} y {config.maxPlayers} personas (jugadores + no
        jugadores). En cancha se juega de a {config.playersOnField}, con un máximo de{" "}
        {config.maxMenOnField} hombres — esa cuenta es solo entre quienes <strong>juegan</strong>.
        Si alguien acompaña al equipo pero no va a jugar, destildá &ldquo;Juega&rdquo;: igual paga
        y disfruta del evento, pero no cuenta para completar la cancha.
      </Callout>

      {draft.players.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {draft.players.map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-ink">
                  {p.firstName} {p.lastName}
                </span>
                <span className="ml-2 font-mono text-xs text-ink-faint">
                  {p.docType} {p.docNumber} · {p.gender}
                  {p.shirtNumber ? ` · #${p.shirtNumber}` : ""}
                </span>
                {!p.isPlayer && (
                  <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
                    No juega
                  </span>
                )}
                {!p.attendsParty && (
                  <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
                    No va a la fiesta
                  </span>
                )}
                {p.dietaryRestriction && (
                  <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
                    {p.dietaryRestriction}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removePlayer(i)}
                className="flex-none rounded px-2 py-1 text-xs text-danger hover:bg-surface-2"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {roster.issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {roster.issues.map((issue, i) => (
            <li key={i} className={issue.blocking ? "text-danger" : "text-warn"}>
              {issue.blocking ? "✕" : "!"} {issue.message}
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        onSubmit={addPlayer}
        className="rounded-2xl border border-dashed border-line bg-surface-3/60 p-4"
      >
        <p className="mb-3 text-sm font-medium text-ink">Agregar jugador</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="pf">
            <Input
              id="pf"
              name="firstName"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Apellido" htmlFor="pl">
            <Input
              id="pl"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
          <Field label="Tipo doc." htmlFor="pdt">
            <Select
              id="pdt"
              value={form.docType}
              onChange={(e) => setForm({ ...form, docType: e.target.value as PlayerDraft["docType"] })}
            >
              <option value="DNI">DNI</option>
              <option value="PASSPORT">Pasaporte</option>
            </Select>
          </Field>
          <Field label="Número de documento" htmlFor="pd">
            <Input
              id="pd"
              inputMode="numeric"
              value={form.docNumber}
              onChange={(e) => setForm({ ...form, docNumber: e.target.value })}
            />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="pb">
            <Input
              id="pb"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </Field>
          <Field label="Género" htmlFor="pg">
            <Select
              id="pg"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value as PlayerDraft["gender"] })}
            >
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="X">Otro / no binario</option>
            </Select>
          </Field>
          <Field label="N.º camiseta" htmlFor="pn" hint="Opcional.">
            <Input
              id="pn"
              inputMode="numeric"
              value={form.shirtNumber}
              onChange={(e) => setForm({ ...form, shirtNumber: e.target.value })}
            />
          </Field>
          <Field label="Teléfono" htmlFor="pp" hint="Opcional.">
            <Input
              id="pp"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field
            label="Restricción alimenticia"
            htmlFor="pdiet"
            hint="Opcional: vegetariano, celíaco, alergias…"
          >
            <Input
              id="pdiet"
              value={form.dietaryRestriction}
              onChange={(e) => setForm({ ...form, dietaryRestriction: e.target.value })}
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.isPlayer}
            onChange={(e) => setForm({ ...form, isPlayer: e.target.checked })}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          Juega
          <span className="text-xs text-ink-faint">
            (destildá si acompaña al equipo pero no va a jugar)
          </span>
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.attendsParty}
            onChange={(e) => setForm({ ...form, attendsParty: e.target.checked })}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          Se queda a la fiesta post torneo
        </label>
        <Button type="submit" variant="secondary" className="mt-4" disabled={!canAdd}>
          Agregar al plantel
        </Button>
      </form>
    </div>
  );
}

function SummaryStep({
  draft,
  quote,
  config,
}: {
  draft: Draft;
  quote: ReturnType<typeof calculatePrice>;
  config: WizardConfig;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold text-ink">Revisá y confirmá</h2>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Row label="País" value={draft.team.name} />
        <Row label="Responsable" value={draft.manager.contactName} />
        <Row label="Email" value={draft.manager.contactEmail} />
        <Row label="Teléfono" value={draft.manager.contactPhone} />
        <Row label="Plantel" value={String(draft.players.length)} />
        <Row
          label="Jugadores / no juegan"
          value={`${draft.players.filter((p) => p.isPlayer).length} / ${draft.players.filter((p) => !p.isPlayer).length}`}
        />
      </dl>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Plantel</p>
        <ol className="grid gap-1 text-sm text-ink-soft sm:grid-cols-2">
          {draft.players.map((p, i) => (
            <li key={i} className="font-mono text-xs">
              {i + 1}. {p.firstName} {p.lastName} · {p.gender}
              {!p.isPlayer && " · no juega"}
              {!p.attendsParty && " · no va a la fiesta"}
              {p.dietaryRestriction && ` · ${p.dietaryRestriction}`}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-line-soft bg-surface-3/50 p-4">
        <p className="mb-2 text-sm font-medium text-ink">Detalle del precio</p>
        <dl className="space-y-1.5 text-sm">
          <LineItem
            label={`Equipo (incluye ${config.basePlayers} jugadores) · tarifa ${quote.tier === "EARLY" ? "temprana" : "general"}`}
            value={formatArs(quote.baseAmount)}
          />
          <LineItem
            label={`${quote.extraPlayers} jugadores adicionales`}
            value={formatArs(quote.extraPlayersAmount)}
          />
          {quote.surchargeAmount > 0 && (
            <LineItem label="Recargo medio de pago" value={formatArs(quote.surchargeAmount)} />
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{formatArs(quote.totalAmount)}</dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Incluye</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {config.inclusions.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-ink-soft">
              <span className="mt-1 h-1 w-1 flex-none rounded-full bg-pop" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PaymentStep({
  quote,
  submitting,
  serverError,
  blockingIssues,
  onSubmit,
}: {
  quote: ReturnType<typeof calculatePrice>;
  submitting: boolean;
  serverError: string | null;
  blockingIssues: string[];
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold text-ink">Pago</h2>
      <p className="text-sm text-ink-soft">
        Al confirmar, registramos tu equipo y te mostramos los datos para transferir. Tu
        inscripción queda confirmada cuando la organización verifica el comprobante.
      </p>

      <div className="flex items-center justify-between rounded-2xl bg-pill p-4">
        <span className="text-sm text-ink-soft">Total a pagar</span>
        <span className="font-mono text-lg font-semibold text-paper">
          {formatArs(quote.totalAmount)}
        </span>
      </div>

      {serverError && (
        <div className="rounded-2xl border border-danger/40 bg-surface p-4 text-sm text-danger">
          <p>{serverError}</p>
          {blockingIssues.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {blockingIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Callout tone="info" title="Cómo sigue">
        Registramos tu equipo y te mostramos el <strong>alias/CBU</strong> y un link directo a{" "}
        <strong>WhatsApp</strong> para mandar el comprobante. En cuanto la organización lo
        verifica, tu inscripción queda confirmada. También te enviamos un enlace por email para
        administrar el equipo.
      </Callout>

      <Button size="lg" onClick={onSubmit} disabled={submitting} className="w-full">
        {submitting ? "Registrando…" : "Confirmar equipo e ir al pago"}
      </Button>
    </div>
  );
}

/* ---------------- Bits ---------------- */

function PriceSidebar({
  quote,
  config,
  playerCount,
}: {
  quote: ReturnType<typeof calculatePrice>;
  config: WizardConfig;
  playerCount: number;
}) {
  return (
    <aside className="lg:sticky lg:top-6 lg:h-fit">
      <div className="rounded-card border border-line-soft bg-surface p-5">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-faint">Tu inscripción</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Equipo</dt>
            <dd className="font-mono">{formatArs(quote.baseAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">
              {playerCount} jugadores{" "}
              <span className="text-ink-faint">
                ({config.basePlayers} incluidos)
              </span>
            </dt>
            <dd className="font-mono">{formatArs(quote.extraPlayersAmount)}</dd>
          </div>
          {quote.surchargeAmount > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Recargo pago</dt>
              <dd className="font-mono">{formatArs(quote.surchargeAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{formatArs(quote.totalAmount)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-faint">
          Tarifa {quote.tier === "EARLY" ? "temprana" : "general"}. El precio se recalcula al
          agregar o quitar jugadores.
        </p>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function LineItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
