import './setup';
import { expect, test } from 'vitest';
import * as web from '../../rc-racer/client/src/game/trackPath';
import * as webCar from '../../rc-racer/client/src/game/carPhysics';
import * as webCol from '../../rc-racer/client/src/game/collision';
import * as port from '../src/shared/trackPath';
import * as portCar from '../src/shared/carPhysics';
import * as portCol from '../src/shared/collision';
import { gridStart, MEADOW_LOOP, trackPath } from '../src/shared/tracks';

test('the ported spline samples Meadow Loop where Three.js does', () => {
  const a = new web.TrackPath(web.DEMO_TRACK, 5.5);
  const b = trackPath(MEADOW_LOOP);
  expect(b.points.length).toBe(a.points.length);
  let worst = 0;
  a.points.forEach((p, i) => (worst = Math.max(worst, Math.hypot(p.x - b.points[i].x, p.z - b.points[i].z))));
  console.log('worst point gap', worst, 'lengths', a.length, b.length);
  expect(worst).toBeLessThan(1e-9);
});

test('a scripted lap with wall hits ends in the same place on both', () => {
  const ta = new web.TrackPath(web.DEMO_TRACK, 5.5);
  const tb = trackPath(MEADOW_LOOP);
  const s = gridStart(tb);
  const a = webCar.createCar(s.x, s.z, s.heading);
  const b = portCar.createCar(s.x, s.z, s.heading);
  let hits = 0;
  for (let i = 0; i < 120 * 30; i++) {
    const input = { throttle: 1, steer: Math.sin(i / 90), handbrake: i % 400 < 60 };
    webCar.stepCar(a, input, 1 / 120);
    portCar.stepCar(b, input, 1 / 120);
    if (webCol.collideWithWalls(a, ta, 1 / 120).hit) hits++;
    portCol.collideWithWalls(b, tb, 1 / 120);
  }
  console.log('wall hits', hits, 'end', a.x, a.z, b.x, b.z);
  expect(hits).toBeGreaterThan(0);
  expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
});
