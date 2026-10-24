import { spacedPoints } from './catmullRom';
import { Infinity, Math } from './jsMath';

// A closed track described by its centreline and a constant width. Everything is in the XZ
// plane. The scene builds meshes from it; the game uses it for wall collisions and lap progress.

export interface Point {
  x: number;
  z: number;
}

export interface Projection {
  /** Index of the centreline segment the point is closest to. */
  index: number;
  /** Distance along the centreline from the start line, in [0, length). */
  distance: number;
  /** Signed sideways offset from the centreline; positive is to the right of travel. */
  lateral: number;
  /** Unit tangent (direction of travel) at the closest point. */
  tx: number;
  tz: number;
}

export class TrackPath {
  readonly points: Point[];
  readonly halfWidth: number;
  readonly length: number;
  private readonly cumulative: number[];

  constructor(controlPoints: Point[], halfWidth: number, samples = 480) {
    this.points = spacedPoints(controlPoints, samples);
    this.halfWidth = halfWidth;

    this.cumulative = [0];
    let total = 0;
    for (let i = 0; i < this.points.size(); i++) {
      const a = this.points[i];
      const b = this.points[(i + 1) % this.points.size()];
      total += Math.hypot(b.x - a.x, b.z - a.z);
      this.cumulative.push(total);
    }
    this.length = total;
  }

  /** Unit tangent at centreline sample i. */
  tangent(i: number): Point {
    const n = this.points.size();
    const a = this.points[(i - 1 + n) % n];
    const b = this.points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  /** Position and unit tangent on the centreline at a distance from the start line (wraps). */
  pointAt(distance: number): Point & { tx: number; tz: number } {
    const d = ((distance % this.length) + this.length) % this.length;
    let i = 0;
    while (i < this.points.size() - 1 && this.cumulative[i + 1] < d) i++;
    const a = this.points[i];
    const b = this.points[(i + 1) % this.points.size()];
    const segLen = this.cumulative[i + 1] - this.cumulative[i] || 1;
    const u = (d - this.cumulative[i]) / segLen;
    return {
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      tx: (b.x - a.x) / segLen,
      tz: (b.z - a.z) / segLen,
    };
  }

  project(x: number, z: number): Projection {
    const n = this.points.size();
    let best = { index: 0, u: 0, d2: Infinity };
    for (let i = 0; i < n; i++) {
      const a = this.points[i];
      const b = this.points[(i + 1) % n];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const segLen2 = ex * ex + ez * ez || 1;
      const u = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / segLen2));
      const dx = x - (a.x + ex * u);
      const dz = z - (a.z + ez * u);
      const d2 = dx * dx + dz * dz;
      if (d2 < best.d2) best = { index: i, u, d2 };
    }

    const a = this.points[best.index];
    const b = this.points[(best.index + 1) % n];
    const segLen = this.cumulative[best.index + 1] - this.cumulative[best.index];
    const tx = (b.x - a.x) / (segLen || 1);
    const tz = (b.z - a.z) / (segLen || 1);
    const cx = a.x + (b.x - a.x) * best.u;
    const cz = a.z + (b.z - a.z) * best.u;
    // Right of travel is (-tz, tx), matching the car's heading convention.
    const lateral = (x - cx) * -tz + (z - cz) * tx;

    return {
      index: best.index,
      distance: (this.cumulative[best.index] + segLen * best.u) % this.length,
      lateral,
      tx,
      tz,
    };
  }
}

/** Every corner keeps a radius above the half-width (see trackPath.test.ts), so walls never fold. */
export const DEMO_TRACK: Point[] = [
  { x: -50, z: -35 },
  { x: -20, z: -39 },
  { x: 10, z: -39 },
  { x: 36, z: -35 },
  { x: 55, z: -27 },
  { x: 63, z: -12 },
  { x: 57, z: 1 },
  { x: 42, z: 5 },
  { x: 24, z: 6 },
  { x: 12, z: 12 },
  { x: 6, z: 26 },
  { x: 11, z: 41 },
  { x: 6, z: 55 },
  { x: -10, z: 64 },
  { x: -34, z: 62 },
  { x: -56, z: 50 },
  { x: -67, z: 26 },
  { x: -66, z: -6 },
];
