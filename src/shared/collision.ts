import type { CarState } from './carPhysics';
import type { Projection, TrackPath } from './trackPath';
import { Math } from './jsMath';

export const CAR_RADIUS = 0.9;
/** Share of the into-wall speed that bounces back out. */
const RESTITUTION = 0.35;
/**
 * Wall friction: along-wall speed lost per unit of the push into the wall (Coulomb friction). It scales
 * with how hard the car presses, so a slam costs a lot, but a car sliding along a wall pays only for the
 * small push each step. A fixed share per step would be charged 120 times a second and glue the car to the
 * wall.
 */
const WALL_FRICTION = 0.25;
/**
 * How fast (1/s) a wall swings a car's nose round towards running alongside it. Without this a car aimed
 * at a wall is driven into it every step and stays pinned however long the gas is held; with it the car
 * peels away and slides along, in about a third of a second.
 */
const WALL_SWING = 8;
/**
 * Drag (1/s) on a car while it's rubbing a wall, whatever its angle, so riding the outside of a bend is
 * slower than driving the road. It's per second, not per step: a modest cost that can't build into a
 * stop.
 */
const WALL_DRAG = 0.8;

/** The signed angle from b to a, in (-PI, PI]. */
const angleBetween = (a: number, b: number) => {
  const twoPi = 2 * Math.PI;
  return ((((a - b + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
};

/**
 * Keeps the car between the walls on either side of the track. Returns the projection of the
 * car's final position and whether it hit a wall. `dt` is the length of the physics step, for the
 * wall's swing of the car's nose.
 */
export function collideWithWalls(
  car: CarState,
  track: TrackPath,
  dt = 1 / 120,
): { proj: Projection; hit: boolean } {
  let proj = track.project(car.x, car.z);
  const limit = track.halfWidth - CAR_RADIUS;
  const overlap = Math.abs(proj.lateral) - limit;
  if (overlap <= 0) return { proj, hit: false };

  const side = Math.sign(proj.lateral);
  // Outward normal of the wall being hit.
  const nx = -proj.tz * side;
  const nz = proj.tx * side;
  car.x -= nx * overlap;
  car.z -= nz * overlap;

  // A nose pointing into the wall swings round, a share of the way to parallel each step, in whichever
  // direction is shorter. A car already pointing along or away from the wall is left alone.
  const noseToWall = angleBetween(car.heading, Math.atan2(nz, nx));
  if (Math.abs(noseToWall) < Math.PI / 2) {
    const toParallel = Math.PI / 2 - Math.abs(noseToWall);
    car.heading += (noseToWall < 0 ? -1 : 1) * toParallel * (1 - Math.exp(-WALL_SWING * dt));
  }

  const into = car.vx * nx + car.vz * nz;
  if (into > 0) {
    const tx = car.vx - into * nx;
    const tz = car.vz - into * nz;
    // The push into the wall this step: it stops the car and bounces it back out.
    const push = into * (1 + RESTITUTION);
    const alongSpeed = Math.hypot(tx, tz);
    const keep = alongSpeed > 0 ? Math.max(0, 1 - (WALL_FRICTION * push) / alongSpeed) : 0;
    car.vx = tx * keep - into * RESTITUTION * nx;
    car.vz = tz * keep - into * RESTITUTION * nz;
  }
  const rub = Math.exp(-WALL_DRAG * dt);
  car.vx *= rub;
  car.vz *= rub;

  proj = track.project(car.x, car.z);
  return { proj, hit: into > 0 };
}

/** Centre-to-centre distance at which two cars touch. Cars are treated as equal-mass circles. */
export const CAR_SPACING = 2;
const CAR_RESTITUTION = 0.3;
/** Cars further apart in height than this don't touch. */
const CAR_HEIGHT = 0.8;

/** Separates two overlapping cars and bounces them apart. Returns whether they touched. */
export function collideCars(a: CarState, b: CarState): boolean {
  // A car in the air passes over one on the ground.
  if (Math.abs(a.y - b.y) > CAR_HEIGHT) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= CAR_SPACING || dist === 0) return false;

  const nx = dx / dist;
  const nz = dz / dist;
  const push = (CAR_SPACING - dist) / 2;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;

  // Closing speed along the line between them; only bounce if they're moving together.
  const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (closing < 0) {
    const j = (-(1 + CAR_RESTITUTION) * closing) / 2;
    a.vx -= j * nx;
    a.vz -= j * nz;
    b.vx += j * nx;
    b.vz += j * nz;
  }
  return true;
}
