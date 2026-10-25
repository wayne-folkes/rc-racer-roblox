import { hazardZones, pickupRow } from './items';
import type { Point } from './trackPath';
import type { TrackDef } from './tracks';

// The Toybox Cup: four courses round the house, at an RC car's scale, so the toys, books and tins beside
// the road are as big as the cars. Like the other tracks, each must pass tracks.test.ts (forward and reversed).

const pts = (coords: number[][]): Point[] => coords.map(([x, z]) => ({ x, z }));

export const TOYBOX_TRACKS: TrackDef[] = [
  {
    id: 'bedroom',
    name: 'Bedroom Floor',
    // Orange toy track across the carpet: a long straight, a big U, and an S-bend between the toys.
    halfWidth: 5.5,
    controlPoints: pts([
      [-70, -40], [-20, -44], [30, -44], [70, -38], [90, -16], [84, 10], [60, 20], [36, 12],
      [14, 20], [0, 40], [-20, 54], [-50, 56], [-76, 44], [-88, 16], [-86, -18],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5.5, [0.16, 0.36, 0.72, 0.86]),
      pickups: [...pickupRow(0.08, ['missile', 'bomb', 'missile']), ...pickupRow(0.55, ['bomb', 'missile', 'bomb'])],
      boostPads: [
        { at: 0.27, lateral: -2.2 },
        { at: 0.62, lateral: 2.4 },
        { at: 0.94, lateral: -2.6 },
      ],
      ramps: [{ at: 0.1 }, { at: 0.79 }],
    },
    theme: { sky: '#f4e9d8', ground: '#5b7bc4', road: '#e8742a', scenery: 'toys' },
  },
  {
    id: 'kitchen',
    name: 'Kitchen Dash',
    // Long and narrow across the tiles, kinked by chicanes, with spilt milk to steer round.
    halfWidth: 5,
    controlPoints: pts([
      [-100, -22], [-60, -26], [-30, -18], [0, -26], [40, -26], [80, -20], [110, -4], [108, 16],
      [84, 26], [50, 22], [20, 30], [-20, 24], [-50, 30], [-90, 26], [-114, 8], [-116, -10],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5, [0.12, 0.3, 0.45, 0.66, 0.84]),
      pickups: [
        ...pickupRow(0.05, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.38, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.74, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.22, lateral: -2 },
        { at: 0.56, lateral: 2.2 },
        { at: 0.93, lateral: -2.4 },
      ],
      ramps: [{ at: 0.19 }, { at: 0.76 }],
    },
    theme: { sky: '#f6efe2', ground: '#c9774f', road: '#5d636b', scenery: 'pantry', ponds: 'milk' },
  },
  {
    id: 'sandbox',
    name: 'Sandbox Scramble',
    // Wide and lumpy, wound round the sandcastles.
    halfWidth: 6.5,
    controlPoints: pts([
      [0, -60], [40, -56], [70, -34], [66, -6], [86, 18], [76, 46], [48, 54], [24, 46],
      [0, 56], [-26, 64], [-56, 50], [-62, 22], [-84, 0], [-76, -30], [-44, -52],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(6.5, [0.07, 0.345, 0.59, 0.85]),
      pickups: [
        ...pickupRow(0.2, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.5, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.78, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.27, lateral: -2.6 },
        { at: 0.46, lateral: 2.8 },
        { at: 0.68, lateral: -2.4 },
        { at: 0.94, lateral: 3 },
      ],
      ramps: [{ at: 0.38 }, { at: 0.81 }],
    },
    theme: { sky: '#a9d8f0', ground: '#ecd9a6', road: '#b9935a', scenery: 'sandcastles' },
  },
  {
    id: 'garage',
    name: 'Garage Grand Prix',
    // Round the edge of the garage floor and in past the workbench, past oil drips from the real car.
    halfWidth: 6,
    controlPoints: pts([
      [-30, -42], [20, -42], [66, -40], [84, -24], [86, 0], [84, 24], [66, 40], [30, 42],
      [10, 30], [-10, 30], [-30, 42], [-66, 40], [-84, 24], [-86, -20], [-76, -38],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(6, [0.14, 0.33, 0.7, 0.88]),
      pickups: [
        ...pickupRow(0.07, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.42, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.78, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.24, lateral: 2.4 },
        { at: 0.56, lateral: -2.2 },
        { at: 0.95, lateral: 2.6 },
      ],
      ramps: [{ at: 0.2 }, { at: 0.65 }],
    },
    theme: { sky: '#c7c9cc', ground: '#a7a49b', road: '#3c4047', scenery: 'workshop', ponds: 'oil' },
  },
];
