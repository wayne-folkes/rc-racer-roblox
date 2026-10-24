import './setup';
import { expect, test, vi } from 'vitest';
import { FAR, FIRST_MAX, FIRST_MIN, GAP_MAX, GAP_MIN, MAX_CRATERS, MeteorSchedule, NEAR, RIM, ROAD_MARGIN } from '../src/client/meteors';
import { acrossWind, hopHeight, randomWind, tumbleweedGone, tumbleweedSpawn } from '../src/client/weather';
import { seededRandom } from '../src/shared/items';
import { ALL_TRACKS, trackPath } from '../src/shared/tracks';
import type { TrackPath } from '../src/shared/trackPath';

// The Parts come from itemModels, which needs Roblox's Color3 when it loads. These tests only use the
// schedule and the weather's maths, so the module is stubbed out.
vi.mock('../src/client/itemModels', () => ({ part: () => undefined, PartModel: class {} }));

const METEOR_TRACKS = ALL_TRACKS.filter((def) => def.theme.meteors === true);
/** The step the schedule is played in. */
const DT = 0.01;

/** Plays a schedule for a while on one track, aiming every due meteor at the same spot. */
function playOut(seed: number, path: TrackPath, seconds: number): number[][] {
  const schedule = new MeteorSchedule(path, seededRandom(seed));
  const focus = path.pointAt(0);
  const events: number[][] = [];
  let t = 0;
  while (t < seconds) {
    t += DT;
    if (!schedule.countdown(DT)) continue;
    const landing = schedule.aim(focus.x, focus.z);
    if (landing === undefined) {
      events.push([t]);
    } else {
      events.push([t, landing.x, landing.z, landing.radius, landing.drift]);
      schedule.settle(landing.x, landing.z, landing.radius);
    }
  }
  return events;
}

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

test('the meteor tracks are the four Space Cup tracks, both ways round', () => {
  expect(METEOR_TRACKS.map((def) => def.id).sort()).toEqual(
    ['europa', 'europa-rev', 'io', 'io-rev', 'mars', 'mars-rev', 'moon', 'moon-rev'].sort(),
  );
});

test('a seed gives the same schedule every time, and another seed a different one', () => {
  const path = trackPath(METEOR_TRACKS[0]);
  const first = playOut(7, path, 300);
  expect(first.length).toBeGreaterThan(20);
  expect(playOut(7, path, 300)).toEqual(first);
  expect(playOut(8, path, 300)).not.toEqual(first);
});

test('the first impact comes 1.5 to 4 seconds in, and then one every 4 to 9 seconds', () => {
  const path = trackPath(METEOR_TRACKS[0]);
  for (let seed = 1; seed <= 40; seed++) {
    const schedule = new MeteorSchedule(path, seededRandom(seed));
    const due: number[] = [];
    let t = 0;
    while (t < 400) {
      t += DT;
      if (schedule.countdown(DT)) due.push(t);
    }
    expect(due[0]).toBeGreaterThanOrEqual(FIRST_MIN - DT);
    expect(due[0]).toBeLessThanOrEqual(FIRST_MAX + DT);
    for (let i = 1; i < due.length; i++) {
      const gap = due[i] - due[i - 1];
      expect(gap).toBeGreaterThanOrEqual(GAP_MIN - DT);
      expect(gap).toBeLessThanOrEqual(GAP_MAX + DT);
    }
  }
});

test('every landing is clear of the road by the web margin, and 8 to 28 studs from the car, on every Space Cup track', () => {
  expect(ROAD_MARGIN).toBe(3);
  let landed = 0;
  for (const def of METEOR_TRACKS) {
    const path = trackPath(def);
    for (let seed = 1; seed <= 10; seed++) {
      const schedule = new MeteorSchedule(path, seededRandom(seed));
      for (let i = 0; i < 30; i++) {
        // Focus points spread round the whole lap, so the spots near each are tried on every stretch of track.
        const focus = path.pointAt((i / 30) * path.length);
        for (let k = 0; k < 3; k++) {
          const landing = schedule.aim(focus.x, focus.z);
          if (landing === undefined) continue;
          landed++;
          const lateral = Math.abs(path.project(landing.x, landing.z).lateral);
          const clear = path.halfWidth + ROAD_MARGIN + landing.radius * RIM;
          expect(lateral, `${def.id} seed ${seed} focus ${i}`).toBeGreaterThanOrEqual(clear);
          const reach = distance(landing.x, landing.z, focus.x, focus.z);
          expect(reach).toBeGreaterThanOrEqual(NEAR - 1e-9);
          expect(reach).toBeLessThanOrEqual(FAR + 1e-9);
          schedule.settle(landing.x, landing.z, landing.radius);
        }
      }
    }
  }
  expect(landed).toBeGreaterThan(2000);
});

test('a new crater never lands on one already there, and only the newest twelve are kept', () => {
  const path = trackPath(METEOR_TRACKS[0]);
  const focus = path.pointAt(path.length * 0.3);
  const schedule = new MeteorSchedule(path, seededRandom(9));
  const kept: Array<{ x: number; z: number; radius: number }> = [];
  let drops = 0;
  for (let i = 0; i < 60; i++) {
    const landing = schedule.aim(focus.x, focus.z);
    if (landing === undefined) continue;
    for (const c of kept) {
      expect(distance(c.x, c.z, landing.x, landing.z)).toBeGreaterThanOrEqual((c.radius + landing.radius) * RIM + 1);
    }
    kept.push({ x: landing.x, z: landing.z, radius: landing.radius });
    const overflow = kept.length > MAX_CRATERS;
    if (overflow) {
      kept.shift();
      drops++;
    }
    expect(schedule.settle(landing.x, landing.z, landing.radius)).toBe(overflow);
    expect(schedule.craterCount()).toBe(kept.length);
  }
  expect(drops).toBeGreaterThan(0);
  expect(MAX_CRATERS).toBe(12);
});

test('the wind is a unit vector, the same for the same seed, and the across-wind direction is at right angles to it', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const wind = randomWind(seededRandom(seed));
    expect(Math.hypot(wind.x, wind.z)).toBeCloseTo(1, 12);
    expect(randomWind(seededRandom(seed))).toEqual(wind);
    const across = acrossWind(wind);
    expect(wind.x * across.x + wind.z * across.z).toBeCloseTo(0, 12);
  }
});

test('a tumbleweed rolls in from upwind of the car, within 22 studs of the wind line', () => {
  const rand = seededRandom(4);
  const focusX = 10;
  const focusZ = -20;
  for (let i = 0; i < 500; i++) {
    const wind = randomWind(rand);
    const across = acrossWind(wind);
    const spot = tumbleweedSpawn(wind, focusX, focusZ, rand);
    const dx = spot.x - focusX;
    const dz = spot.z - focusZ;
    const along = dx * wind.x + dz * wind.z;
    const side = dx * across.x + dz * across.z;
    expect(along).toBeGreaterThanOrEqual(-55 - 1e-9);
    expect(along).toBeLessThanOrEqual(-45 + 1e-9);
    expect(Math.abs(side)).toBeLessThanOrEqual(22 + 1e-9);
  }
});

test('a tumbleweed is put away 60 studs downwind or 150 away, and not before', () => {
  expect(tumbleweedGone(59.9, 100)).toBe(false);
  expect(tumbleweedGone(60.1, 60.1)).toBe(true);
  expect(tumbleweedGone(0, 149)).toBe(false);
  expect(tumbleweedGone(0, 150.5)).toBe(true);
});

test('a hop lifts a tumbleweed from its radius up by at most the hop height', () => {
  for (let phase = 0; phase < 20; phase += 0.05) {
    const height = hopHeight(phase, 0.5);
    expect(height).toBeGreaterThanOrEqual(0.8 - 1e-12);
    expect(height).toBeLessThanOrEqual(1.3 + 1e-12);
  }
  expect(hopHeight(Math.PI / 2, 0.5)).toBeCloseTo(1.3, 12);
});
