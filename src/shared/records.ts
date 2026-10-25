import type { RecordRow } from './protocol';
import { DEFAULT_VEHICLE, type VehicleId } from './vehicles';

// Best times, kept per track, per direction ('meadow' and 'meadow-rev' are separate tracks), and per
// vehicle, for a whole race and for a single lap. Each player has their own bests, and each track and
// vehicle has a top 10 of the players' bests. The server saves them in Roblox's data stores
// (server/records.ts); this is the part that decides what counts and what beats what.

export type RecordKind = 'race' | 'lap';
export const RECORD_KINDS: RecordKind[] = ['race', 'lap'];
export const LEADERBOARD_SIZE = 10;
/** A time we don't have, in a message. */
export const NO_TIME = -1;

/** A player's best times on one track, in whole milliseconds. */
export interface TrackBests {
  race?: number;
  lap?: number;
}

/** A player's best times on every track and vehicle they've raced, by `recordKey`. */
export type PersonalBests = Record<string, TrackBests>;

/**
 * Where a vehicle's times on a track are kept: the track id for the buggy, so times saved before
 * vehicles existed stay where they are, and `<vehicle>_<trackId>` for any other vehicle.
 */
export function recordKey(trackId: string, vehicle: VehicleId): string {
  return vehicle === DEFAULT_VEHICLE ? trackId : `${vehicle}_${trackId}`;
}

/** Times are kept in whole milliseconds, because ordered data stores only sort whole numbers. */
export const toMs = (seconds: number) => math.round(seconds * 1000);

/**
 * The quickest a race (`laps` laps) or a lap could possibly be, driving the centreline flat out at
 * `topSpeed`. Anything faster was faked by the device reporting the car, and isn't kept.
 */
export function fastestPossible(trackLength: number, laps: number, topSpeed: number): number {
  return (laps * trackLength) / topSpeed;
}

/** `bests` with `ms` as the best for `kind` on `trackId`, if it beats what's there. */
export function withBest(bests: PersonalBests | undefined, trackId: string, kind: RecordKind, ms: number): PersonalBests {
  const all: PersonalBests = { ...(bests ?? {}) };
  const track: TrackBests = { ...(all[trackId] ?? {}) };
  const old = track[kind];
  if (old === undefined || ms < old) track[kind] = ms;
  all[trackId] = track;
  return all;
}

/**
 * The top `size` with `row` in it: a player appears once, with their best time, and equal times keep
 * whoever set theirs first.
 */
export function placeInTop(rows: RecordRow[], row: RecordRow, size = LEADERBOARD_SIZE): RecordRow[] {
  const old = rows.find((r) => r.userId === row.userId);
  if (old && old.time <= row.time) return rows;
  const others = rows.filter((r) => r.userId !== row.userId);
  let at = others.size();
  for (let i = 0; i < others.size(); i++) {
    if (row.time < others[i].time) {
      at = i;
      break;
    }
  }
  const result = [...others];
  result.insert(at, row);
  while (result.size() > size) result.pop();
  return result;
}
