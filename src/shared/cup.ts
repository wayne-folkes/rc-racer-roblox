import { ALL_TRACKS, CIRCUITS, CIRCUIT_IDS, circuitTracks, type CircuitId, type TrackDef } from './tracks';
import { BRONZE, GOLD, NO_TROPHY, SILVER } from './profile';

// What a server races: a cup (four races on one circuit, points for every place) or a quick single
// race, chosen by a vote between races. Pure rules, so the server runs them and tests can play them.

/** Points for 1st to 6th, as in Mario Kart. Every car scores, AI included, so they're real rivals. */
export const CUP_POINTS = [15, 12, 10, 8, 6, 4];

/** A choice in the vote: a cup, or a quick race on one track. */
export interface VoteOption {
  kind: 'cup' | 'quick';
  /** The circuit for a cup, or the track id for a quick race. */
  id: string;
  label: string;
}

/** Quick races on offer in each vote. */
const QUICK_CHOICES = 2;

/** Every cup, then quick races on `QUICK_CHOICES` different random tracks, either way round. */
export function voteOptions(rand: () => number): VoteOption[] {
  const options: VoteOption[] = [];
  for (const id of CIRCUIT_IDS) options.push({ kind: 'cup', id, label: CIRCUITS[id].name });
  const picked: string[] = [];
  while (picked.size() < QUICK_CHOICES) {
    const track = ALL_TRACKS[math.floor(rand() * ALL_TRACKS.size())];
    if (picked.includes(track.id)) continue;
    picked.push(track.id);
    options.push({ kind: 'quick', id: track.id, label: `Quick race: ${track.name}` });
  }
  return options;
}

/** Votes for each option, from each voter's choice. */
export function countVotes(optionCount: number, choices: number[]): number[] {
  const counts: number[] = [];
  for (let i = 0; i < optionCount; i++) counts.push(0);
  for (const c of choices) if (c >= 0 && c < optionCount) counts[c]++;
  return counts;
}

/** The winning option: most votes, a tie (or no votes at all) settled at random among the leaders. */
export function winningOption(counts: number[], rand: () => number): number {
  let best = -1;
  for (const c of counts) best = math.max(best, c);
  const leaders: number[] = [];
  counts.forEach((c, i) => {
    if (c === best) leaders.push(i);
  });
  return leaders[math.floor(rand() * leaders.size())];
}

/** Who scored: a player by user id, an AI car by name, so standings follow them from race to race. */
export interface Scorer {
  key: string;
  name: string;
  color: string;
  /** 0 for an AI car. */
  userId: number;
}

export interface CupStanding extends Scorer {
  points: number;
  /** Best finishing position in the cup so far, for breaking ties. */
  bestFinish: number;
  /** Points from the latest race. */
  lastPoints: number;
  /** Races scored for this scorer: fewer than the cup's races if they joined late or left early. */
  races: number;
}

export class Cup {
  readonly tracks: TrackDef[];
  /** Races finished so far. */
  round = 0;
  private readonly table = new Map<string, CupStanding>();

  constructor(readonly circuit: CircuitId) {
    this.tracks = circuitTracks(circuit, false);
  }

  name(): string {
    return CIRCUITS[this.circuit].name;
  }

  /** The track for the next race, or undefined once the cup is over. */
  nextTrack(): TrackDef | undefined {
    return this.round < this.tracks.size() ? this.tracks[this.round] : undefined;
  }

  done(): boolean {
    return this.round >= this.tracks.size();
  }

  /** Scores a race: `finishers` in finishing order. */
  addRace(finishers: Scorer[]): void {
    for (const [, row] of this.table) row.lastPoints = 0;
    finishers.forEach((f, place) => {
      const points = CUP_POINTS[place] ?? 0;
      const row = this.table.get(f.key) ?? { ...f, points: 0, bestFinish: math.huge, lastPoints: 0, races: 0 };
      row.name = f.name;
      row.color = f.color;
      row.userId = f.userId;
      row.points += points;
      row.lastPoints = points;
      row.races++;
      row.bestFinish = math.min(row.bestFinish, place + 1);
      this.table.set(f.key, row);
    });
    this.round++;
  }

  /** Everyone who has raced in the cup, leader first: by points, then best single finish, then name. */
  standings(): CupStanding[] {
    const rows: CupStanding[] = [];
    for (const [, row] of this.table) rows.push(row);
    rows.sort((a, b) => {
      if (a.points !== b.points) return a.points > b.points;
      if (a.bestFinish !== b.bestFinish) return a.bestFinish < b.bestFinish;
      return a.name < b.name;
    });
    return rows;
  }
}

/** What a player earned in a finished cup. */
export interface CupAward {
  userId: number;
  /** Overall place, 1st = 1, AI cars included. */
  place: number;
  /** NO_TROPHY, or BRONZE / SILVER / GOLD for 3rd / 2nd / 1st (shared/profile.ts). */
  trophy: number;
  /** Best-placed of two or more rivals: players who raced at least half the cup's races. */
  rival: boolean;
}

const TROPHY_BY_PLACE = [GOLD, SILVER, BRONZE];

/**
 * Awards for every player (not AI) in a finished cup's final standings, leader first.
 *
 * The trophy comes from the overall place, AI cars included, and there's no minimum number of races
 * for one: AI cars score in every race, so someone who joined late has no points for the races they
 * missed and is very unlikely to reach the top 3. A Rival win needs at least half the races, so a friend
 * who drops in for the last race doesn't turn a solo cup into one.
 */
export function cupAwards(standings: CupStanding[], totalRaces: number): CupAward[] {
  const rivals = standings.filter((r) => r.userId !== 0 && r.races * 2 >= totalRaces);
  // Only the best-placed of two or more rivals gets the Rival win. A solo cup has no rival to beat.
  const rivalWinner = rivals.size() >= 2 ? rivals[0].userId : -1;
  const awards: CupAward[] = [];
  standings.forEach((row, i) => {
    if (row.userId === 0) return;
    awards.push({
      userId: row.userId,
      place: i + 1,
      trophy: TROPHY_BY_PLACE[i] ?? NO_TROPHY,
      rival: row.userId === rivalWinner,
    });
  });
  return awards;
}

/**
 * The results news a player is shown after a cup: the trophy, a Rival win, each vehicle just unlocked,
 * and a warning if their progress couldn't be saved (in which case nothing was unlocked).
 */
export function awardNews(award: CupAward | undefined, cupName: string, unlocked: string[], saved: boolean): string[] {
  const news: string[] = [];
  if (award !== undefined && award.trophy !== NO_TROPHY) {
    const word = award.trophy === GOLD ? 'Gold' : award.trophy === SILVER ? 'Silver' : 'Bronze';
    news.push(`${word} in the ${cupName}`);
  }
  if (award?.rival) news.push('Rival win! Top player in the cup');
  for (const name of unlocked) news.push(`Unlocked: ${name}`);
  if (award !== undefined && !saved) news.push("Progress couldn't be saved");
  return news;
}
