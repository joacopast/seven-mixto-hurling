import "server-only";
import { db } from "@/lib/db";
import { ROUND_ORDER, ROUND_LABEL, type BracketRoundName } from "@/lib/tournament/bracket";

export interface BracketMatchView {
  matchId: string;
  bracketMatchId: string;
  round: BracketRoundName;
  slot: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeShootout: number | null;
  awayShootout: number | null;
  status: string;
  winnerTeamId: string | null;
  walkoverTeamId: string | null;
  startsAt: Date | null;
  fieldName: string | null;
}

export interface BracketRoundView {
  round: BracketRoundName;
  label: string;
  matches: BracketMatchView[];
}

export interface CupView {
  id: string;
  name: string;
  tier: number;
  rounds: BracketRoundView[];
  championTeamId: string | null;
  championName: string | null;
  runnerUpTeamId: string | null;
  runnerUpName: string | null;
  /** 3er puesto compartido entre los dos perdedores de semifinal. */
  thirdPlace: { teamId: string; name: string }[];
}

export async function getCupsWithBrackets(tournamentId: string): Promise<CupView[]> {
  const cups = await db.cup.findMany({
    where: { tournamentId },
    orderBy: { tier: "asc" },
    include: {
      bracket: {
        include: {
          matches: {
            include: {
              match: {
                include: {
                  homeTeam: { select: { id: true, name: true } },
                  awayTeam: { select: { id: true, name: true } },
                  slot: { include: { round: true, field: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const champions = await db.team.findMany({
    where: { tournamentId, finalPosition: { in: [1, 2, 3] } },
    select: { id: true, name: true, cupId: true, finalPosition: true },
  });

  return cups.map((cup) => {
    const rounds: BracketRoundView[] = ROUND_ORDER.map((round) => {
      const matches = (cup.bracket?.matches ?? [])
        .filter((bm) => bm.round === round)
        .sort((a, b) => a.bracketSlot - b.bracketSlot)
        .map<BracketMatchView>((bm) => {
          const m = bm.match!;
          const name = (t: { name: string } | null) => t?.name ?? null;
          return {
            matchId: m.id,
            bracketMatchId: bm.id,
            round,
            slot: bm.bracketSlot,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeTeamName: name(m.homeTeam),
            awayTeamName: name(m.awayTeam),
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeShootout: m.homeShootout,
            awayShootout: m.awayShootout,
            status: m.status,
            winnerTeamId: m.winnerTeamId,
            walkoverTeamId: m.walkoverTeamId,
            startsAt: m.slot?.round.startsAt ?? null,
            fieldName: m.slot?.field.name ?? null,
          };
        });
      return { round, label: ROUND_LABEL[round], matches };
    });

    const champ = champions.find((c) => c.cupId === cup.id && c.finalPosition === 1);
    const runner = champions.find((c) => c.cupId === cup.id && c.finalPosition === 2);
    const thirds = champions.filter((c) => c.cupId === cup.id && c.finalPosition === 3);

    return {
      id: cup.id,
      name: cup.name,
      tier: cup.tier,
      rounds,
      championTeamId: champ?.id ?? null,
      championName: champ?.name ?? null,
      runnerUpTeamId: runner?.id ?? null,
      runnerUpName: runner?.name ?? null,
      thirdPlace: thirds.map((t) => ({ teamId: t.id, name: t.name })),
    };
  });
}
