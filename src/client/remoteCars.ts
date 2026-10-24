import type { CarState } from 'shared/carPhysics';
import { gridPosition } from 'shared/grid';
import { CAR_FIELDS, type RacerView } from 'shared/protocol';
import type { TrackPath } from 'shared/trackPath';
import { CarModel, type CarPose } from './carModel';

// Everyone else's cars: AI and other players. The server sends where every car is 20 times a
// second. Each car is drawn where its latest report puts it now (moved on by its velocity for the
// time since), easing towards that so corrections don't jump. Bumps use the same positions, so a
// car is hit where it's seen.

/** Don't carry a car on by its velocity for longer than this without a report. */
const MAX_EXTRAPOLATE = 0.25;
/** How fast (1/s) a drawn car closes any gap to where it should be, after moving at its own speed. */
const SMOOTHING = 14;
/** A car further than this from where it should be was put somewhere: drawn there, not slid there. */
const SNAP_DISTANCE = 4;

interface Remote {
  model: CarModel;
  /** Where it's drawn. */
  shown: CarState;
  /** Where it is now, as best we know. */
  now: CarState;
}

const angleDiff = (a: number, b: number) => math.atan2(math.sin(a - b), math.cos(a - b));

export class RemoteCars {
  private readonly cars = new Map<number, Remote>();
  private latestTime = -math.huge;
  private latest: number[] = [];

  constructor(private readonly track: TrackPath) {}

  /** A new race: one car per racer except ours, waiting on its grid slot. */
  setRacers(racers: RacerView[], myIndex: number): void {
    this.clear();
    racers.forEach((r, i) => {
      if (i === myIndex) return;
      const model = new CarModel(Color3.fromHex(r.color), r.name);
      model.setLabel(r.name);
      const start = gridPosition(this.track, r.gridSlot);
      this.cars.set(i, { model, shown: { ...start }, now: { ...start } });
    });
  }

  clear(): void {
    for (const [, remote] of this.cars) remote.model.destroy();
    this.cars.clear();
    this.latestTime = -math.huge;
    this.latest = [];
  }

  onSnapshot(time: number, data: number[]): void {
    // Unreliable messages can arrive out of order: keep only the newest.
    if (time <= this.latestTime) return;
    this.latestTime = time;
    this.latest = data;
  }

  /** Every other car where it is now, by racer index: what our car can bump into. */
  update(serverNow: number, dt: number, roadTop: number): Map<number, CarState> {
    const age = math.clamp(serverNow - this.latestTime, 0, MAX_EXTRAPOLATE);
    const k = 1 - math.exp(-SMOOTHING * dt);
    const result = new Map<number, CarState>();
    for (const [i, remote] of this.cars) {
      const base = i * CAR_FIELDS;
      if (this.latest.size() >= base + CAR_FIELDS) {
        const [x, z, heading, steer, vx, vz] = [
          this.latest[base],
          this.latest[base + 1],
          this.latest[base + 2],
          this.latest[base + 3],
          this.latest[base + 4],
          this.latest[base + 5],
        ];
        const now = remote.now;
        now.x = x + vx * age;
        now.z = z + vz * age;
        now.heading = heading;
        now.steer = steer;
        now.vx = vx;
        now.vz = vz;
      }
      const { shown, now } = remote;
      // Carry the drawn car along at its own speed, then ease out only what's left over. Easing the
      // whole move would leave a moving car drawn behind where it is (v / SMOOTHING, nearly a car
      // length at top speed), and cars would overlap on screen without touching.
      shown.x += now.vx * dt;
      shown.z += now.vz * dt;
      if (math.sqrt((now.x - shown.x) ** 2 + (now.z - shown.z) ** 2) > SNAP_DISTANCE) {
        shown.x = now.x;
        shown.z = now.z;
        shown.heading = now.heading;
      } else {
        shown.x += (now.x - shown.x) * k;
        shown.z += (now.z - shown.z) * k;
        shown.heading += angleDiff(now.heading, shown.heading) * k;
      }
      shown.steer += (now.steer - shown.steer) * k;
      const pose: CarPose = { x: shown.x, y: roadTop, z: shown.z, heading: shown.heading, steer: shown.steer };
      remote.model.place(pose);
      result.set(i, now);
    }
    return result;
  }

  /** Where a car is drawn, to point the camera at it. */
  shownCar(index: number): CarState | undefined {
    return this.cars.get(index)?.shown;
  }
}
