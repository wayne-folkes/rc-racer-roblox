import './setup';
import { afterAll, expect, test } from 'vitest';
import * as web from '../../rc-racer/client/src/game/tracks';
import * as webTrackPath from '../../rc-racer/client/src/game/trackPath';
import * as port from '../src/shared/tracks';
import * as portTrackPath from '../src/shared/trackPath';

// The ported track list against the web game's. Every track is compared both ways round (ALL_TRACKS holds
// the eight tracks forwards and reversed), and the spline each track is driven on is compared point by point.

/** Numbers in a layout or theme may differ by this much; everything else must match exactly. */
const LAYOUT_TOL = 1e-12;
/** The ported spline may differ from Three.js's by this much, per point and in length. */
const SPLINE_TOL = 1e-9;

/** The largest gaps seen, reported once at the end. */
const worst = { layout: 0, spline: 0 };

afterAll(() => {
  console.log('tracks parity: worst layout gap', worst.layout, 'worst spline gap', worst.spline);
});

/**
 * Deep-compares an expected value with an actual one: numbers to within LAYOUT_TOL, everything else exactly.
 * An object key that is undefined on both sides counts as absent, as it does in the layouts. Returns the
 * largest number gap it saw.
 */
function deepClose(actual: unknown, expected: unknown, path: string): number {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    const gap = Math.abs((actual as number) - expected);
    expect(gap, path).toBeLessThan(LAYOUT_TOL);
    return gap;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const items = actual as unknown[];
    expect(items.length, `${path}.length`).toBe(expected.length);
    let gap = 0;
    expected.forEach((item, i) => {
      gap = Math.max(gap, deepClose(items[i], item, `${path}[${i}]`));
    });
    return gap;
  }
  if (expected !== null && typeof expected === 'object') {
    const have = (actual ?? {}) as Record<string, unknown>;
    const want = expected as Record<string, unknown>;
    let gap = 0;
    for (const key of new Set([...Object.keys(have), ...Object.keys(want)])) {
      if (want[key] === undefined && have[key] === undefined) continue;
      gap = Math.max(gap, deepClose(have[key], want[key], `${path}.${key}`));
    }
    return gap;
  }
  expect(actual, path).toBe(expected);
  return 0;
}

test('ALL_TRACKS lists the same tracks as the web, in the same order', () => {
  expect(web.ALL_TRACKS.length).toBe(16);
  expect(port.ALL_TRACKS.map((t) => t.id)).toEqual(web.ALL_TRACKS.map((t) => t.id));
});

test('every track id in ALL_TRACKS is unique', () => {
  const ids = port.ALL_TRACKS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
});

web.ALL_TRACKS.forEach((w, i) => {
  const p = port.ALL_TRACKS[i];

  test(`${w.id}: metadata, theme and control points match the web`, () => {
    expect(p.id).toBe(w.id);
    expect(p.name).toBe(w.name);
    expect(p.halfWidth).toBe(w.halfWidth);
    expect(p.reversed).toBe(w.reversed);
    expect(p.theme).toEqual(w.theme);
    deepClose(p.controlPoints, w.controlPoints, `${w.id}.controlPoints`);
  });

  test(`${w.id}: layout matches the web (hazards, hazard zones, pickups, boost pads, ramps)`, () => {
    const gap = deepClose(p.layout, w.layout, `${w.id}.layout`);
    worst.layout = Math.max(worst.layout, gap);
  });

  test(`${w.id}: the spline and its length match the web's TrackPath`, () => {
    const a = new webTrackPath.TrackPath(w.controlPoints, w.halfWidth);
    const b = new portTrackPath.TrackPath(p.controlPoints, p.halfWidth);
    expect(b.points.length).toBe(a.points.length);
    let gap = Math.abs(b.length - a.length);
    a.points.forEach((pt, j) => {
      gap = Math.max(gap, Math.abs(pt.x - b.points[j].x), Math.abs(pt.z - b.points[j].z));
    });
    worst.spline = Math.max(worst.spline, gap);
    expect(gap).toBeLessThan(SPLINE_TOL);
  });
});

test('the classic and space cups list the same names, blurbs and tracks as the web', () => {
  expect(port.CIRCUIT_IDS).toEqual(web.CIRCUIT_IDS);
  expect(port.DEFAULT_CIRCUIT).toBe(web.DEFAULT_CIRCUIT);
  for (const id of web.CIRCUIT_IDS) {
    const wc = web.CIRCUITS[id];
    const pc = port.CIRCUITS[id];
    expect(pc.name).toBe(wc.name);
    expect(pc.blurb).toBe(wc.blurb);
    expect(pc.tracks.map((t) => t.id)).toEqual(wc.tracks.map((t) => t.id));
    expect(port.circuitTracks(id, false).map((t) => t.id)).toEqual(web.circuitTracks(id, false).map((t) => t.id));
    expect(port.circuitTracks(id, true).map((t) => t.id)).toEqual(web.circuitTracks(id, true).map((t) => t.id));
    expect(port.circuitTracks(id, true).map((t) => t.id)).toEqual(pc.tracks.map((t) => `${t.id}-rev`));
  }
});

test('isCircuitId accepts the two cups and nothing else, as the web does', () => {
  const values: unknown[] = ['classic', 'space', 'desert', '', 'Classic', 1, undefined, null, {}];
  for (const v of values) expect(port.isCircuitId(v)).toBe(web.isCircuitId(v));
  expect(port.isCircuitId('classic')).toBe(true);
  expect(port.isCircuitId('space')).toBe(true);
  expect(port.isCircuitId('desert')).toBe(false);
});

test('trackById finds every track in ALL_TRACKS and returns undefined for an unknown id', () => {
  for (const t of port.ALL_TRACKS) expect(port.trackById(t.id)).toBe(t);
  expect(port.trackById('demo-rev')?.reversed).toBe(true);
  expect(port.trackById('nope')).toBeUndefined();
  expect(port.trackById('')).toBeUndefined();
});

test('MEADOW_LOOP is the first classic track, and ROAD_TOP is unchanged', () => {
  expect(port.MEADOW_LOOP).toBe(port.TRACKS[0]);
  expect(port.MEADOW_LOOP.name).toBe('Meadow Loop');
  expect(port.ROAD_TOP).toBe(0.05);
});

test('gridStart puts the car on the centreline 8 m behind the line, facing along the track', () => {
  const a = new webTrackPath.TrackPath(web.TRACKS[0].controlPoints, web.TRACKS[0].halfWidth);
  const s = port.gridStart(port.trackPath(port.MEADOW_LOOP));
  const p = a.pointAt(-8);
  expect(Math.abs(s.x - p.x)).toBeLessThan(SPLINE_TOL);
  expect(Math.abs(s.z - p.z)).toBeLessThan(SPLINE_TOL);
  expect(Math.abs(s.heading - Math.atan2(p.tz, p.tx))).toBeLessThan(SPLINE_TOL);
});
