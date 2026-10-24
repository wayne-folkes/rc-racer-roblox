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
