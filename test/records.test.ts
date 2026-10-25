import './setup';
import { expect, test } from 'vitest';
import type { RecordRow } from '../src/shared/protocol';
import { fastestPossible, placeInTop, recordKey, toMs, withBest } from '../src/shared/records';

const row = (userId: number, time: number): RecordRow => ({ name: `P${userId}`, userId, time });

test('the buggy keeps the plain track id, and other vehicles get their own key', () => {
  expect(recordKey('meadow', 'buggy')).toBe('meadow');
  expect(recordKey('meadow', 'truck')).toBe('truck_meadow');
  expect(recordKey('meadow-rev', 'truck')).toBe('truck_meadow-rev');
});

test('a best is kept per track and direction, and only replaced by a faster time', () => {
  let bests = withBest(undefined, 'demo', 'lap', 24_100);
  bests = withBest(bests, 'demo', 'race', 75_000);
  bests = withBest(bests, 'demo', 'lap', 25_000);
  bests = withBest(bests, 'demo-rev', 'lap', 30_000);
  expect(bests).toEqual({ demo: { lap: 24_100, race: 75_000 }, 'demo-rev': { lap: 30_000 } });
  expect(withBest(bests, 'demo', 'lap', 23_900).demo).toEqual({ lap: 23_900, race: 75_000 });
});

test('times are whole milliseconds', () => {
  expect(toMs(23.4567)).toBe(23_457);
  expect(toMs(75)).toBe(75_000);
});

test('the quickest possible race is every lap at top speed', () => {
  expect(fastestPossible(500, 3, 40)).toBeCloseTo(37.5, 12);
  expect(fastestPossible(500, 1, 40)).toBeCloseTo(12.5, 12);
});

test('the top 10 keeps one line per player, fastest first, cut at 10', () => {
  let top: RecordRow[] = [];
  for (let n = 0; n < 12; n++) top = placeInTop(top, row(n, 30 + n));
  expect(top.map((r) => r.userId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Player 5 improves to second; their old line goes.
  top = placeInTop(top, row(5, 30.5));
  expect(top.map((r) => r.userId)).toEqual([0, 5, 1, 2, 3, 4, 6, 7, 8, 9]);
  // A slower time than their best changes nothing.
  expect(placeInTop(top, row(5, 31))).toBe(top);
  // Too slow for the top 10.
  expect(placeInTop(top, row(20, 50)).map((r) => r.userId)).not.toContain(20);
  // A tie goes behind whoever set the time first.
  expect(placeInTop(top, row(21, 30.5)).map((r) => r.userId).slice(0, 3)).toEqual([0, 5, 21]);
});
