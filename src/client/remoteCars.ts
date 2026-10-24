import type { CarState } from 'shared/carPhysics';
import { anchorOf, carry, MAX_CARRY, type Anchor } from 'shared/carry';
import { gridPosition } from 'shared/grid';
import { CAR_FIELDS, type RacerView } from 'shared/protocol';
import type { TrackPath } from 'shared/trackPath';
import { CarModel, type CarPose } from './carModel';

// Everyone else's cars: AI and other players. The server sends where every car is 20 times a
// second. Each car is drawn where its latest report puts it now (carried on round the track for the
// time since, carry.ts), easing towards that so corrections don't jump. Bumps use the same positions,
// so a car is hit where it's seen. A phone's snapshots can stop for most of a second and then arrive
// in a bunch; the cars keep going round meanwhile.

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
  /** Where the latest snapshot put it, on the track. */
  anchor: Anchor | undefined;
}

const angleDiff = (a: number, b: number) => math.atan2(math.sin(a - b), math.cos(a - b));

export class RemoteCars {
  private readonly cars = new Map<number, Remote>();
  private latestTime = -math.huge;
  private track: TrackPath | undefined;

  /** A new race: one car per racer except ours, waiting on its grid slot on `track`. */
  setRacers(racers: RacerView[], myIndex: number, track: TrackPath): void {
    this.clear();
    this.track = track;
    racers.forEach((r, i) => {
      if (i === myIndex) return;
      const model = new CarModel(Color3.fromHex(r.color), r.name);
      model.setLabel(r.name);
      const start = gridPosition(track, r.gridSlot);
      this.cars.set(i, { model, shown: { ...start }, now: { ...start }, anchor: undefined });
    });
  }

  clear(): void {
    for (const [, remote] of this.cars) remote.model.destroy();
    this.cars.clear();
    this.latestTime = -math.huge;
  }

  onSnapshot(time: number, data: number[]): void {
    // Unreliable messages can arrive out of order: keep only the newest.
    if (time <= this.latestTime || !this.track) return;
    this.latestTime = time;
    for (const [i, remote] of this.cars) {
      const base = i * CAR_FIELDS;
      if (data.size() < base + CAR_FIELDS) continue;
      const [x, z, heading, steer, vx, vz, y] = [
        data[base],
        data[base + 1],
        data[base + 2],
        data[base + 3],
        data[base + 4],
        data[base + 5],
        data[base + 6],
      ];
      remote.anchor = anchorOf(this.track, { x, z, heading, vx, vz });
      remote.now.steer = steer;
      remote.now.y = y;
    }
  }

  /** Every other car where it is now, by racer index: what our car can bump into. */
  update(serverNow: number, dt: number, roadTop: number): Map<number, CarState> {
    const age = math.clamp(serverNow - this.latestTime, 0, MAX_CARRY);
    const k = 1 - math.exp(-SMOOTHING * dt);
    const result = new Map<number, CarState>();
    for (const [i, remote] of this.cars) {
      if (remote.anchor && this.track) carry(this.track, remote.anchor, age, remote.now);
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
      // Height isn't carried on: a jump is short, and the ease keeps it smooth.
      shown.y += (now.y - shown.y) * k;
      const pose: CarPose = { x: shown.x, y: roadTop + shown.y, z: shown.z, heading: shown.heading, steer: shown.steer };
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
