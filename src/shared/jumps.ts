import { DEFAULT_TUNING, type CarState, type CarTuning } from './carPhysics';
import type { Projection, TrackPath } from './trackPath';
import { Math } from './jsMath';

// Ramps and jumping. The ground is flat everywhere except on ramps: a car rides up a ramp, and if
// it's moving forward fast enough when it reaches the lip, it launches and flies until gravity
// brings it back down. In the air there's no grip, steering or throttle.

/** A ramp across the track, as placed in a track's layout. */
export interface RampSpec {
  /** Where the foot of the ramp is, as a fraction of the lap. */
  at: number;
  /** Centre of the ramp in metres right of the centreline; 0 for a ramp across the whole road. */
  lateral?: number;
  /** Width in metres; defaults to the full width of the road. */
  width?: number;
}

export interface Ramp {
  /** Distance along the track of the foot of the ramp. */
  start: number;
  lateral: number;
  width: number;
  /** World position of the middle of the ramp and its direction, for drawing it. */
  x: number;
  z: number;
  heading: number;
}

export const RAMP_LENGTH = 4;
export const RAMP_HEIGHT = 1;
/** Launch speed upwards per m/s of forward speed at the lip. Steeper than the ramp, for big air. */
const LAUNCH = 0.3;
/** Below this forward speed a car just rolls off the end instead of launching. */
const MIN_LAUNCH_SPEED = 5;
export const GRAVITY = 24;
/** Landings slower than this (m/s downwards) don't count as a landing worth a thump. */
const SOFT_LANDING = 2;
/** Cars this high off the ground pass over pickups, hazards and bombs. */
export const CLEARANCE = 0.35;

export type JumpEvent = 'jump' | 'land';

export function buildRamps(track: TrackPath, specs: RampSpec[]): Ramp[] {
  return specs.map((spec) => {
    const start = spec.at * track.length;
    const lateral = spec.lateral ?? 0;
    const mid = track.pointAt(start + RAMP_LENGTH / 2);
    return {
      start,
      lateral,
      // Just inside the walls, so a car hugging the wall still gets the ramp.
      width: spec.width ?? 2 * track.halfWidth - 0.4,
      x: mid.x - mid.tz * lateral,
      z: mid.z + mid.tx * lateral,
      heading: Math.atan2(mid.tz, mid.tx),
    };
  });
}

/** How far up a ramp the car is (0 to 1), or undefined when it isn't on one. */
function rampProgress(proj: Projection, ramps: Ramp[], trackLength: number): number | undefined {
  for (const ramp of ramps) {
    const along = (proj.distance - ramp.start + trackLength) % trackLength;
    if (along <= RAMP_LENGTH && Math.abs(proj.lateral - ramp.lateral) <= ramp.width / 2) return along / RAMP_LENGTH;
  }
  return undefined;
}

/**
 * Moves a car up and down: riding ramps, launching off their lip, falling and landing.
 * Call once per step after the car has moved. Returns 'jump' or 'land' when one happens.
 */
export function updateHeight(
  car: CarState,
  proj: Projection,
  ramps: Ramp[],
  trackLength: number,
  dt: number,
): JumpEvent | undefined {
  if (car.airborne) {
    car.vy -= GRAVITY * dt;
    car.y += car.vy * dt;
    if (car.y > 0) return undefined;
    const impact = -car.vy;
    car.y = 0;
    car.vy = 0;
    car.airborne = false;
    return impact > SOFT_LANDING ? 'land' : undefined;
  }

  const onRamp = rampProgress(proj, ramps, trackLength);
  if (onRamp !== undefined) {
    car.y = onRamp * RAMP_HEIGHT;
    return undefined;
  }
  if (car.y <= 0) return undefined;

  // Just left a ramp. Forward off the top at speed: launch. Otherwise (slowly, backwards, or off
  // the side) drop back down.
  const forward = car.vx * proj.tx + car.vz * proj.tz;
  car.airborne = true;
  const offTheTop = car.y > RAMP_HEIGHT * 0.8 && forward > MIN_LAUNCH_SPEED;
  car.vy = offTheTop ? forward * LAUNCH : 0;
  return offTheTop ? 'jump' : undefined;
}

/** Handling in the air: no grip, so the car keeps its momentum, and almost no drag. */
export function airTuning(base: CarTuning = DEFAULT_TUNING): CarTuning {
  return { ...base, grip: 0, driftGrip: 0, coastDecel: 0, rollingDrag: 0.05 };
}

/** True while a car is high enough to clear things on the road. */
export function clearsGround(car: CarState): boolean {
  return car.y > CLEARANCE;
}
