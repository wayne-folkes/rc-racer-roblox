import type { CarState } from './carPhysics';
import type { TrackPath } from './trackPath';

// Where a car will be a little after we last heard from it. Updates over a phone's connection can be
// held up for most of a second and then arrive in a bunch (0.68 s seen on a phone over wifi), so a
// car has to be carried on for that long. Carried in a straight line, a car on a bend would run wide
// into the wall and then jump back when the next update came; here it goes round the track instead,
// at its speeds along and across the track, turning with the road and stopping at the walls.

/** The longest a car is carried on without an update (s); after that it waits where it is. */
export const MAX_CARRY = 1;

type Pose = Pick<CarState, 'x' | 'z' | 'heading' | 'vx' | 'vz'>;

/** A car's last known state and where that puts it on the track, worked out once per update. */
export interface Anchor {
  state: Pose;
  /** Distance along the centreline, and sideways offset from it (positive to the right). */
  distance: number;
  lateral: number;
  /** Speeds along the track (negative going backwards) and across it (positive to the right). */
  along: number;
  across: number;
  /** Direction of the track there. */
  trackHeading: number;
}

export function anchorOf(track: TrackPath, state: Pose): Anchor {
  const proj = track.project(state.x, state.z);
  return {
    state: { x: state.x, z: state.z, heading: state.heading, vx: state.vx, vz: state.vz },
    distance: proj.distance,
    lateral: proj.lateral,
    along: state.vx * proj.tx + state.vz * proj.tz,
    across: state.vx * -proj.tz + state.vz * proj.tx,
    trackHeading: math.atan2(proj.tz, proj.tx),
  };
}

/** Sets `out`'s position, heading and velocity to where the anchored car is `seconds` later. */
export function carry(track: TrackPath, anchor: Anchor, seconds: number, out: Pose): void {
  const p = track.pointAt(anchor.distance + anchor.along * seconds);
  // A car already outside the walls (put there between races) isn't pulled in, only kept from going further.
  const limit = math.max(track.halfWidth, math.abs(anchor.lateral));
  const lateral = math.clamp(anchor.lateral + anchor.across * seconds, -limit, limit);
  // Right of travel is (-tz, tx), as in trackPath.ts.
  out.x = p.x - p.tz * lateral;
  out.z = p.z + p.tx * lateral;
  // Heading and velocity turn with the road. Headings are atan2(z, x), as the track's is.
  const turn = math.atan2(p.tz, p.tx) - anchor.trackHeading;
  const c = math.cos(turn);
  const s = math.sin(turn);
  const { heading, vx, vz } = anchor.state;
  out.heading = heading + math.atan2(s, c);
  out.vx = vx * c - vz * s;
  out.vz = vx * s + vz * c;
}
