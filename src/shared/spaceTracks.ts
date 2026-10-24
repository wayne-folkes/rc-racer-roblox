import { hazardZones, pickupRow } from './items';
import type { Point } from './trackPath';
import type { TrackDef } from './tracks';

// The Space Cup: four invented courses laid out like the surfaces they're named for. Like the classic
// tracks, each must pass tracks.test.ts (forward and reversed).

const pts = (coords: number[][]): Point[] => coords.map(([x, z]) => ({ x, z }));

export const SPACE_TRACKS: TrackDef[] = [
  {
    id: 'moon',
    name: 'Tranquility Run',
    // Wide and fast: a rounded triangle, with a chicane on the bottom straight.
    halfWidth: 7,
    controlPoints: pts([
      [0, 52], [26, 56], [54, 46], [86, 52], [108, 26], [96, -8], [60, -38], [26, -58],
      [0, -66], [-26, -58], [-60, -38], [-96, -8], [-108, 26], [-86, 52], [-54, 46], [-26, 56],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(7, [0.27, 0.46, 0.58, 0.74]),
      pickups: [
        ...pickupRow(0.12, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.31, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.66, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.22, lateral: -3 },
        { at: 0.52, lateral: 3 },
        { at: 0.84, lateral: -2.5 },
      ],
      // Low gravity would make these a long way up; the long diagonals are the place for them.
      ramps: [{ at: 0.4 }, { at: 0.62 }],
    },
    theme: { sky: '#05060d', ground: '#8d8d92', road: '#2d2e35', scenery: 'craters', meteors: true },
  },
  {
    id: 'mars',
    name: 'Olympus Rally',
    // A narrow rally stage: a semicircular hairpin, a long tongue back, then a big loop.
    halfWidth: 5,
    controlPoints: pts([
      [-68, 50], [-30, 58], [12, 58], [44, 58], [56, 54], [61, 41], [56, 28], [44, 24],
      [14, 22], [-18, 26], [-48, 24], [-64, 8], [-54, -12], [-26, -20], [6, -14], [30, -6],
      [72, 0], [92, -18], [80, -42], [44, -54], [10, -40], [-24, -54], [-62, -48], [-90, -18], [-88, 20],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5, [0.1, 0.36, 0.6, 0.86], 0.01),
      pickups: [
        ...pickupRow(0.14, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.52, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.88, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.27, lateral: -1.8 },
        { at: 0.46, lateral: 2 },
        { at: 0.58, lateral: -2.4 },
        { at: 0.93, lateral: 2.4 },
      ],
      ramps: [{ at: 0.07 }, { at: 0.31 }, { at: 0.5 }, { at: 0.8 }],
    },
    theme: { sky: '#d9a273', ground: '#b9582f', road: '#4b2f27', scenery: 'mesas', weather: 'dust', meteors: true },
  },
  {
    id: 'io',
    name: 'Pele Loop',
    // A peanut wrapped round two volcanoes, pinched at the waist.
    halfWidth: 5.5,
    controlPoints: pts([
      [0, -26], [28, -44], [62, -50], [90, -28], [94, 6], [80, 38], [46, 50], [18, 34],
      [0, 26], [-18, 34], [-46, 50], [-80, 38], [-94, 6], [-90, -28], [-62, -50], [-28, -44],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5.5, [0.16, 0.33, 0.665, 0.83], 0.01),
      pickups: [
        ...pickupRow(0.1, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.38, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.62, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.9, ['bomb', 'missile', 'bomb']),
      ],
      boostPads: [
        { at: 0.02, lateral: -2.4 },
        { at: 0.27, lateral: 2.8 },
        { at: 0.52, lateral: -2.2 },
        { at: 0.77, lateral: 2.6 },
      ],
      ramps: [{ at: 0.2 }, { at: 0.7 }],
    },
    theme: { sky: '#3a2414', ground: '#d6c23f', road: '#4d4033', scenery: 'volcanoes', ponds: 'lava', weather: 'embers', meteors: true },
  },
  {
    id: 'europa',
    name: 'Conamara Run',
    // Long and skinny, zig-zagging like the cracks in Europa's ice.
    halfWidth: 6,
    controlPoints: pts([
      [-110, -30], [-70, -48], [-30, -34], [10, -52], [50, -36], [90, -50], [118, -22], [112, 12],
      [70, 40], [30, 24], [-10, 44], [-50, 26], [-90, 42], [-122, 14],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(6, [0.03, 0.41, 0.5, 0.965], 0.01),
      pickups: [
        ...pickupRow(0.14, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.45, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.7, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.05, lateral: 3 },
        { at: 0.33, lateral: -3 },
        { at: 0.58, lateral: -2.6 },
        { at: 0.92, lateral: 3 },
      ],
      ramps: [{ at: 0.19 }, { at: 0.62 }, { at: 0.78 }],
    },
    theme: { sky: '#0b1030', ground: '#dbe9f2', road: '#3b4d66', scenery: 'ice', weather: 'glitter', meteors: true },
  },
];
