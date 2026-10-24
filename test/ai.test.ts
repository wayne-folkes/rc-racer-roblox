import './setup';
import { expect, test } from 'vitest';
import * as web from '../../rc-racer/client/src/game/trackPath';
import * as webCar from '../../rc-racer/client/src/game/carPhysics';
import * as webCol from '../../rc-racer/client/src/game/collision';
import * as webLine from '../../rc-racer/client/src/game/racingLine';
import * as webAi from '../../rc-racer/client/src/game/aiDriver';
import * as webRace from '../../rc-racer/client/src/game/race';
import * as webRacers from '../../rc-racer/client/src/game/racers';
import type { AiSkill } from '../../rc-racer/client/src/game/aiDriver';
import type { CarState } from '../../rc-racer/client/src/game/carPhysics';
import * as portCar from '../src/shared/carPhysics';
import * as portCol from '../src/shared/collision';
import * as portLine from '../src/shared/racingLine';
import * as portAi from '../src/shared/aiDriver';
import * as portRace from '../src/shared/race';
import { MEADOW_LOOP, trackPath } from '../src/shared/tracks';

// Both sides of the parity check are driven through the same functions, so the simulation loop is
// written once and given the web or the ported modules.
interface Lib {
  buildRacingLine: (track: any) => any;
  AiDriver: new (track: any, line: any, skill: AiSkill) => any;
  Race: new (trackLength: number, racerCount: number) => any;
  stepCar: (car: any, input: any, dt: number, tuning: any) => void;
  collideCars: (a: any, b: any) => boolean;
  collideWithWalls: (car: any, track: any, dt: number) => unknown;
}

const webLib: Lib = {
  buildRacingLine: webLine.buildRacingLine,
  AiDriver: webAi.AiDriver,
  Race: webRace.Race,
  stepCar: webCar.stepCar,
  collideCars: webCol.collideCars,
  collideWithWalls: webCol.collideWithWalls,
};

const portLib: Lib = {
  buildRacingLine: portLine.buildRacingLine,
  AiDriver: portAi.AiDriver,
  Race: portRace.Race,
  stepCar: portCar.stepCar,
  collideCars: portCol.collideCars,
  collideWithWalls: portCol.collideWithWalls,
};

const DT = 1 / 120;
const RACE_STEPS = 60 * 120;

/**
 * Runs an AI-only race. The race's 3 s countdown is simulated with the cars held still; after GO,
 * each step drives, steps, collides and wall-checks every car, then runs RACE_STEPS steps.
 */
function simulate(lib: Lib, track: any, grid: CarState[], skills: AiSkill[]) {
  const line = lib.buildRacingLine(track);
  const drivers = skills.map((skill) => new lib.AiDriver(track, line, skill));
  const cars = grid.map((c) => ({ ...c }));
  const race = new lib.Race(track.length, cars.length);
  let countdownSteps = 0;
  let racingSteps = 0;
  while (racingSteps < RACE_STEPS) {
    // Distances are read before this step moves anything, on both sides alike.
    const distances = cars.map((c) => track.project(c.x, c.z).distance);
    race.update(DT, distances);
    if (race.phase === 'countdown') {
      countdownSteps++;
      continue;
    }
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const others = cars.filter((_, j) => j !== i);
      const decision = drivers[i].drive(car, track.project(car.x, car.z), others, 1, DT);
      lib.stepCar(car, decision.input, DT, drivers[i].tuning);
    }
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) lib.collideCars(cars[i], cars[j]);
    }
    for (const car of cars) lib.collideWithWalls(car, track, DT);
    racingSteps++;
  }
  return { cars, race, countdownSteps };
}

test('buildRacingLine on Meadow Loop matches the web racing line', () => {
  const a = webLine.buildRacingLine(new web.TrackPath(web.DEMO_TRACK, 5.5));
  const b = portLine.buildRacingLine(trackPath(MEADOW_LOOP));
  expect(b.offsets.length).toBe(a.offsets.length);
  expect(b.targetSpeed.length).toBe(a.targetSpeed.length);

  let worstOffset = 0;
  let worstSpeed = 0;
  a.offsets.forEach((o: number, i: number) => (worstOffset = Math.max(worstOffset, Math.abs(o - b.offsets[i]))));
  a.targetSpeed.forEach((s: number, i: number) => (worstSpeed = Math.max(worstSpeed, Math.abs(s - b.targetSpeed[i]))));
  console.log('racing line: worst offset gap', worstOffset, 'worst target speed gap', worstSpeed);
  expect(worstOffset).toBeLessThan(1e-9);
  expect(worstSpeed).toBeLessThan(1e-9);
  expect(Math.abs(a.spacing - b.spacing)).toBeLessThan(1e-9);
});

test('an AI-only race on the web grid plays out the same on both sides', () => {
  const webTrack = new web.TrackPath(web.DEMO_TRACK, 5.5);
  const portTrack = trackPath(MEADOW_LOOP);
  const slots = [0, 1, 2, 3];
  const grid = slots.map((slot) => webRacers.gridPosition(webTrack, slot));
  // Slots 0-2 use the web opponents' skills; slot 3 (the player's slot on the web) gets the spare skill.
  const skills: AiSkill[] = slots.map(
    (slot) => webRacers.OPPONENTS.find((o) => o.gridSlot === slot)?.skill ?? { pace: 0.85, steerGain: 2.4 },
  );

  const a = simulate(webLib, webTrack, grid, skills);
  const b = simulate(portLib, portTrack, grid, skills);
  expect(b.countdownSteps).toBe(a.countdownSteps);
  expect(b.race.phase).toBe(a.race.phase);

  let worstPosition = 0;
  a.cars.forEach((c, i) => {
    const d = b.cars[i];
    for (const key of ['x', 'z', 'heading', 'vx', 'vz'] as const) {
      worstPosition = Math.max(worstPosition, Math.abs(c[key] - d[key]));
    }
  });
  console.log('AI race: countdown steps', a.countdownSteps, 'worst car state gap', worstPosition);
  for (let i = 0; i < a.cars.length; i++) {
    console.log(`car ${i}: web (${a.cars[i].x.toFixed(4)}, ${a.cars[i].z.toFixed(4)}) port (${b.cars[i].x.toFixed(4)}, ${b.cars[i].z.toFixed(4)})`);
  }
  expect(worstPosition).toBeLessThan(1e-6);

  // Laps and standings.
  const lapsWeb = a.race.racers.map((r: any) => r.lapsCompleted);
  const lapsPort = b.race.racers.map((r: any) => r.lapsCompleted);
  console.log('laps web', lapsWeb, 'laps port', lapsPort, 'phase', a.race.phase);
  expect(lapsWeb.every((n: number) => n >= 2)).toBe(true);
  expect(lapsPort).toEqual(lapsWeb);
  expect(b.race.standings()).toEqual(a.race.standings());
  console.log('standings', a.race.standings(), 'progress', a.race.racers.map((_: unknown, i: number) => a.race.progress(i)));

  // Finish times: the web uses null for "not finished", the port uses NOT_FINISHED (-1).
  const webFinish = a.race.finishTimes.map((t: number | null) => t ?? portRace.NOT_FINISHED);
  const portFinish: number[] = b.race.finishTimes;
  console.log('finish times web', webFinish, 'port', portFinish);
  expect(portFinish.length).toBe(webFinish.length);
  for (let i = 0; i < webFinish.length; i++) {
    expect(Math.abs(webFinish[i] - portFinish[i])).toBeLessThan(1e-6);
  }
});

test('formatTime on the web shows m:ss.ss', () => {
  // The ported formatTime uses Luau's string.format, which Node doesn't have, so only the web
  // version is checked here.
  expect(webRace.formatTime(83.456)).toBe('1:23.46');
});

test('standings order finishers by time (ties by index), then the rest by distance, on both sides', () => {
  const length = 400;
  const distances = [100, 150, 120, 90];
  for (const [name, RaceCls, notFinished] of [
    ['web', webRace.Race, null],
    ['port', portRace.Race, portRace.NOT_FINISHED],
  ] as const) {
    const race: any = new (RaceCls as any)(length, 4);
    race.phase = 'racing';
    race.update(DT, distances);
    // Racer 2 and racer 3 tie on time; racer 0 finishes last; racer 1 hasn't finished.
    race.finishTimes[0] = 9;
    race.finishTimes[1] = notFinished;
    race.finishTimes[2] = 5;
    race.finishTimes[3] = 5;
    expect(race.standings(), name).toEqual([2, 3, 0, 1]);

    // Nobody finished: furthest along first.
    for (let i = 0; i < 4; i++) race.finishTimes[i] = notFinished;
    expect(race.standings(), name).toEqual([1, 2, 0, 3]);
  }
});
