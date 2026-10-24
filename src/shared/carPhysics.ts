// Arcade car handling on the flat XZ plane. Pure math with no Three.js, so it can be unit-tested
// and tuned in isolation.
//
// Heading convention: forward = (cos h, sin h) in (x, z); right = (-sin h, cos h). Seen from
// above, increasing the heading turns the car clockwise, i.e. to the right.

import { Math } from './jsMath';

export interface CarInput {
  /** -1 (brake / reverse) to 1 (full throttle). */
  throttle: number;
  /** -1 (left) to 1 (right). */
  steer: number;
  handbrake: boolean;
}

export interface CarState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /** Smoothed steering input, also used to turn the front wheels. */
  steer: number;
  /** Height above the ground and vertical speed, for ramps and jumps (see jumps.ts). */
  y: number;
  vy: number;
  airborne: boolean;
}

export interface CarTuning {
  maxSpeed: number;
  accel: number;
  brake: number;
  reverseAccel: number;
  maxReverse: number;
  /** Proportional drag, always applied. */
  rollingDrag: number;
  /** Extra constant deceleration when off the throttle. */
  coastDecel: number;
  /** Turn rate (rad/s) at full lock once the car is moving. */
  maxTurnRate: number;
  /** Speed at which full turn rate is available; slower cars turn proportionally less. */
  fullTurnSpeed: number;
  /** Fraction of the turn rate left at top speed. */
  highSpeedTurnFactor: number;
  /** How quickly sideways velocity is killed (1/s). Higher = more grip, less sliding. */
  grip: number;
  /** Grip while the handbrake is held. */
  driftGrip: number;
  /** Turn-rate multiplier while the handbrake is held. */
  driftTurnBoost: number;
  /** How quickly steering follows the input (1/s). */
  steerResponse: number;
  /** Fraction of grip left on an oil slick: lower slides more. */
  slickGrip: number;
  /** Extra drag (1/s) while driving through a puddle. */
  puddleDrag: number;
}

export const DEFAULT_TUNING: CarTuning = {
  maxSpeed: 26,
  accel: 24,
  brake: 45,
  reverseAccel: 14,
  maxReverse: 8,
  rollingDrag: 0.35,
  coastDecel: 6,
  maxTurnRate: 3.2,
  fullTurnSpeed: 7,
  highSpeedTurnFactor: 0.6,
  grip: 9,
  driftGrip: 1.4,
  driftTurnBoost: 1.35,
  steerResponse: 12,
  slickGrip: 0.1,
  puddleDrag: 1.6,
};

export function createCar(x: number, z: number, heading: number): CarState {
  return { x, z, heading, vx: 0, vz: 0, steer: 0, y: 0, vy: 0, airborne: false };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function forwardSpeed(car: CarState): number {
  return car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading);
}

export function speed(car: CarState): number {
  return Math.hypot(car.vx, car.vz);
}

export function stepCar(car: CarState, input: CarInput, dt: number, t: CarTuning = DEFAULT_TUNING): void {
  const fx = Math.cos(car.heading);
  const fz = Math.sin(car.heading);
  const rx = -fz;
  const rz = fx;

  let vf = car.vx * fx + car.vz * fz;
  let vl = car.vx * rx + car.vz * rz;

  car.steer += (clamp(input.steer, -1, 1) - car.steer) * Math.min(1, t.steerResponse * dt);

  const throttle = clamp(input.throttle, -1, 1);
  if (throttle > 0) {
    if (vf < 0) {
      vf = Math.min(0, vf + t.brake * throttle * dt);
    } else {
      // Acceleration tapers off approaching top speed.
      const headroom = clamp(1 - (vf / t.maxSpeed) ** 2, 0, 1);
      vf += t.accel * throttle * headroom * dt;
    }
  } else if (throttle < 0) {
    if (vf > 0.05) {
      vf = Math.max(0, vf + t.brake * throttle * dt);
    } else {
      vf = Math.max(-t.maxReverse, vf + t.reverseAccel * throttle * dt);
    }
  } else {
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), t.coastDecel * dt);
  }

  vf -= vf * t.rollingDrag * dt;
  if (input.handbrake) vf -= vf * 1.2 * dt;

  const absVf = Math.abs(vf);
  const lowSpeedFactor = clamp(absVf / t.fullTurnSpeed, 0, 1);
  const highSpeedFactor = 1 - (1 - t.highSpeedTurnFactor) * clamp(absVf / t.maxSpeed, 0, 1);
  const turnRate =
    t.maxTurnRate * lowSpeedFactor * highSpeedFactor * (input.handbrake ? t.driftTurnBoost : 1);
  car.heading += car.steer * turnRate * Math.sign(vf) * dt;

  // Velocity is recomposed in the old heading's frame. The next step sees the gap between the
  // new heading and the velocity as sideways motion, and grip decides how fast that dies out:
  // high grip snaps the car onto its new line, low grip lets it slide.
  vl *= Math.exp(-(input.handbrake ? t.driftGrip : t.grip) * dt);

  car.vx = fx * vf + rx * vl;
  car.vz = fz * vf + rz * vl;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
}
