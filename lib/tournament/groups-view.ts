import "server-only";
import { db } from "@/lib/db";

export interface GroupStandingRow {
  teamId: string;
  teamName: string;
  rank: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  fairPlayPoints: number;
  tiebreakNote: string | null;
}

export interface GroupView {
  id: string;
  name: string;
  order: number;
  rows: GroupStandingRow[];
}

export async function getGroupsWithStandings(tournamentId: string): Promise<GroupView[]> {
  const groups = await db.group.findMany({
    where: { tournamentId },
    orderBy: { order: "asc" },
    include: {
      groupTeams: {
        include: { team: { select: { id: true, name: true } } },
      },
    },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    order: g.order,
    rows: g.groupTeams
      .map((gt) => ({
        teamId: gt.teamId,
        teamName: gt.team.name,
        rank: gt.rank,
        played: gt.played,
        won: gt.won,
        drawn: gt.drawn,
        lost: gt.lost,
        goalsFor: gt.goalsFor,
        goalsAgainst: gt.goalsAgainst,
        goalDiff: gt.goalDiff,
        points: gt.points,
        fairPlayPoints: gt.fairPlayPoints,
        tiebreakNote: gt.tiebreakNote,
      }))
      .sort((a, b) => {
        if (a.rank != null && b.rank != null) return a.rank - b.rank;
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDiff !== b.goalDiff) return b.goalDiff - a.goalDiff;
        return a.teamName.localeCompare(b.teamName);
      }),
  }));
}

export interface FixtureMatchView {
  id: string;
  tanda: number;
  tandaLabel: string;
  roundId: string | null;
  startsAt: Date;
  fieldName: string | null;
  groupName: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  walkoverTeamId: string | null;
}

export async function getGroupFixture(tournamentId: string): Promise<FixtureMatchView[]> {
  const matches = await db.match.findMany({
    where: { tournamentId, phase: "GROUP" },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      group: { select: { name: true } },
      slot: { include: { round: true, field: true } },
    },
  });

  return matches
    .map((m) => ({
      id: m.id,
      tanda: m.slot?.round.order ?? 0,
      tandaLabel: m.slot?.round.label ?? "—",
      roundId: m.slot?.round.id ?? null,
      startsAt: m.slot?.round.startsAt ?? new Date(0),
      fieldName: m.slot?.field.name ?? null,
      groupName: m.group?.name ?? null,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeamName: m.homeTeam?.name ?? "—",
      awayTeamName: m.awayTeam?.name ?? "—",
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      walkoverTeamId: m.walkoverTeamId,
    }))
    .sort((a, b) => a.tanda - b.tanda || (a.fieldName ?? "").localeCompare(b.fieldName ?? ""));
}
