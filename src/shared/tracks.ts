import { DEMO_TRACK, TrackPath, type Point } from './trackPath';

// The one track the spike drives, with Meadow Loop's numbers from rc-racer's tracks.ts.

export interface TrackDef {
  name: string;
  halfWidth: number;
  controlPoints: Point[];
  theme: { ground: string; road: string };
}

export const MEADOW_LOOP: TrackDef = {
  name: 'Meadow Loop',
  halfWidth: 5.5,
  controlPoints: DEMO_TRACK,
  theme: { ground: '#6fbf5a', road: '#4a4f5a' },
};

/** Height of the road surface the cars sit on, just above the ground plane at 0. */
export const ROAD_TOP = 0.05;

export const trackPath =(def: TrackDef) => new TrackPath(def.controlPoints, def.halfWidth);

/** How far behind the start line the car starts, along the centreline. */
const GRID_BACK = 8;

/** Where the car starts: on the centreline behind the start line, facing along the track. */
export function gridStart(track: TrackPath) {
  const p = track.pointAt(-GRID_BACK);
  return { x: p.x, z: p.z, heading: math.atan2(p.tz, p.tx) };
}
