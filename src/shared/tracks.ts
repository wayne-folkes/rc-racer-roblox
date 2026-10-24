import { DEMO_LAYOUT, hazardZones, pickupRow, type TrackLayout, type TrackSpot } from './items';
import { RAMP_LENGTH, type RampSpec } from './jumps';
import { SPACE_TRACKS } from './spaceTracks';
import { DEMO_TRACK, TrackPath, type Point } from './trackPath';

// The season's tracks, in race order. Each must pass tracks.test.ts: no corner tighter than the
// road is wide, hazards only where the racing line is steady enough to steer round them, and a
// full AI race with nobody getting stuck.

export type Scenery = 'trees' | 'cacti' | 'pines' | 'craters' | 'mesas' | 'volcanoes' | 'ice';
/** Ambient effects drawn over the track. Purely visual: they don't touch the cars. */
export type Weather = 'snow' | 'tumbleweeds' | 'dust' | 'embers' | 'glitter';
export type PondStyle = 'water' | 'lava';

export interface TrackTheme {
  sky: string;
  ground: string;
  road: string;
  scenery: Scenery;
  /** Small pools dotted around the infield and outside the track. */
  ponds?: PondStyle;
  weather?: Weather;
  /** Meteors now and then hit the ground beside the track and leave craters. */
  meteors?: boolean;
}

export interface TrackDef {
  id: string;
  name: string;
  halfWidth: number;
  controlPoints: Point[];
  layout: TrackLayout;
  theme: TrackTheme;
  /** True for a track driven the other way round (see reverseTrack). */
  reversed?: boolean;
}

const pts = (coords: number[][]): Point[] => coords.map(([x, z]) => ({ x, z }));

export const TRACKS: TrackDef[] = [
  {
    id: 'demo',
    name: 'Meadow Loop',
    halfWidth: 5.5,
    controlPoints: DEMO_TRACK,
    layout: DEMO_LAYOUT,
    theme: { sky: '#8fc7e8', ground: '#6fbf5a', road: '#4a4f5a', scenery: 'trees' },
  },
  {
    id: 'desert',
    name: 'Desert Dash',
    // Wide and fast: long straights joined by sweeping hairpins.
    halfWidth: 6.5,
    controlPoints: pts([
      [-60, -40], [-20, -42], [20, -42], [58, -40], [80, -26], [86, -4], [78, 16], [56, 22],
      [30, 18], [4, 26], [-26, 34], [-58, 36], [-80, 24], [-86, 0], [-80, -24],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(6.5, [0.212, 0.36, 0.86]),
      pickups: [...pickupRow(0.12, ['missile', 'bomb', 'missile']), ...pickupRow(0.66, ['bomb', 'missile', 'bomb'])],
      boostPads: [
        { at: 0.04, lateral: -2.4 },
        { at: 0.72, lateral: -2 },
        { at: 0.92, lateral: 3.8 },
      ],
      // Over the top-straight puddle, and straight after a boost pad for a big one.
      ramps: [{ at: 0.175 }, { at: 0.77 }],
    },
    theme: { sky: '#f2d3a0', ground: '#e0c08a', road: '#5a5048', scenery: 'cacti', weather: 'tumbleweeds' },
  },
  {
    id: 'lakeside',
    name: 'Lakeside Snake',
    // A long serpentine: three straights linked by tight U-turns, with plenty of puddles.
    halfWidth: 5.5,
    controlPoints: pts([
      [-60, -42], [-10, -44], [40, -40], [62, -28], [58, -10], [36, -4], [0, -4], [-30, -2],
      [-46, 10], [-40, 26], [-14, 30], [30, 28], [56, 36], [62, 52], [46, 64], [0, 66],
      [-44, 64], [-70, 50], [-78, 20], [-76, -14], [-72, -34],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5.5, [0.135, 0.33, 0.54, 0.76, 0.86]),
      pickups: [...pickupRow(0.08, ['missile', 'bomb', 'missile']), ...pickupRow(0.5, ['bomb', 'missile', 'bomb'])],
      boostPads: [
        { at: 0.28, lateral: -2.2 },
        { at: 0.7, lateral: -2.3 },
        { at: 0.9, lateral: 3 },
      ],
      ramps: [{ at: 0.1 }, { at: 0.72 }],
    },
    theme: { sky: '#9fd4ef', ground: '#7cc36b', road: '#4a4f5a', scenery: 'trees', ponds: 'water' },
  },
  {
    id: 'snow',
    name: 'Snow Peak',
    // Narrow and technical, with a hairpin that doubles back into the infield.
    halfWidth: 5,
    controlPoints: pts([
      [-50, -40], [-10, -44], [28, -40], [48, -24], [42, -6], [22, -2], [8, 6], [6, 18],
      [18, 27], [44, 26], [60, 38], [60, 54], [42, 63], [16, 62], [-6, 50], [-20, 32],
      [-36, 30], [-50, 38], [-66, 40], [-76, 26], [-72, 2], [-62, -24],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5, [0.03, 0.6, 0.955], 0.008),
      pickups: [...pickupRow(0.08, ['missile', 'bomb', 'missile']), ...pickupRow(0.62, ['bomb', 'missile', 'bomb'])],
      boostPads: [
        { at: 0.12, lateral: -2.4 },
        { at: 0.58, lateral: -1.6 },
        { at: 0.92, lateral: 2.8 },
      ],
      // Snow Peak's one proper straight; land short and you're on the ice.
      ramps: [{ at: 0.135 }],
    },
    theme: { sky: '#c9dbe9', ground: '#eef3f7', road: '#59616e', scenery: 'pines', weather: 'snow' },
  },
];

/**
 * The same road driven the other way. The start line stays where it is, so the grid sits just beyond it
 * in the original direction. A spot `at` a fraction of the lap becomes `1 - at` with left and right
 * swapped. A ramp fills a stretch of road and is placed by its foot, which is now at the other end of it.
 */
export function reverseTrack(def: TrackDef): TrackDef {
  // Listing the control points backwards, with the first one held, is the same closed curve the other way.
  const points = def.controlPoints;
  const reversedPoints: Point[] = [points[0]];
  for (let i = points.size() - 1; i >= 1; i--) reversedPoints.push(points[i]);
  const length = new TrackPath(def.controlPoints, def.halfWidth).length;
  const wrap = (at: number) => ((at % 1) + 1) % 1;
  const mirror = <T extends TrackSpot>(spot: T): T => ({ ...spot, at: wrap(1 - spot.at), lateral: -spot.lateral });
  const mirrorRamp = (ramp: RampSpec): RampSpec => {
    const at = wrap(1 - ramp.at - RAMP_LENGTH / length);
    if (ramp.lateral === undefined) return { ...ramp, at };
    return { ...ramp, at, lateral: -ramp.lateral };
  };
  return {
    ...def,
    id: `${def.id}-rev`,
    name: `${def.name} (Reverse)`,
    reversed: true,
    controlPoints: reversedPoints,
    layout: {
      hazards: def.layout.hazards.map(mirror),
      hazardZones: def.layout.hazardZones?.map((zone) => ({ ...zone, at: wrap(1 - zone.at) })),
      pickups: def.layout.pickups.map(mirror),
      boostPads: def.layout.boostPads.map(mirror),
      ramps: def.layout.ramps?.map(mirrorRamp),
    },
  };
}

export type CircuitId = 'classic' | 'space';
export const CIRCUIT_IDS: CircuitId[] = ['classic', 'space'];
export const DEFAULT_CIRCUIT: CircuitId = 'classic';

export interface Circuit {
  name: string;
  blurb: string;
  /** Four rounds, in race order. */
  tracks: TrackDef[];
}

export const CIRCUITS: Record<CircuitId, Circuit> = {
  classic: { name: 'Classic Cup', blurb: 'Meadow, desert, lakeside and snow.', tracks: TRACKS },
  space: { name: 'Space Cup', blurb: 'The Moon, Mars, Io and Europa.', tracks: SPACE_TRACKS },
};

export function isCircuitId(value: unknown): value is CircuitId {
  // Only the ids are strings in the list, so a non-string never matches; no typeof needed (roblox-ts has none).
  for (const id of CIRCUIT_IDS) {
    if (id === value) return true;
  }
  return false;
}

const reversedCircuits = new Map<CircuitId, TrackDef[]>();

/** A circuit's tracks in race order, driven forwards or all of them the other way round. */
export function circuitTracks(id: CircuitId, reverse: boolean): TrackDef[] {
  if (!reverse) return CIRCUITS[id].tracks;
  let reversed = reversedCircuits.get(id);
  if (reversed === undefined) {
    reversed = CIRCUITS[id].tracks.map(reverseTrack);
    reversedCircuits.set(id, reversed);
  }
  return reversed;
}

/** Every track there is, either way round: what the guard tests run over and what a records reset clears. */
export const ALL_TRACKS: TrackDef[] = [];
for (const id of CIRCUIT_IDS) {
  for (const def of circuitTracks(id, false)) ALL_TRACKS.push(def);
  for (const def of circuitTracks(id, true)) ALL_TRACKS.push(def);
}

/** The track with this id, forwards or reversed, or undefined if there isn't one. */
export function trackById(id: string): TrackDef | undefined {
  for (const def of ALL_TRACKS) {
    if (def.id === id) return def;
  }
  return undefined;
}

/** Height of the road surface the cars sit on, just above the ground plane at 0. */
export const ROAD_TOP = 0.05;

/** The first classic track, Meadow Loop. Kept for the spike's callers, which drive that one track. */
export const MEADOW_LOOP: TrackDef = TRACKS[0];

export const trackPath = (def: TrackDef): TrackPath => new TrackPath(def.controlPoints, def.halfWidth);

/** How far behind the start line the car starts, along the centreline. */
const GRID_BACK = 8;

/** Where the car starts: on the centreline behind the start line, facing along the track. */
export function gridStart(track: TrackPath) {
  const p = track.pointAt(-GRID_BACK);
  return { x: p.x, z: p.z, heading: math.atan2(p.tz, p.tx) };
}
