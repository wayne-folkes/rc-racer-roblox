import { DEFAULT_VEHICLE, isVehicleId, type VehicleId } from './vehicles';

// A player's saved progress: the vehicle they picked, race and cup counts, and each cup's trophies.
// Unlocks are worked out from these counts (unlocks.ts), and the server keeps them in a data store
// (server/profile.ts). Pure rules, so the server runs them and tests can play them. Every `with…`
// function returns a new profile and leaves its input alone, because the server runs them inside
// data store UpdateAsync callbacks, which can be retried.

/** Trophies: 0 none, then bronze, silver, gold for 3rd, 2nd, 1st in a cup's overall standings. */
export const NO_TROPHY = 0;
export const BRONZE = 1;
export const SILVER = 2;
export const GOLD = 3;

/** What a player has done in one cup (a circuit), by circuit id. */
export interface CupRecord {
  /** Best trophy so far, one of the trophy values above. */
  best: number;
  finished: number;
  bronze: number;
  silver: number;
  gold: number;
}

export interface Profile {
  v: 1;
  /** The vehicle last picked. */
  vehicle: VehicleId;
  /** Races finished, cup or quick. */
  races: number;
  /** Races finished 1st overall, AI cars included. */
  raceWins: number;
  /** Cups finished, any place. */
  cupsFinished: number;
  /** By circuit id. */
  cups: Record<string, CupRecord>;
  rivalWins: number;
}

const emptyCup = (): CupRecord => ({ best: NO_TROPHY, finished: 0, bronze: 0, silver: 0, gold: 0 });

export function newProfile(): Profile {
  return { v: 1, vehicle: DEFAULT_VEHICLE, races: 0, raceWins: 0, cupsFinished: 0, cups: {}, rivalWins: 0 };
}

/** A count from storage: a whole number of 0 or more, or 0. */
function readCount(value: unknown): number {
  if (!typeIs(value, 'number') || value !== value || value < 0 || value >= math.huge) return 0;
  return value === math.floor(value) ? value : 0;
}

/** A trophy from storage: 0 to gold, or none. */
function readTrophy(value: unknown): number {
  if (!typeIs(value, 'number') || value !== value) return NO_TROPHY;
  return math.clamp(math.floor(value), NO_TROPHY, GOLD);
}

function readCup(value: unknown): CupRecord {
  const cup = value as Record<string, unknown>;
  return {
    best: readTrophy(cup.best),
    finished: readCount(cup.finished),
    bronze: readCount(cup.bronze),
    silver: readCount(cup.silver),
    gold: readCount(cup.gold),
  };
}

/**
 * What's stored for a player, field by field: anything missing or malformed falls back to its empty
 * value, so one bad field doesn't lose the rest.
 */
export function readProfile(value: unknown): Profile {
  const profile = newProfile();
  if (!typeIs(value, 'table')) return profile;
  const stored = value as Record<string, unknown>;
  profile.vehicle = isVehicleId(stored.vehicle) ? stored.vehicle : DEFAULT_VEHICLE;
  profile.races = readCount(stored.races);
  profile.raceWins = readCount(stored.raceWins);
  profile.cupsFinished = readCount(stored.cupsFinished);
  profile.rivalWins = readCount(stored.rivalWins);
  if (typeIs(stored.cups, 'table')) {
    // Read as a Map, as records.ts reads a stored table: roblox-ts has no Object.entries.
    for (const [circuit, cup] of stored.cups as Map<unknown, unknown>) {
      // A circuit id is always a string, but a record that isn't a table is skipped.
      if (typeIs(circuit, 'string') && typeIs(cup, 'table')) profile.cups[circuit] = readCup(cup);
    }
  }
  return profile;
}

export function withVehicle(p: Profile, vehicle: VehicleId): Profile {
  return { ...p, vehicle };
}

/** A finished race: one more race, and one more win if `won`. */
export function withRace(p: Profile, won: boolean): Profile {
  return { ...p, races: p.races + 1, raceWins: p.raceWins + (won ? 1 : 0) };
}

/** A finished cup: its counts, the best trophy kept, and a Rival win if `rival`. */
export function withCupResult(p: Profile, circuit: string, trophy: number, rival: boolean): Profile {
  const old = p.cups[circuit] ?? emptyCup();
  const cup: CupRecord = { ...old, finished: old.finished + 1, best: math.max(old.best, trophy) };
  if (trophy === BRONZE) cup.bronze += 1;
  else if (trophy === SILVER) cup.silver += 1;
  else if (trophy === GOLD) cup.gold += 1;
  return {
    ...p,
    cups: { ...p.cups, [circuit]: cup },
    cupsFinished: p.cupsFinished + 1,
    rivalWins: p.rivalWins + (rival ? 1 : 0),
  };
}
