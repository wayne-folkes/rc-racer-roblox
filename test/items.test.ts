import './setup';
import { expect, test } from 'vitest';
import * as web from '../../rc-racer/client/src/game/trackPath';
import * as webCar from '../../rc-racer/client/src/game/carPhysics';
import * as webCol from '../../rc-racer/client/src/game/collision';
import * as webLine from '../../rc-racer/client/src/game/racingLine';
import * as webAi from '../../rc-racer/client/src/game/aiDriver';
import * as webRace from '../../rc-racer/client/src/game/race';
import * as webRacers from '../../rc-racer/client/src/game/racers';
import * as webItems from '../../rc-racer/client/src/game/items';
import * as webJumps from '../../rc-racer/client/src/game/jumps';
import type { AiSkill } from '../../rc-racer/client/src/game/aiDriver';
import * as portCar from '../src/shared/carPhysics';
import * as portCol from '../src/shared/collision';
import * as portLine from '../src/shared/racingLine';
import * as portAi from '../src/shared/aiDriver';
import * as portRace from '../src/shared/race';
import * as portItems from '../src/shared/items';
import * as portJumps from '../src/shared/jumps';
import { Math as PortMath } from '../src/shared/jsMath';
import { MEADOW_LOOP, trackPath } from '../src/shared/tracks';

// Both sides of each check are driven through the same code, given either the web or the ported modules.
// The web modules use JavaScript's Math directly; the ports use the jsMath shim (Math.imul is checked against JS).

const DT = 1 / 120;
const SEED = 7;
const RACE_STEPS = 60 * 120;
/** A held item is used every 2 s of racing. */
const USE_EVERY = 2 * 120;
const CAR_KEYS = ['x', 'z', 'heading', 'vx', 'vz', 'y', 'vy'] as const;

/** The web and port modules, as the scripted race needs them. Typed loosely: both sides share the shape. */
interface Side {
  track: any;
  layout: any;
  boostPadRadius: number;
  ItemSystem: new (track: any, racerCount: number, layout: any, seed: number) => any;
  AiDriver: new (track: any, line: any, skill: AiSkill) => any;
  buildRacingLine: (track: any) => any;
  buildRamps: (track: any, specs: any[]) => any[];
  airTuning: (base: any) => any;
  updateHeight: (car: any, proj: any, ramps: any[], trackLength: number, dt: number) => string | null | undefined;
  stepCar: (car: any, input: any, dt: number, tuning: any) => void;
  collideCars: (a: any, b: any) => boolean;
  collideWithWalls: (car: any, track: any, dt: number) => { proj: any; hit: boolean };
  Race: new (trackLength: number, racerCount: number) => any;
}

const webSide = (track: any): Side => ({
  track,
  layout: webItems.DEMO_LAYOUT,
  boostPadRadius: webItems.BOOST_PAD_RADIUS,
  ItemSystem: webItems.ItemSystem,
  AiDriver: webAi.AiDriver,
  buildRacingLine: webLine.buildRacingLine,
  buildRamps: webJumps.buildRamps,
  airTuning: webJumps.airTuning,
  updateHeight: webJumps.updateHeight,
  stepCar: webCar.stepCar,
  collideCars: webCol.collideCars,
  collideWithWalls: webCol.collideWithWalls,
  Race: webRace.Race,
});

const portSide = (track: any): Side => ({
  track,
  layout: portItems.DEMO_LAYOUT,
  boostPadRadius: portItems.BOOST_PAD_RADIUS,
  ItemSystem: portItems.ItemSystem,
  AiDriver: portAi.AiDriver,
  buildRacingLine: portLine.buildRacingLine,
  buildRamps: portJumps.buildRamps,
  airTuning: portJumps.airTuning,
  updateHeight: portJumps.updateHeight,
  stepCar: portCar.stepCar,
  collideCars: portCol.collideCars,
  collideWithWalls: portCol.collideWithWalls,
  Race: portRace.Race,
});

/** A track position as the obstacle lists the AI uses: distance along the track, offset, radius. */
function onTrack(track: any, x: number, z: number, radius: number) {
  const { distance, lateral } = track.project(x, z);
  return { distance, lateral, radius };
}

interface ItemRace {
  cars: any[];
  items: any;
  /** Every item event in order. */
  events: any[];
  /** Every jump and landing in order. */
  jumps: { type: string; racer: number; x: number; z: number }[];
  countdownSteps: number;
}

/**
 * A scripted race: four AI cars on the grid, a 3 s countdown with the cars held still, then 60 s of
 * racing. Each step drives, steps, collides and wall-checks the cars, then updates heights, runs the
 * item system, and every 2 s has each car that holds an item use it. Seed 7 for the item dice.
 */
function runItemRace(side: Side, grid: any[], skills: AiSkill[]): ItemRace {
  const track = side.track;
  const line = side.buildRacingLine(track);
  const drivers = skills.map((skill) => new side.AiDriver(track, line, skill));
  const cars = grid.map((c) => ({ ...c }));
  const items = new side.ItemSystem(track, cars.length, side.layout, SEED);
  const ramps = side.buildRamps(track, side.layout.ramps);
  const race = new side.Race(track.length, cars.length);

  // The countdown: cars held still until the race reports GO.
  let countdownSteps = 0;
  while (race.phase === 'countdown') {
    race.update(
      DT,
      cars.map((c) => track.project(c.x, c.z).distance),
    );
    countdownSteps++;
  }

  // Hazards and boost pads never move, so they are projected once; bombs are projected each step.
  const hazardObstacles = items.hazards.map((h: any) => onTrack(track, h.x, h.z, h.radius));
  const padTargets = items.boostPads.map((p: any) => onTrack(track, p.x, p.z, side.boostPadRadius));

  const events: any[] = [];
  const jumps: ItemRace['jumps'] = [];
  for (let step = 1; step <= RACE_STEPS; step++) {
    const obstacles = hazardObstacles.concat(items.bombs.map((b: any) => onTrack(track, b.x, b.z, 1.2)));
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const others = cars.filter((_, j) => j !== i);
      const decision = drivers[i].drive(car, track.project(car.x, car.z), others, 1, DT, obstacles, padTargets);
      const tuning = drivers[i].tuning;
      side.stepCar(car, decision.input, DT, car.airborne ? side.airTuning(tuning) : tuning);
    }
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) side.collideCars(cars[i], cars[j]);
    }
    const projs = cars.map((car) => side.collideWithWalls(car, track, DT).proj);
    cars.forEach((car, i) => {
      const jump = side.updateHeight(car, projs[i], ramps, track.length, DT);
      if (jump) jumps.push({ type: jump, racer: i, x: car.x, z: car.z });
    });
    items.update(DT, cars, projs);
    if (step % USE_EVERY === 0) {
      cars.forEach((car, i) => {
        if (items.status[i].item) items.use(i, car, projs[i], projs);
      });
    }
    for (const e of items.drainEvents()) events.push(e);
  }
  return { cars, items, events, jumps, countdownSteps };
}

let cachedRaces: { web: ItemRace; port: ItemRace } | undefined;

/** The scripted race on both sides, run once and shared by the tests that look at it. */
function races() {
  if (!cachedRaces) {
    const webTrack = new web.TrackPath(web.DEMO_TRACK, 5.5);
    const portTrack = trackPath(MEADOW_LOOP);
    const slots = [0, 1, 2, 3];
    const grid = slots.map((slot) => webRacers.gridPosition(webTrack, slot));
    // Slots 0-2 use the web opponents' skills; slot 3 (the player's slot on the web) gets the spare skill.
    const skills: AiSkill[] = slots.map(
      (slot) => webRacers.OPPONENTS.find((o) => o.gridSlot === slot)?.skill ?? { pace: 0.85, steerGain: 2.4 },
    );
    cachedRaces = {
      web: runItemRace(webSide(webTrack), grid, skills),
      port: runItemRace(portSide(portTrack), grid, skills),
    };
  }
  return cachedRaces;
}

test('seededRandom gives the web generator\'s first 1000 outputs for four seeds', () => {
  for (const seed of [1, 42, 0x68a3f1 ^ 7, 2 ** 31 - 5]) {
    const a = webItems.seededRandom(seed);
    const b = portItems.seededRandom(seed);
    const webOut: number[] = [];
    const portOut: number[] = [];
    for (let i = 0; i < 1000; i++) {
      webOut.push(a());
      portOut.push(b());
    }
    expect(portOut, `seed ${seed}`).toEqual(webOut);
  }
});

test('Math.imul in jsMath agrees with JavaScript Math.imul mod 2^32', () => {
  const edge = [0, 1, -1, 2, 0xffff, 0x10000, 0x7fffffff, 0x80000000, 0xffffffff, -0x80000000, 0x6d2b79f5, 0x68a3f1];
  const pairs: [number, number][] = [];
  for (const a of edge) for (const b of edge) pairs.push([a, b]);
  // Plus pseudo-random 32-bit pairs from the web generator, so the test is repeatable.
  const r = webItems.seededRandom(99);
  for (let i = 0; i < 20000; i++) pairs.push([Math.floor(r() * 4294967296), Math.floor(r() * 4294967296)]);
  const bad = pairs.filter(([a, b]) => PortMath.imul(a, b) !== Math.imul(a, b) >>> 0);
  expect(bad.slice(0, 5)).toEqual([]);
  expect(pairs.length).toBeGreaterThan(20000);
});

test('ItemSystem on Meadow Loop has the same hazards, pickups and boost pads as the web for seeds 1-20', () => {
  const webTrack = new web.TrackPath(web.DEMO_TRACK, 5.5);
  const portTrack = trackPath(MEADOW_LOOP);
  let worst = 0;
  const gap = (x: number, y: number) => Math.abs(x - y);
  for (let seed = 1; seed <= 20; seed++) {
    const a = new webItems.ItemSystem(webTrack, 4, webItems.DEMO_LAYOUT, seed);
    const b = new portItems.ItemSystem(portTrack, 4, portItems.DEMO_LAYOUT, seed);
    expect(a.hazards.length).toBe(4);
    expect(b.hazards.length, `seed ${seed} hazards`).toBe(a.hazards.length);
    expect(b.pickups.length).toBe(a.pickups.length);
    expect(b.boostPads.length).toBe(a.boostPads.length);
    a.hazards.forEach((h: any, i: number) => {
      const q = b.hazards[i];
      expect(q.kind).toBe(h.kind);
      worst = Math.max(worst, gap(h.x, q.x), gap(h.z, q.z), gap(h.radius, q.radius));
    });
    a.pickups.forEach((p: any, i: number) => {
      const q = b.pickups[i];
      expect(q.id).toBe(p.id);
      expect(q.kind).toBe(p.kind);
      expect(q.respawn).toBe(p.respawn);
      worst = Math.max(worst, gap(p.x, q.x), gap(p.z, q.z));
    });
    a.boostPads.forEach((p: any, i: number) => {
      const q = b.boostPads[i];
      worst = Math.max(worst, gap(p.x, q.x), gap(p.z, q.z), gap(p.heading, q.heading));
    });
  }
  console.log('item layout: worst gap over seeds 1-20', worst);
  expect(worst).toBeLessThan(1e-9);
});

test('jumps: buildRamps and airTuning on Meadow Loop match the web', () => {
  const webTrack = new web.TrackPath(web.DEMO_TRACK, 5.5);
  const portTrack = trackPath(MEADOW_LOOP);
  const a = webJumps.buildRamps(webTrack, webItems.DEMO_LAYOUT.ramps!);
  const b = portJumps.buildRamps(portTrack, portItems.DEMO_LAYOUT.ramps!);
  expect(b.length).toBe(a.length);
  let worst = 0;
  a.forEach((r: any, i: number) => {
    const q = b[i];
    for (const k of ['start', 'lateral', 'width', 'x', 'z', 'heading'] as const) {
      worst = Math.max(worst, Math.abs(r[k] - q[k]));
    }
  });
  console.log('ramps: worst gap', worst);
  expect(worst).toBeLessThan(1e-9);
  expect(portJumps.airTuning(portCar.DEFAULT_TUNING)).toEqual(webJumps.airTuning(webCar.DEFAULT_TUNING));
  expect(portJumps.airTuning()).toEqual(webJumps.airTuning());
});

test('a scripted item race plays out the same on both sides (seed 7, 60 s)', () => {
  const { web: a, port: b } = races();
  expect(b.countdownSteps).toBe(a.countdownSteps);

  // Item events, compared by type, racer, victim and item (the id fields are checked separately).
  const key = (e: any) => [e.type, e.racer ?? -1, e.victim ?? -1, e.item ?? ''].join(' ');
  expect(b.events.map(key)).toEqual(a.events.map(key));
  expect(b.jumps.map((j) => `${j.type} ${j.racer}`)).toEqual(a.jumps.map((j) => `${j.type} ${j.racer}`));

  let worstEvent = 0;
  a.events.forEach((e, i) => {
    worstEvent = Math.max(worstEvent, Math.abs(e.x - b.events[i].x), Math.abs(e.z - b.events[i].z));
  });
  let worstJump = 0;
  a.jumps.forEach((j, i) => {
    worstJump = Math.max(worstJump, Math.abs(j.x - b.jumps[i].x), Math.abs(j.z - b.jumps[i].z));
  });

  let worstCar = 0;
  a.cars.forEach((c, i) => {
    for (const k of CAR_KEYS) worstCar = Math.max(worstCar, Math.abs(c[k] - b.cars[i][k]));
  });
  for (let i = 0; i < a.cars.length; i++) {
    const s = a.items.status[i];
    const t = b.items.status[i];
    expect(t.item ?? null).toBe(s.item ?? null);
    for (const k of ['spin', 'boost', 'slick'] as const) {
      expect(Math.abs(s[k] - t[k]), `car ${i} ${k}`).toBeLessThan(1e-6);
    }
  }

  const count = (run: ItemRace, type: string) => run.events.filter((e) => e.type === type).length;
  const tally = {
    pickups: count(b, 'pickup'),
    missileFires: count(b, 'fire'),
    bombDrops: count(b, 'drop'),
    explosionsWithVictim: b.events.filter((e) => e.type === 'explode' && e.victim !== undefined).length,
    explosionsNoVictim: b.events.filter((e) => e.type === 'explode' && e.victim === undefined).length,
    boosts: count(b, 'boost'),
    slicks: count(b, 'slick'),
    splashes: count(b, 'splash'),
    jumps: b.jumps.filter((j) => j.type === 'jump').length,
    landings: b.jumps.filter((j) => j.type === 'land').length,
  };
  console.log('scripted race events (port):', JSON.stringify(tally));
  console.log('scripted race worst gaps: event position', worstEvent, 'jump position', worstJump, 'car state', worstCar);

  expect(worstCar).toBeLessThan(1e-6);
  expect(worstEvent).toBeLessThan(1e-6);
  expect(worstJump).toBeLessThan(1e-6);
  expect(tally.pickups).toBeGreaterThan(0);
  expect(tally.missileFires).toBeGreaterThan(0);
  expect(tally.bombDrops).toBeGreaterThan(0);
  expect(tally.explosionsWithVictim).toBeGreaterThan(0);
  expect(tally.boosts).toBeGreaterThan(0);
  expect(tally.jumps).toBeGreaterThan(0);
});

test('ported event ids link each explosion to an earlier fire or drop, and pickups to real pickups', () => {
  const { port } = { port: races().port };
  const pickupIds = new Set<number>(port.items.pickups.map((p: any) => p.id));
  const launched = new Set<number>();
  let explosions = 0;
  let pickups = 0;
  for (const e of port.events) {
    if (e.type === 'fire' || e.type === 'drop') {
      expect(launched.has(e.id), `launch id ${e.id} reused`).toBe(false);
      launched.add(e.id);
    } else if (e.type === 'explode') {
      explosions++;
      expect(launched.has(e.id), `explosion ${e.id} has no earlier fire or drop`).toBe(true);
    } else if (e.type === 'pickup') {
      pickups++;
      expect(pickupIds.has(e.pickupId), `pickup ${e.pickupId} is not a pickup`).toBe(true);
    }
  }
  expect(explosions).toBeGreaterThan(0);
  expect(pickups).toBeGreaterThan(0);
});
