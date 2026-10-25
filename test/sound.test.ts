import './setup';
import { expect, test } from 'vitest';
import { DEFAULT_VOLUME, distanceVolume, engineNote, stepVolume } from '../src/shared/sound';

const TOP = 26;

test('the engine idles low and quiet, and climbs with speed', () => {
  const idle = engineNote(0, 0, TOP);
  const cruising = engineNote(TOP * 0.4, 1, TOP);
  expect(idle.pitch).toBeCloseTo(0.8);
  expect(cruising.pitch).toBeGreaterThan(idle.pitch);
  expect(cruising.volume).toBeGreaterThan(idle.volume);
});

test('the pitch dips at the gear change, then climbs again', () => {
  const before = engineNote(TOP * 0.49, 1, TOP).pitch;
  const after = engineNote(TOP * 0.51, 1, TOP).pitch;
  expect(after).toBeLessThan(before);
  expect(engineNote(TOP, 1, TOP).pitch).toBeGreaterThan(after);
  // As on the web, second gear only passes first gear's peak when boosting past top speed.
  expect(engineNote(TOP * 1.4, 1, TOP).pitch).toBeGreaterThan(before);
});

test('throttle raises the note a little and makes it louder', () => {
  const coasting = engineNote(TOP * 0.3, 0, TOP);
  const pressing = engineNote(TOP * 0.3, 1, TOP);
  expect(pressing.pitch).toBeGreaterThan(coasting.pitch);
  expect(pressing.volume).toBeGreaterThan(coasting.volume);
});

test('reversing sounds like going forward, and a boost is capped', () => {
  expect(engineNote(-10, 0, TOP)).toEqual(engineNote(10, 0, TOP));
  expect(engineNote(TOP * 3, 1, TOP)).toEqual(engineNote(TOP * 1.4, 1, TOP));
  // Full throttle at top speed is the loudest the engine gets.
  expect(engineNote(TOP, 1, TOP).volume).toBeCloseTo(1);
});

test('distant things are quieter but never silent', () => {
  expect(distanceVolume(0)).toBe(1);
  expect(distanceVolume(30)).toBeCloseTo(0.5);
  expect(distanceVolume(500)).toBe(0.15);
});

test('volume steps in tenths between silent and full', () => {
  expect(stepVolume(DEFAULT_VOLUME, 1)).toBeCloseTo(0.9);
  expect(stepVolume(DEFAULT_VOLUME, -1)).toBeCloseTo(0.7);
  expect(stepVolume(1, 1)).toBe(1);
  expect(stepVolume(0, -1)).toBe(0);
  // Ten steps down from full lands exactly on silent.
  let v = 1;
  for (let i = 0; i < 10; i++) v = stepVolume(v, -1);
  expect(v).toBe(0);
});
