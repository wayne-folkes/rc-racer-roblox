import type { CarState } from 'shared/carPhysics';

// rc-racer's followCamera.ts: a fixed 3/4 view from the south-west that trails the car and looks a
// little ahead. Roblox has no orthographic camera, so a narrow lens from far away stands in for one.

/** World units visible vertically on screen (the shorter side, on a portrait phone). */
const VIEW_HEIGHT = 36;
/** Direction from the target to the camera, as on the web. */
const OFFSET_DIR = new Vector3(-0.55, 1.1, 1).Unit;
/** How far away the camera sits. Further means flatter, more like the web's orthographic view. */
const DISTANCE = 300;
/** Seconds of velocity to look ahead, so you see more of the road you're heading into. */
const LOOK_AHEAD = 0.45;
const FOLLOW_RATE = 5;

export class FollowCamera {
  private targetX = 0;
  private targetZ = 0;

  constructor(private readonly camera: Camera) {}

  snapTo(car: CarState): void {
    this.targetX = car.x;
    this.targetZ = car.z;
    this.apply();
  }

  update(car: CarState, dt: number): void {
    const goalX = car.x + car.vx * LOOK_AHEAD;
    const goalZ = car.z + car.vz * LOOK_AHEAD;
    const k = 1 - math.exp(-FOLLOW_RATE * dt);
    this.targetX += (goalX - this.targetX) * k;
    this.targetZ += (goalZ - this.targetZ) * k;
    this.apply();
  }

  private apply(): void {
    // The default camera scripts can take the camera back; keep it ours.
    if (this.camera.CameraType !== Enum.CameraType.Scriptable) this.camera.CameraType = Enum.CameraType.Scriptable;

    const viewport = this.camera.ViewportSize;
    const aspect = viewport.Y > 0 ? viewport.X / viewport.Y : 1;
    const viewHeight = aspect >= 1 ? VIEW_HEIGHT : VIEW_HEIGHT / aspect;
    this.camera.FieldOfView = math.deg(2 * math.atan(viewHeight / 2 / DISTANCE));

    const target = new Vector3(this.targetX, 0, this.targetZ);
    this.camera.CFrame = CFrame.lookAt(target.add(OFFSET_DIR.mul(DISTANCE)), target);
  }
}
