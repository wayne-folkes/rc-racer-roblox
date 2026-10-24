import './setup';
import { expect, test } from 'vitest';
import { AiDriver } from '../src/shared/aiDriver';
import { DEFAULT_TUNING, stepCar } from '../src/shared/carPhysics';
import { collideCars, collideWithWalls } from '../src/shared/collision';
import type { ItemEvent } from '../src/shared/items';
import { NOT_FINISHED } from '../src/shared/race';
import { RaceSim } from '../src/shared/raceSim';
import { MEADOW_LOOP, trackPath } from '../src/shared/tracks';

const STEP = 1 / 120;
const track = trackPath(MEADOW_LOOP);

/** Runs a race where each player's "device" drives its car with an autopilot and reports at 20 Hz. */
function run(players: number, seconds: number, onStep?: (sim: RaceSim, t: number) => void) {
  const sim = new RaceSim(
    track,
    Array.from({ length: players }, (_, n) => ({ name: `P${n}`, userId: 100 + n })),
  );
  const devices = sim.racers
    .map((r, i) => ({ i, r }))
    .filter(({ r }) => r.userId !== 0)
    .map(({ i, r }) => ({
      i,
      car: { ...r.car },
      driver: new AiDriver(track, sim.line, { pace: 0.85, steerGain: 2.4 }, DEFAULT_TUNING),
    }));
  let sinceReport = 0;
  for (let t = 0; t < seconds; t += STEP) {
    // Each device steps its own car, bumping into everyone else where the server last said they were.
    for (const d of devices) {
      if (sim.racers[d.i].userId === 0) continue;
      if (!sim.race.controlsLocked()) {
        const others = sim.racers.filter((_, j) => j !== d.i).map((r) => r.car);
        const decision = d.driver.drive(d.car, track.project(d.car.x, d.car.z), others, 1, STEP);
        const done = sim.race.finishTimes[d.i] !== NOT_FINISHED;
        stepCar(d.car, done ? { throttle: 0, steer: 0, handbrake: false } : decision.input, STEP, d.driver.tuning);
        for (const o of others) collideCars(d.car, { ...o });
        collideWithWalls(d.car, track, STEP);
      }
    }
    sinceReport += STEP;
    if (sinceReport >= 1 / 20) {
      sinceReport = 0;
      for (const d of devices) if (sim.racers[d.i].userId !== 0) sim.reportCar(d.i, d.car);
    }
    sim.step(STEP);
    onStep?.(sim, t);
  }
  return sim;
}

test('a full race: one player at the back, five AI cars, everyone finishes', () => {
  const sim = run(1, 150);
  expect(sim.racers.map((r) => [r.name, r.gridSlot])).toEqual([
    ['Blue', 0], ['Purple', 1], ['Yellow', 2], ['Orange', 3], ['Green', 4], ['P0', 5],
  ]);
  const times = sim.race.finishTimes;
  console.log('finish times', times.map((t, i) => `${sim.racers[i].name} ${t.toFixed(2)}`).join(', '));
  console.log('standings', sim.race.standings().map((i) => sim.racers[i].name).join(' > '));
  expect(times.every((t) => t !== NOT_FINISHED)).toBe(true);
  expect(sim.playersFinished()).toBe(true);
  expect(sim.firstPlayerFinish()).toBe(times[5]);
  // Standings follow finish times.
  const order = sim.race.standings();
  for (let k = 1; k < order.length; k++) expect(times[order[k]]).toBeGreaterThanOrEqual(times[order[k - 1]]);
});

/** A car `lateral` to the right of the centreline at `distance`, heading along the track at `speed`. */
function onTrack(distance: number, lateral: number, speed: number) {
  const p = track.pointAt(distance);
  return {
    x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tz, p.tx),
    steer: 0, vx: p.tx * speed, vz: p.tz * speed, y: 0,
  };
}

/** The distance along the track where it bends most sharply over 10 m. */
function sharpestBend() {
  let best = 0;
  let bestTurn = 0;
  for (let d = 0; d < track.length; d += 1) {
    const a = track.pointAt(d);
    const b = track.pointAt(d + 10);
    const turn = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
    if (turn > bestTurn) [best, bestTurn] = [d, turn];
  }
  return best;
}

test("a player's report is carried on round the track for the time it took to reach the server", () => {
  const sim = run(1, 0);
  const d = sharpestBend();
  sim.reportCar(5, onTrack(d, 1, 20));
  expect(track.project(sim.racers[5].car.x, sim.racers[5].car.z).distance).toBeCloseTo(d, 6);
  // Sent 0.15 s ago: 3 m further round, still 1 m right of the centreline, facing along the road.
  sim.reportCar(5, onTrack(d, 1, 20), 0.15);
  const car = sim.racers[5].car;
  const proj = track.project(car.x, car.z);
  expect(proj.distance).toBeCloseTo(d + 3, 1);
  expect(proj.lateral).toBeCloseTo(1, 1);
  expect(Math.cos(car.heading - Math.atan2(proj.tz, proj.tx))).toBeGreaterThan(0.999);
  expect(Math.hypot(car.vx, car.vz)).toBeCloseTo(20, 10);
});

test("a player's car goes round a bend between reports instead of into the wall", () => {
  const sim = run(1, 0);
  const d = sharpestBend();
  sim.reportCar(5, onTrack(d, 0, 20));
  // Nothing more for 0.7 s, the longest wait seen on a phone over wifi.
  for (let t = 0; t < 0.7; t += STEP) sim.step(STEP);
  const proj = track.project(sim.racers[5].car.x, sim.racers[5].car.z);
  expect(proj.distance).toBeCloseTo(d + 14, 0);
  expect(Math.abs(proj.lateral)).toBeLessThan(0.1);
  // In a straight line, it would have left the road.
  const p = track.pointAt(d);
  expect(Math.abs(track.project(p.x + p.tx * 14, p.z + p.tz * 14).lateral)).toBeGreaterThan(track.halfWidth);
});

test('a carried car keeps to the road when it was sliding towards a wall', () => {
  const sim = run(1, 0);
  const car = onTrack(sharpestBend(), 0, 0);
  sim.reportCar(5, { ...car, vx: car.vx - 10 * Math.sin(car.heading), vz: car.vz + 10 * Math.cos(car.heading) }, 1);
  expect(Math.abs(track.project(sim.racers[5].car.x, sim.racers[5].car.z).lateral)).toBeCloseTo(track.halfWidth, 6);
});

test('three players fill the back of the grid in join order', () => {
  const sim = run(3, 0);
  expect(sim.racers.map((r) => r.name)).toEqual(['Blue', 'Purple', 'Yellow', 'P2', 'P1', 'P0']);
  expect(sim.indexOf(100)).toBe(5);
  expect(sim.indexOf(999)).toBe(-1);
});

test('a player who leaves mid-race is driven home by an AI', () => {
  let left = false;
  const sim = run(2, 150, (s, t) => {
    if (!left && t > 30) {
      s.standIn(s.indexOf(101));
      left = true;
    }
  });
  const standIn = sim.racers.find((r) => r.name === 'P1 (AI)')!;
  expect(standIn.userId).toBe(0);
  expect(sim.race.finishTimes.every((t) => t !== NOT_FINISHED)).toBe(true);
});

test('items in a multiplayer race: pickups, missiles and bombs, players included', () => {
  const events: ItemEvent[] = [];
  let playerItems = 0;
  let playerFired = 0;
  // Two players; whenever one holds an item, it fires it a second later.
  const held = new Map<number, number>();
  const sim = run(2, 150, (s, t) => {
    for (const e of s.drainEvents()) events.push(e);
    for (const i of [s.indexOf(100), s.indexOf(101)]) {
      if (s.items.status[i].item === undefined) {
        held.delete(i);
        continue;
      }
      if (!held.has(i)) {
        held.set(i, t);
        playerItems++;
      } else if (t - held.get(i)! > 1) {
        s.useItem(i);
        held.delete(i);
        playerFired++;
      }
    }
  });
  const players = new Set([sim.indexOf(100), sim.indexOf(101)]);
  const count = (f: (e: ItemEvent) => boolean) => events.filter(f).length;
  const summary = {
    pickups: count((e) => e.type === 'pickup'),
    playerPickups: count((e) => e.type === 'pickup' && players.has(e.racer)),
    fires: count((e) => e.type === 'fire'),
    drops: count((e) => e.type === 'drop'),
    hits: count((e) => e.type === 'explode' && e.victim !== undefined),
    playerHits: count((e) => e.type === 'explode' && e.victim !== undefined && players.has(e.victim)),
    playerUses: count((e) => (e.type === 'fire' || e.type === 'drop') && players.has(e.racer)),
    boosts: count((e) => e.type === 'boost'),
  };
  console.log('item events', JSON.stringify(summary), 'player items', playerItems, 'fired', playerFired);
  expect(summary.pickups).toBeGreaterThan(0);
  expect(summary.playerPickups).toBeGreaterThan(0);
  expect(summary.fires).toBeGreaterThan(0);
  expect(summary.drops).toBeGreaterThan(0);
  expect(summary.hits).toBeGreaterThan(0);
  // Every fire request from a player holding an item becomes a fire or a drop (or is lost to a spin).
  expect(summary.playerUses).toBeGreaterThan(0);
  expect(summary.playerUses).toBeLessThanOrEqual(playerFired);
  expect(sim.race.finishTimes.every((t) => t !== NOT_FINISHED)).toBe(true);
});

test('using an item with nothing held does nothing', () => {
  const sim = run(1, 4);
  sim.drainEvents();
  sim.useItem(sim.indexOf(100));
  sim.step(1 / 120);
  expect(sim.drainEvents().filter((e) => e.type === 'fire' || e.type === 'drop')).toEqual([]);
});
