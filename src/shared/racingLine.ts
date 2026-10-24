import { DEFAULT_TUNING, type CarTuning } from './carPhysics';
import type { Point, TrackPath } from './trackPath';
import { Math } from './jsMath';

// The line AI cars follow, and how fast they can take each part of it. The line has one sample
// per centreline sample, so a car's centreline index is also its index on the line.

export interface RacingLine {
  points: Point[];
  /** Sideways offset of each point from the centreline; positive is right of travel. */
  offsets: number[];
  /** Fastest safe speed at each point, allowing for braking before corners. */
  targetSpeed: number[];
  /** Average distance between samples. */
  spacing: number;
}

/** How far the line stays from the walls. */
const LINE_MARGIN = 1.6;
/** Converts curvature (1/m) into a sideways shift towards the inside of a corner. */
const CURVATURE_GAIN = 60;
/** Share of the car's turning ability the line plans to use, leaving room for correction. */
const CORNER_SAFETY = 0.8;
/** Share of full braking the speed plan assumes. */
const BRAKE_SHARE = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moving average around a closed loop. */
function smoothLoop(values: number[], radius: number): number[] {
  const n = values.size();
  return values.map((_, i) => {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[(i + k + n) % n];
    return sum / (2 * radius + 1);
  });
}

/** Signed curvature at each point of a closed polyline; positive turns right. */
function curvatures(points: Point[], step: number): number[] {
  const n = points.size();
  return points.map((b, i) => {
    const a = points[(i - step + n) % n];
    const c = points[(i + step) % n];
    const l1 = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const l2 = Math.hypot(c.x - b.x, c.z - b.z) || 1;
    const t1x = (b.x - a.x) / l1;
    const t1z = (b.z - a.z) / l1;
    const t2x = (c.x - b.x) / l2;
    const t2z = (c.z - b.z) / l2;
    const turn = Math.atan2(t1x * t2z - t1z * t2x, t1x * t2x + t1z * t2z);
    return turn / ((l1 + l2) / 2);
  });
}

export function buildRacingLine(track: TrackPath, tuning: CarTuning = DEFAULT_TUNING): RacingLine {
  const n = track.points.size();
  const spacing = track.length / n;
  const maxOffset = track.halfWidth - LINE_MARGIN;

  // Hug the inside of corners. Smoothing first spreads each corner out, so the line starts
  // moving across before the turn and drifts back out after it.
  const bend = smoothLoop(curvatures(track.points, 2), 18);
  const offsets = smoothLoop(
    bend.map((k) => clamp(k * CURVATURE_GAIN, -maxOffset, maxOffset)),
    10,
  );
  const points = offsets.map((o, i) => {
    const p = track.points[i];
    const t = track.tangent(i);
    return { x: p.x - t.z * o, z: p.z + t.x * o };
  });

  // The car's turn rate falls linearly with speed (see stepCar), so the fastest speed through
  // curvature k solves k * v = r0 * (1 - c * v).
  const r0 = tuning.maxTurnRate * CORNER_SAFETY;
  const c = (1 - tuning.highSpeedTurnFactor) / tuning.maxSpeed;
  const targetSpeed = curvatures(points, 3).map((k) =>
    Math.min(tuning.maxSpeed, r0 / (Math.abs(k) + r0 * c)),
  );

  // Work backwards so the car starts braking early enough for each corner. Two passes, because
  // the corner just after the start line affects the end of the lap.
  const decel = tuning.brake * BRAKE_SHARE;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nextSpeed = targetSpeed[(i + 1) % n];
      targetSpeed[i] = Math.min(targetSpeed[i], Math.sqrt(nextSpeed * nextSpeed + 2 * decel * spacing));
    }
  }

  return { points, offsets, targetSpeed, spacing };
}
