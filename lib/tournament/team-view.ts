import "server-only";
import { db } from "@/lib/db";
import { getGroupsWithStandings, type GroupView } from "@/lib/tournament/groups-view";
import { countryFlag } from "@/lib/countries";

const ROSTER_VISIBLE_STATUSES = [
  "GROUPS_PUBLISHED",
  "GROUPS_IN_PROGRESS",
  "CUPS_PUBLISHED",
  "CUPS_IN_PROGRESS",
  "FINISHED",
];

export interface PublicTeamRosterView {
  id: string;
  name: string;
  flag: string;
  players: { firstName: string; lastName: string }[];
}

/**
 * Datos públicos (sin DNI/email/teléfono) de un equipo: solo para que otros
 * participantes vean a quién se enfrentan una vez publicado el fixture.
 */
export async function getPublicTeamRoster(teamId: string): Promise<PublicTeamRosterView | null> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: {
      tournament: { select: { status: true } },
      players: {
        select: { firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
    },
  });
  if (!team) return null;
  if (!ROSTER_VISIBLE_STATUSES.includes(team.tournament.status)) return null;

  return {
    id: team.id,
    name: team.name,
    flag: countryFlag(team.name),
    players: team.players,
  };
}

export interface TeamMatchView {
  id: string;
  phase: "GROUP" | "CUP";
  label: string;
  startsAt: Date | null;
  fieldName: string | null;
  isHome: boolean;
  opponentName: string | null;
  ownScore: number | null;
  opponentScore: number | null;
  ownShootout: number | null;
  opponentShootout: number | null;
  status: string;
  result: "WIN" | "LOSS" | "DRAW" | null;
}

export interface TeamTournamentView {
  groupName: string | null;
  group: GroupView | null;
  ownRank: number | null;
  cupName: string | null;
  matches: TeamMatchView[];
}

export async function getTeamTournamentView(teamId: string): Promise<TeamTournamentView> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { group: true, cup: true, tournament: { select: { status: true } } },
  });
  if (!team) return { groupName: null, group: null, ownRank: null, cupName: null, matches: [] };

  const showTournament = ["GROUPS_PUBLISHED", "GROUPS_IN_PROGRESS", "CUPS_PUBLISHED", "CUPS_IN_PROGRESS", "FINISHED"].includes(
    team.tournament?.status ?? "",
  );
  if (!showTournament) {
    return { groupName: team.group?.name ?? null, group: null, ownRank: null, cupName: null, matches: [] };
  }

  const allGroups = team.group ? await getGroupsWithStandings(team.tournamentId) : [];
  const group = allGroups.find((g) => g.id === team.groupId) ?? null;
  const ownRank = group?.rows.find((r) => r.teamId === teamId)?.rank ?? null;

  const rawMatches = await db.match.findMany({
    where: {
      tournamentId: team.tournamentId,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      group: { select: { name: true } },
      cup: { select: { name: true } },
      slot: { include: { round: true, field: true } },
      bracketMatch: { select: { round: true } },
    },
  });

  const matches: TeamMatchView[] = rawMatches
    .map((m) => {
      const isHome = m.homeTeamId === teamId;
      const opp = isHome ? m.awayTeam : m.homeTeam;
      const ownScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;
      const ownSo = isHome ? m.homeShootout : m.awayShootout;
      const oppSo = isHome ? m.awayShootout : m.homeShootout;

      let result: TeamMatchView["result"] = null;
      if (m.status === "FINISHED" || m.status === "WALKOVER") {
        if (m.winnerTeamId === teamId) result = "WIN";
        else if (m.winnerTeamId == null) result = "DRAW";
        else result = "LOSS";
      }

      const label = m.group
        ? `Grupo ${m.group.name}`
        : m.cup
          ? `Copa ${m.cup.name}${m.bracketMatch ? ` · ${roundLabel(m.bracketMatch.round)}` : ""}`
          : "Partido";

      return {
        id: m.id,
        phase: m.phase as "GROUP" | "CUP",
        label,
        startsAt: m.slot?.round.startsAt ?? null,
        fieldName: m.slot?.field.name ?? null,
        isHome,
        opponentName: opp?.name ?? null,
        ownScore,
        opponentScore: oppScore,
        ownShootout: ownSo,
        opponentShootout: oppSo,
        status: m.status,
        result,
      };
    })
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));

  return {
    groupName: team.group?.name ?? null,
    group,
    ownRank,
    cupName: team.cup?.name ?? null,
    matches,
  };
}

function roundLabel(r: string): string {
  return { OCTAVOS: "Octavos", CUARTOS: "Cuartos", SEMIS: "Semifinal", FINAL: "Final", THIRD_PLACE: "3er puesto" }[r] ?? r;
}
