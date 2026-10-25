import { hazardZones, pickupRow } from './items';
import type { Point } from './trackPath';
import type { TrackDef } from './tracks';

// The City Cup: four night races through town, lit by the scenery's neon and lamps. Like the other tracks,
// each must pass tracks.test.ts (forward and reversed).

const pts = (coords: number[][]): Point[] => coords.map(([x, z]) => ({ x, z }));

export const CITY_TRACKS: TrackDef[] = [
  {
    id: 'downtown',
    name: 'Neon Downtown',
    // Round the blocks: square corners, a step through the middle, and short straights between towers.
    halfWidth: 6,
    controlPoints: pts([
      [-40, -52], [10, -50], [24, -36], [26, -10], [40, 2], [80, 4], [94, 18], [92, 46],
      [76, 58], [30, 58], [-10, 56], [-24, 42], [-26, 14], [-40, 0], [-80, -2], [-94, -16],
      [-96, -38], [-80, -50],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(6, [0.06, 0.36, 0.55, 0.88]),
      pickups: [
        ...pickupRow(0.15, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.46, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.76, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.25, lateral: -2.4 },
        { at: 0.64, lateral: 2.6 },
        { at: 0.96, lateral: -2.8 },
      ],
      ramps: [{ at: 0.3 }, { at: 0.8 }],
    },
    theme: { sky: '#0a0c1e', ground: '#353a4c', road: '#22242c', scenery: 'skyscrapers', night: true },
  },
  {
    id: 'rooftops',
    name: 'Rooftop Run',
    // Narrow and twisty over the roofs, with four jumps across the gaps between them.
    halfWidth: 5,
    controlPoints: pts([
      [-40, -34], [0, -30], [30, -40], [60, -44], [86, -30], [84, -4], [62, 8], [46, 20],
      [44, 36], [46, 50], [34, 62], [12, 58], [-10, 42], [-36, 48], [-64, 50], [-86, 34],
      [-90, 6], [-88, -18], [-72, -32],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5, [0.1, 0.27, 0.625, 0.78, 0.93], 0.01),
      pickups: [
        ...pickupRow(0.18, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.55, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.86, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.36, lateral: -2 },
        { at: 0.7, lateral: 2.2 },
        { at: 0.98, lateral: -2.2 },
      ],
      ramps: [{ at: 0.04 }, { at: 0.2 }, { at: 0.66 }, { at: 0.83 }],
    },
    theme: { sky: '#131735', ground: '#55535e', road: '#2e3038', scenery: 'rooftop', night: true },
  },
  {
    id: 'docks',
    name: 'Harbour Docks',
    // Along the quay and out and back down two piers, in the rain, between the shipping containers.
    halfWidth: 5.5,
    controlPoints: pts([
      [-40, -50], [20, -50], [70, -46], [96, -26], [94, 0], [80, 30], [78, 60], [64, 76],
      [46, 70], [42, 40], [30, 20], [10, 22], [0, 44], [-6, 70], [-24, 80], [-42, 70],
      [-46, 40], [-60, 16], [-86, 6], [-98, -20], [-80, -44],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(5.5, [0.12, 0.27, 0.535, 0.67, 0.92]),
      pickups: [
        ...pickupRow(0.05, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.4, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.78, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.19, lateral: 2.6 },
        { at: 0.47, lateral: -2.2 },
        { at: 0.6, lateral: 2.4 },
        { at: 0.85, lateral: -2.6 },
      ],
      ramps: [{ at: 0.33 }, { at: 0.75 }],
    },
    theme: { sky: '#0d1828', ground: '#474c54', road: '#2a2d33', scenery: 'containers', ponds: 'water', weather: 'rain', night: true },
  },
  {
    id: 'freeway',
    name: 'Midnight Freeway',
    // Wide and fast: a big loop of motorway with an S through the interchange, under the street lights.
    halfWidth: 7,
    controlPoints: pts([
      [0, -60], [50, -62], [100, -54], [128, -30], [130, 0], [118, 30], [90, 44], [60, 40],
      [30, 50], [0, 62], [-40, 64], [-90, 58], [-122, 36], [-132, 0], [-120, -34], [-90, -54],
      [-46, -62],
    ]),
    layout: {
      hazards: [],
      hazardZones: hazardZones(7, [0.12, 0.33, 0.56, 0.8]),
      pickups: [
        ...pickupRow(0.06, ['missile', 'bomb', 'missile']),
        ...pickupRow(0.45, ['bomb', 'missile', 'bomb']),
        ...pickupRow(0.7, ['missile', 'bomb', 'missile']),
      ],
      boostPads: [
        { at: 0.22, lateral: -3.2 },
        { at: 0.5, lateral: 3 },
        { at: 0.64, lateral: -2.8 },
        { at: 0.9, lateral: 3.4 },
      ],
      ramps: [{ at: 0.25 }, { at: 0.86 }],
    },
    theme: { sky: '#141a28', ground: '#2e4034', road: '#24272e', scenery: 'streetlights', ponds: 'water', weather: 'rain', night: true },
  },
];
