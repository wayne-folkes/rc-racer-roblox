import { stepCar, type CarInput, type CarState, type CarTuning } from './carPhysics';
import { SPIN_TIME, type RacerStatus } from './items';
import { Math } from './jsMath';
import { airTuning } from './jumps';

// How items and the air change a car's handling for one step: rc-racer's world.ts step, for one car.
// The server runs it for AI cars and each player's device for its own car, so both drive the same.

export const NO_INPUT: CarInput = { throttle: 0, steer: 0, handbrake: false };

/** Peak spin rate (rad/s) when hit; it winds down over the spin. */
const SPIN_RATE = 11;
const BOOST_SPEED = 1.35;
const BOOST_ACCEL = 1.8;
const SLICK_TURN = 0.6;

/** Handling for a car right now, with boosts and oil taken into account. */
export function effectiveTuning(base: CarTuning, status: RacerStatus): CarTuning {
  let t = base;
  if (status.boost > 0) t = { ...t, maxSpeed: t.maxSpeed * BOOST_SPEED, accel: t.accel * BOOST_ACCEL };
  if (status.slick > 0) {
    t = {
      ...t,
      grip: t.grip * t.slickGrip,
      driftGrip: t.driftGrip * t.slickGrip,
      maxTurnRate: t.maxTurnRate * SLICK_TURN,
    };
  }
  return t;
}

/**
 * Steps a car with its item effects: no control while spinning out, none in the air, boost and oil
 * changing the handling, and puddles dragging. Call before collisions and updateHeight.
 */
export function stepWithEffects(car: CarState, input: CarInput, dt: number, base: CarTuning, status: RacerStatus): void {
  const controls = status.spin > 0 ? NO_INPUT : input;
  // In the air there's nothing to push against: no steering, throttle or grip.
  if (car.airborne) stepCar(car, NO_INPUT, dt, airTuning(base));
  else stepCar(car, controls, dt, effectiveTuning(base, status));
  if (status.spin > 0) car.heading += SPIN_RATE * (status.spin / SPIN_TIME) * dt;
  if (status.inPuddle) {
    const keep = Math.exp(-base.puddleDrag * dt);
    car.vx *= keep;
    car.vz *= keep;
  }
}
