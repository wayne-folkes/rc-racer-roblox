import { createCar, stepCar, type CarInput, type CarState } from 'shared/carPhysics';
import { collideCars, collideWithWalls } from 'shared/collision';
import { gridPosition, PLAYER_COLORS } from 'shared/grid';
import { NET_FOLDER, REMOTE, SEND_RATE, type RaceStateMessage } from 'shared/protocol';
import { gridStart, MEADOW_LOOP, ROAD_TOP, trackPath } from 'shared/tracks';
import { buildTrack } from './buildTrack';
import { CarModel, type CarPose } from './carModel';
import { DriveInput } from './driveInput';
import { FollowCamera } from './followCamera';
import { Hud } from './hud';
import { RemoteCars } from './remoteCars';

// The player's side of a race. Our own car is driven here, at a fixed 120 Hz as in rc-racer's main.ts,
// so it answers the controls instantly; the server is told where it is 20 times a second. Everyone
// else's cars come from the server (remoteCars.ts). Between races the car can be driven anywhere.

const Players = game.GetService('Players');
const RunService = game.GetService('RunService');
const ReplicatedStorage = game.GetService('ReplicatedStorage');
const StarterGui = game.GetService('StarterGui');

// The HUD shows the standings, so the player list isn't needed.
StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false);

const STEP = 1 / 120;
/** A frame longer than this (a hitch, a paused debugger) doesn't fast-forward the car. */
const MAX_FRAME = 0.1;
/** A car that moved further than this in one step was put somewhere: drawn there, not slid there. */
const SNAP_DISTANCE = 2;
const NO_INPUT: CarInput = { throttle: 0, steer: 0, handbrake: false };

const me = Players.LocalPlayer;
const net = ReplicatedStorage.WaitForChild(NET_FOLDER);
const carStateRemote = net.WaitForChild(REMOTE.carState) as UnreliableRemoteEvent;
const snapshotRemote = net.WaitForChild(REMOTE.snapshot) as UnreliableRemoteEvent;
const raceStateRemote = net.WaitForChild(REMOTE.raceState) as RemoteEvent;
const serverNow = () => game.Workspace.GetServerTimeNow();

const track = trackPath(MEADOW_LOOP);
buildTrack(track, MEADOW_LOOP);
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

function placeCar(state: CarState) {
  car.x = state.x;
  car.z = state.z;
  car.heading = state.heading;
  car.vx = 0;
  car.vz = 0;
  car.steer = 0;
  prev = poseOf(car);
}

/** Puts the car back on the centreline where it is, facing along the track, stopped. */
function resetCar() {
  const p = track.pointAt(track.project(car.x, car.z).distance);
  placeCar(createCar(p.x, p.z, math.atan2(p.tz, p.tx)));
}

while (!game.Workspace.CurrentCamera) task.wait();
const camera = new FollowCamera(game.Workspace.CurrentCamera);
const model = new CarModel(Color3.fromHex(PLAYER_COLORS[0]), 'MyCar');
const input = new DriveInput();
const hud = new Hud();
const others = new RemoteCars(track);
camera.snapTo(car);

let state: RaceStateMessage | undefined;
/** Our racer index in the current race, or -1 when we're not in it. */
let myIndex = -1;

raceStateRemote.OnClientEvent.Connect((message: RaceStateMessage) => {
  const newRace = state === undefined || message.raceId !== state.raceId;
  state = message;
  myIndex = -1;
  message.racers.forEach((r, i) => {
    if (r.userId === me.UserId) myIndex = i;
  });

  if (message.racers.size() === 0) {
    others.clear();
  } else if (newRace) {
    others.setRacers(message.racers, myIndex);
    if (myIndex >= 0) {
      placeCar(gridPosition(track, message.racers[myIndex].gridSlot));
      model.setColor(Color3.fromHex(message.racers[myIndex].color));
    }
  }
});

snapshotRemote.OnClientEvent.Connect((time: number, data: number[]) => others.onSnapshot(time, data));

let accumulator = 0;
let sinceSent = 0;

RunService.BindToRenderStep('Drive', Enum.RenderPriority.Camera.Value + 1, (frameDt) => {
  const now = serverNow();
  const phase = state?.phase;
  const inRace = state !== undefined && myIndex >= 0 && (phase === 'countdown' || phase === 'racing' || phase === 'results');
  // On the grid until GO; after the line, the car rolls to a stop.
  const heldOnGrid = inRace && phase === 'countdown';
  const finished = inRace && state!.finishTimes[myIndex] >= 0;

  if (!heldOnGrid && input.consumeReset()) resetCar();
  const controls = heldOnGrid || finished ? NO_INPUT : input.carInput();

  const otherCars = others.update(now, frameDt, ROAD_TOP);

  accumulator += math.min(frameDt, MAX_FRAME);
  while (accumulator >= STEP) {
    prev = poseOf(car);
    if (!heldOnGrid) {
      stepCar(car, controls, STEP);
      // Bumps move only our car; the other car's device (or the server, for AI) moves theirs.
      if (inRace) for (const [, other] of otherCars) collideCars(car, { ...other });
      collideWithWalls(car, track, STEP);
    }
    accumulator -= STEP;
  }

  sinceSent += frameDt;
  if (inRace && (phase === 'racing' || phase === 'results') && sinceSent >= 1 / SEND_RATE) {
    sinceSent = 0;
    carStateRemote.FireServer(state!.raceId, car.x, car.z, car.heading, car.steer, car.vx, car.vz);
  }

  const pose = blend(prev, car, accumulator / STEP);
  model.place({ ...pose, y: pose.y + ROAD_TOP });

  // Watching a race we're not in: follow the leader.
  const leader = !inRace && state && state.standings.size() > 0 ? others.shownCar(state.standings[0]) : undefined;
  camera.update(leader ?? car, frameDt);
  hud.update(state, myIndex, now);
});
