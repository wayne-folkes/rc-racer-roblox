import type { AiSkill } from './aiDriver';
import { createCar, type CarState } from './carPhysics';
import { Math } from './jsMath';
import type { TrackPath } from './trackPath';

// Who starts where. Six slots: players take them from the back, as the web game's player does, and
// AI cars fill the rest from pole position. gridPosition is rc-racer's racers.ts.

export const GRID_SIZE = 6;

export interface AiRacer {
  name: string;
  color: string;
  skill: AiSkill;
}

/** In grid order: the quickest starts on pole. Blue, Yellow and Green are the web game's opponents. */
export const AI_RACERS: AiRacer[] = [
  { name: 'Blue', color: '#3b82f6', skill: { pace: 0.87, steerGain: 2.6 } },
  { name: 'Purple', color: '#8b5cf6', skill: { pace: 0.855, steerGain: 2.45 } },
  { name: 'Yellow', color: '#facc15', skill: { pace: 0.84, steerGain: 2.3 } },
  { name: 'Orange', color: '#f97316', skill: { pace: 0.825, steerGain: 2.15 } },
  { name: 'Green', color: '#22c55e', skill: { pace: 0.81, steerGain: 2.0 } },
  // Only races when no players are on the grid, e.g. in tests.
  { name: 'Silver', color: '#94a3b8', skill: { pace: 0.8, steerGain: 1.95 } },
];

/** Players' colours, in the order they join. None is an AI colour. */
export const PLAYER_COLORS = ['#e63946', '#ec4899', '#14b8a6', '#f1f5f9', '#84cc16', '#78350f'];

/** Takes over the car of a player who leaves mid-race. */
export const STAND_IN_SKILL: AiSkill = { pace: 0.83, steerGain: 2.2 };

/** Distance behind the finish line of pole position, and between grid rows. */
const GRID_FRONT = 5;
const GRID_ROW_GAP = 3.5;
/** Grid slots alternate left and right of the centreline by this much. */
const GRID_SIDE = 2;

/** A car on the starting grid, staggered two abreast behind the line. */
export function gridPosition(track: TrackPath, slot: number): CarState {
  const p = track.pointAt(track.length - GRID_FRONT - slot * GRID_ROW_GAP);
  const side = slot % 2 === 0 ? -GRID_SIDE : GRID_SIDE;
  return createCar(p.x - p.tz * side, p.z + p.tx * side, Math.atan2(p.tz, p.tx));
}

/** The grid slot of the nth player to join (0-based): the back slot first. */
export const playerSlot = (n: number) => GRID_SIZE - 1 - n;
