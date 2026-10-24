import { Math } from './jsMath';
import type { Point } from './trackPath';

// A closed centripetal Catmull-Rom spline, sampled at evenly spaced distances along it. It stands in
// for Three.js's CatmullRomCurve3(points, true, 'centripetal').getSpacedPoints() and follows the same
// maths, down to the 200 divisions used to measure arc length, so tracks come out the same shape as
// on the web.

const ARC_LENGTH_DIVISIONS = 200;

/** One coordinate of a non-uniform Catmull-Rom segment from x1 (t = 0) to x2 (t = 1). */
function cubic(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number, t: number) {
  const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1;
  const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1;
  const c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2;
  const c3 = 2 * x1 - 2 * x2 + t1 + t2;
  return x1 + t1 * t + c2 * t * t + c3 * t * t * t;
}

/** Centripetal knot spacing: the square root of the distance between two points. */
function knot(a: Point, b: Point) {
  return Math.pow((b.x - a.x) ** 2 + (b.z - a.z) ** 2, 0.25);
}

/** The point at parameter t in [0, 1] round the closed curve (not evenly spaced by distance). */
function pointOnCurve(points: Point[], t: number): Point {
  const l = points.size();
  const p = l * t;
  let i = Math.floor(p);
  const weight = p - i;
  if (i <= 0) i += (Math.floor(Math.abs(i) / l) + 1) * l;

  const p0 = points[(i - 1) % l];
  const p1 = points[i % l];
  const p2 = points[(i + 1) % l];
  const p3 = points[(i + 2) % l];

  let dt1 = knot(p1, p2);
  let dt0 = knot(p0, p1);
  let dt2 = knot(p2, p3);
  if (dt1 < 1e-4) dt1 = 1;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;

  return {
    x: cubic(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2, weight),
    z: cubic(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2, weight),
  };
}

/** `count` points spaced evenly by distance round the closed curve, starting at the first control point. */
export function spacedPoints(controlPoints: Point[], count: number): Point[] {
  // Cumulative arc length at each of the measuring divisions.
  const lengths = [0];
  let last = pointOnCurve(controlPoints, 0);
  let sum = 0;
  for (let d = 1; d <= ARC_LENGTH_DIVISIONS; d++) {
    const current = pointOnCurve(controlPoints, d / ARC_LENGTH_DIVISIONS);
    sum += Math.hypot(current.x - last.x, current.z - last.z);
    lengths.push(sum);
    last = current;
  }

  const result: Point[] = [];
  for (let k = 0; k < count; k++) {
    // Find the division the target distance falls in, then interpolate within it.
    const target = (k / count) * sum;
    let low = 0;
    let high = ARC_LENGTH_DIVISIONS;
    while (low <= high) {
      const mid = Math.floor(low + (high - low) / 2);
      if (lengths[mid] < target) low = mid + 1;
      else if (lengths[mid] > target) high = mid - 1;
      else {
        high = mid;
        break;
      }
    }
    const before = lengths[high];
    const t =
      before === target
        ? high / ARC_LENGTH_DIVISIONS
        : (high + (target - before) / (lengths[high + 1] - before)) / ARC_LENGTH_DIVISIONS;
    result.push(pointOnCurve(controlPoints, t));
  }
  return result;
}
