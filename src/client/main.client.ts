import { createCar, stepCar, type CarState } from 'shared/carPhysics';
import { collideWithWalls } from 'shared/collision';
import { gridStart, MEADOW_LOOP, ROAD_TOP, trackPath } from 'shared/tracks';
import { CarModel, type CarPose } from './carModel';
import { DriveInput } from './driveInput';
import { FollowCamera } from './followCamera';

// Drives one car round Meadow Loop on the player's device. Physics runs at a fixed 120 Hz, as in
// rc-racer's main.ts, and each frame draws the car part of the way between the last two steps.

const RunService = game.GetService('RunService');
const StarterGui = game.GetService('StarterGui');

// A one-player race has no use for the player list in the corner.
StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false);

const STEP = 1 / 120;
/** A frame longer than this (a hitch, a paused debugger) doesn't fast-forward the car. */
const MAX_FRAME = 0.1;
/** A car that moved further than this in one step was put somewhere: drawn there, not slid there. */
const SNAP_DISTANCE = 2;

const track = trackPath(MEADOW_LOOP);
const start = gridStart(track);
const car = createCar(start.x, start.z, start.heading);

const poseOf = (c: CarState): CarPose => ({ x: c.x, y: c.y, z: c.z, heading: c.heading, steer: c.steer });
let prev = poseOf(car);

function blend(from: CarPose, to: CarState, alpha: number): CarPose {
  if (math.sqrt((to.x - from.x) ** 2 + (to.z - from.z) ** 2) > SNAP_DISTANCE) return poseOf(to);
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  return {
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    z: lerp(from.z, to.z),
    heading: lerp(from.heading, to.heading),
    steer: lerp(from.steer, to.steer),
  };
}

/** Puts the car back on the centreline where it is, facing along the track, stopped. */
function resetCar() {
  const p = track.pointAt(track.project(car.x, car.z).distance);
  car.x = p.x;
  car.z = p.z;
  car.heading = math.atan2(p.tz, p.tx);
  car.vx = 0;
  car.vz = 0;
  car.steer = 0;
  prev = poseOf(car);
}

while (!game.Workspace.CurrentCamera) task.wait();
const camera = new FollowCamera(game.Workspace.CurrentCamera);
const model = new CarModel();
const input = new DriveInput();
camera.snapTo(car);

let accumulator = 0;
RunService.BindToRenderStep('Drive', Enum.RenderPriority.Camera.Value + 1, (frameDt) => {
  if (input.consumeReset()) resetCar();

  const controls = input.carInput();
  accumulator += math.min(frameDt, MAX_FRAME);
  while (accumulator >= STEP) {
    prev = poseOf(car);
    stepCar(car, controls, STEP);
    collideWithWalls(car, track, STEP);
    accumulator -= STEP;
  }

  const pose = blend(prev, car, accumulator / STEP);
  model.place({ ...pose, y: pose.y + ROAD_TOP });
  camera.update(car, frameDt);
});
