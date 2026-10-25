import './setup';
import { expect, test, vi } from 'vitest';
import {
  CRACK_CLEARANCE,
  POND_CLEARANCE,
  POND_SPACING,
  planScenery,
  SCATTER_REACH,
  SCENERY_CLEARANCE,
  type SceneryObject,
} from '../src/client/scenery';
import type { TrackPath } from '../src/shared/trackPath';
import { ALL_TRACKS, trackPath, type Scenery, type TrackDef } from '../src/shared/tracks';

// itemModels makes Color3s and CFrames when it loads, which only Roblox has. The plan never builds Parts,
// so the mock is never called.
vi.mock('../src/client/itemModels', () => ({ part: () => undefined, blob: () => undefined }));

/** The web's counts per theme: each entry is the kinds one scatter places, and the most it places. */
const WEB_CAPS: Record<Scenery, [string[], number][]> = {
  trees: [[['tree'], 140]],
  cacti: [[['cactus', 'rock'], 120]],
  pines: [[['pine'], 120]],
  craters: [
    [['crater'], 80],
    [['boulder', 'flag'], 90],
  ],
  mesas: [
    [['mesa'], 26],
    [['boulder'], 100],
  ],
  volcanoes: [
    [['volcano'], 20],
    [['spikes'], 70],
  ],
  ice: [
    [['spires'], 60],
    [['crack'], 88],
  ],
  toys: [
    [['block'], 140],
    [['books'], 24],
    [['toyBall'], 24],
  ],
  pantry: [
    [['cereal'], 40],
    [['tin'], 90],
    [['fruit'], 50],
  ],
  sandcastles: [
    [['castle'], 20],
    [['bucket'], 50],
    [['spade'], 40],
  ],
  workshop: [
    [['tyres'], 50],
    [['paint'], 70],
    [['toolbox'], 20],
  ],
  skyscrapers: [
    [['tower'], 50],
    [['billboard'], 24],
  ],
  rooftop: [
    [['airCon'], 80],
    [['tank'], 20],
    [['aerial'], 36],
  ],
  containers: [
    [['container'], 44],
    [['crate', 'bollard'], 70],
    [['lamp'], 24],
  ],
  streetlights: [
    [['streetLight'], 60],
    [['sign'], 14],
    [['bush'], 110],
  ],
};

const plans = ALL_TRACKS.map((def: TrackDef) => {
  const track = trackPath(def);
  return { def, track, objects: planScenery(track, def.theme) };
});

const lateral = (track: TrackPath, x: number, z: number) => Math.abs(track.project(x, z).lateral);

test('each track plans the same scenery every time', () => {
  for (const { def, track, objects } of plans) {
    expect(planScenery(track, def.theme), def.id).toEqual(objects);
  }
});

test('scattered scenery keeps clear of the road, by its reach', () => {
  for (const { def, track, objects } of plans) {
    const hw = track.halfWidth;
    for (const o of objects) {
      if (o.kind === 'crack') {
        // Both ends and the middle of each segment must clear the kerb (0.9 wide, CURB_WIDTH in scenery.ts).
        const half = o.length / 2;
        const along = [
          [o.x, o.z],
          [o.x + half * Math.cos(o.rotation), o.z - half * Math.sin(o.rotation)],
          [o.x - half * Math.cos(o.rotation), o.z + half * Math.sin(o.rotation)],
        ];
        for (const [x, z] of along) {
          expect(lateral(track, x, z), def.id).toBeGreaterThan(hw + 0.9 + CRACK_CLEARANCE);
        }
      } else if (o.kind === 'pond') {
        expect(lateral(track, o.x, o.z), def.id).toBeGreaterThanOrEqual(hw + POND_CLEARANCE + o.radius);
      } else {
        const reach = SCATTER_REACH[o.kind] ?? 0;
        expect(lateral(track, o.x, o.z), def.id).toBeGreaterThanOrEqual(hw + SCENERY_CLEARANCE + reach);
      }
    }
  }
});

test('scenery starts within the track box, grown by the margin', () => {
  for (const { def, track, objects } of plans) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of track.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    // A crack's start is scattered in the box, but the crack then wanders on for up to four segments, as the web's does.
    for (const o of objects.filter((object) => object.kind !== 'crack')) {
      expect(o.x, def.id).toBeGreaterThanOrEqual(minX - 30);
      expect(o.x, def.id).toBeLessThanOrEqual(maxX + 30);
      expect(o.z, def.id).toBeGreaterThanOrEqual(minZ - 30);
      expect(o.z, def.id).toBeLessThanOrEqual(maxZ + 30);
    }
  }
});

test('no theme places more of an object than the web does', () => {
  for (const { def, objects } of plans) {
    for (const [kinds, cap] of WEB_CAPS[def.theme.scenery]) {
      const placed = objects.filter((o) => kinds.includes(o.kind)).length;
      expect(placed, `${def.id} ${kinds.join('+')}`).toBeLessThanOrEqual(cap);
    }
  }
});

test('scatters fill most of their counts', () => {
  for (const { def, objects } of plans) {
    for (const [kinds, cap] of WEB_CAPS[def.theme.scenery]) {
      const placed = objects.filter((o) => kinds.includes(o.kind)).length;
      expect(placed, `${def.id} ${kinds.join('+')}`).toBeGreaterThan(cap * 0.5);
    }
  }
});

test('craters keep their footprints apart, so they never overlap', () => {
  for (const { def, objects } of plans) {
    const craters = objects.filter((o): o is Extract<SceneryObject, { kind: 'crater' }> => o.kind === 'crater');
    for (let i = 0; i < craters.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = craters[i];
        const b = craters[j];
        const gap = Math.hypot(a.x - b.x, a.z - b.z);
        expect(gap, def.id).toBeGreaterThanOrEqual(a.footprint + b.footprint + 0.5);
      }
    }
  }
});

test('ponds only appear on themes that have them, and keep their clearance and spacing', () => {
  for (const { def, track, objects } of plans) {
    const ponds = objects.filter((o): o is Extract<SceneryObject, { kind: 'pond' }> => o.kind === 'pond');
    if (def.theme.ponds === undefined) {
      expect(ponds.length, def.id).toBe(0);
      continue;
    }
    expect(ponds.length, def.id).toBeLessThanOrEqual(6);
    for (const pond of ponds) {
      expect(pond.style, def.id).toBe(def.theme.ponds);
      expect(pond.jitter.length, def.id).toBe(12);
    }
    for (let i = 0; i < ponds.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(Math.hypot(ponds[i].x - ponds[j].x, ponds[i].z - ponds[j].z), def.id).toBeGreaterThanOrEqual(POND_SPACING);
      }
    }
  }
});
