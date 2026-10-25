import { AiDriver } from 'shared/aiDriver';
import { type CarInput, type CarState, createCar, DEFAULT_TUNING } from 'shared/carPhysics';
import { collideCars, collideWithWalls } from 'shared/collision';
import { gridPosition, PLAYER_COLORS } from 'shared/grid';
import { NO_INPUT, stepWithEffects } from 'shared/handling';
import { ItemSystem, type ItemEvent } from 'shared/items';
import { buildRamps, updateHeight } from 'shared/jumps';
import {
  CAR_FIELDS,
  NET_FOLDER,
  REMOTE,
  SEND_RATE,
  type ProfileMessage,
  type RaceStateMessage,
  type RecordsMessage,
  type UnlockedMessage,
} from 'shared/protocol';
import { buildRacingLine } from 'shared/racingLine';
import { distanceVolume, engineNote } from 'shared/sound';
import { gridStart, ROAD_TOP, trackById, TRACKS, trackPath, type TrackDef } from 'shared/tracks';
import { DEFAULT_VEHICLE, VEHICLES, type VehicleId } from 'shared/vehicles';
import { buildTrack } from './buildTrack';
import { CarModel, type CarPose } from './carModel';
import { DriveInput } from './driveInput';
import { FollowCamera } from './followCamera';
import { Hud } from './hud';
import { ItemViews } from './itemViews';
import { MeteorShower } from './meteors';
import { NetReadout } from './netReadout';
import { RecordsPanel } from './recordsPanel';
import { RemoteCars } from './remoteCars';
import { Sounds, type SoundName } from './sound';
import { SoundPanel } from './soundPanel';
import { VehiclePanel } from './vehiclePanel';
import { VoteMenu } from './voteMenu';
import { WeatherView } from './weather';

// The player's side of a race. Our own car is driven here, at a fixed 120 Hz as in rc-racer's main.ts,
// so it answers the controls instantly; the server is told where it is 20 times a second. So are the
// things that only touch our car: boost pads, oil, puddles and ramps. The server decides everything
// between cars (pickups, missiles, bombs, hits) and sends everyone else's cars (remoteCars.ts).
// Between races the car can be driven anywhere. Every device builds the track the server names.

const Players = game.GetService('Players');
const RunService = game.GetService('RunService');
const ReplicatedStorage = game.GetService('ReplicatedStorage');
const StarterGui = game.GetService('StarterGui');
const TextChatService = game.GetService('TextChatService');

// The HUD shows the standings, so the player list isn't needed.
StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false);

const STEP = 1 / 120;
/** A frame longer than this (a hitch, a paused debugger) doesn't fast-forward the car. */
const MAX_FRAME = 0.1;
/** A car that moved further than this in one step was put somewhere: drawn there, not slid there. */
const SNAP_DISTANCE = 2;

const me = Players.LocalPlayer;
const net = ReplicatedStorage.WaitForChild(NET_FOLDER);
const carStateRemote = net.WaitForChild(REMOTE.carState) as UnreliableRemoteEvent;
const snapshotRemote = net.WaitForChild(REMOTE.snapshot) as UnreliableRemoteEvent;
const raceStateRemote = net.WaitForChild(REMOTE.raceState) as RemoteEvent;
const useItemRemote = net.WaitForChild(REMOTE.useItem) as RemoteEvent;
const itemEventsRemote = net.WaitForChild(REMOTE.itemEvents) as RemoteEvent;
const voteRemote = net.WaitForChild(REMOTE.vote) as RemoteEvent;
const chooseVehicleRemote = net.WaitForChild(REMOTE.chooseVehicle) as RemoteEvent;
const profileRemote = net.WaitForChild(REMOTE.profile) as RemoteEvent;
const unlockedRemote = net.WaitForChild(REMOTE.unlocked) as RemoteEvent;
const recordsRemote = net.WaitForChild(REMOTE.records) as RemoteEvent;
const serverNow = () => game.Workspace.GetServerTimeNow();

/** The track this device has built: until the server names one, the first of the Classic Cup. */
let def: TrackDef = TRACKS[0];
let track = trackPath(def);
let trackFolder = buildTrack(track, def);
let ramps = buildRamps(track, def.layout.ramps ?? []);
const start = gridStart(track);
const car = createCar(start.x, start.z, start.heading);

/**
 * Our car's own items: boost pads, oil and puddles, and the timers for spins and boosts. Item boxes
 * are left out, because the server hands out items. Built from the race's seed, so the hazards are
 * where the server has them.
 */
const ownItems = (seed: number) => new ItemSystem(track, 1, { ...def.layout, pickups: [] }, seed);
let items = ownItems(1);

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
  car.y = 0;
  car.vy = 0;
  car.airborne = false;
  prev = poseOf(car);
}

/** Puts the car back on the centreline where it is, facing along the track, stopped. */
function resetCar() {
  const p = track.pointAt(track.project(car.x, car.z).distance);
  placeCar(createCar(p.x, p.z, math.atan2(p.tz, p.tx)));
}

while (!game.Workspace.CurrentCamera) task.wait();
const camera = new FollowCamera(game.Workspace.CurrentCamera);
/** The vehicle the player has picked, for their next race. */
let picked: VehicleId = DEFAULT_VEHICLE;
/** The server's latest word on the player's profile: the pick, what's unlocked, and whether it's saved. */
let profile: ProfileMessage | undefined;
/** Our car's colour: the player's own in a race, the first player colour until then. */
let myColor = Color3.fromHex(PLAYER_COLORS[0]);
let model = new CarModel(myColor, 'MyCar', picked);
const input = new DriveInput();
const sounds = new Sounds();
new SoundPanel(sounds);
const hud = new Hud();
const others = new RemoteCars();
const netReadout = NetReadout.forOwner();
const recordsPanel = new RecordsPanel();
recordsRemote.OnClientEvent.Connect((message: RecordsMessage) => recordsPanel.set(message));
let itemViews = new ItemViews(track, def.layout, ramps);
itemViews.setLayout(items);
const voteMenu = new VoteMenu((pick) => voteRemote.FireServer(pick));
const vehiclePanel = new VehiclePanel((vehicle) => {
  picked = vehicle;
  chooseVehicleRemote.FireServer(vehicle);
});
/** The results news for the latest cup, shown while that cup's final results are up. */
let news: string[] = [];
profileRemote.OnClientEvent.Connect((message: ProfileMessage) => {
  profile = message;
  picked = message.vehicle;
  // A send with no news (on joining, or after a vehicle pick) mustn't clear what a cup just earned.
  if (message.news.size() > 0) news = message.news;
});

/** How long to wait for chat's general channel before giving up on an unlock line (s). */
const CHAT_WAIT = 10;
let chatMissing = false;

/**
 * Shows a line in chat's general channel on this device. Each device gets the server's unlock message,
 * so everyone in the server sees it. Chat is set up a moment after the client starts, so the channel is waited for.
 */
function chatLine(text: string) {
  task.spawn(() => {
    const channels = TextChatService.WaitForChild('TextChannels', CHAT_WAIT) as Instance | undefined;
    const general = channels?.WaitForChild('RBXGeneral', CHAT_WAIT) as Instance | undefined;
    if (general && general.IsA('TextChannel')) general.DisplaySystemMessage(text);
    else if (!chatMissing) {
      chatMissing = true;
      warn('[chat] no general channel, so unlocks are not shown in chat');
    }
  });
}
unlockedRemote.OnClientEvent.Connect((message: UnlockedMessage) => {
  chatLine(`${message.name} unlocked the ${message.vehicle}!`);
});
camera.snapTo(car);

/** The track's weather and, on the Space Cup, meteors: purely for looks, re-seeded every race. */
const effectsFolder = new Instance('Folder');
effectsFolder.Name = 'Effects';
effectsFolder.Parent = game.Workspace;
let weather: WeatherView | undefined;
let meteors: MeteorShower | undefined;
function startEffects(seed: number) {
  weather?.destroy();
  meteors?.destroy();
  weather = def.theme.weather ? new WeatherView(def.theme.weather, effectsFolder, seed) : undefined;
  meteors = def.theme.meteors ? new MeteorShower(track, def.theme.ground, seed, effectsFolder) : undefined;
}
startEffects(1);

/** Tears down the track we're on and builds another, with the car at its start. */
function switchTrack(to: TrackDef) {
  if (to.id === def.id) return;
  def = to;
  track = trackPath(def);
  trackFolder.Destroy();
  trackFolder = buildTrack(track, def);
  ramps = buildRamps(track, def.layout.ramps ?? []);
  itemViews.destroy();
  itemViews = new ItemViews(track, def.layout, ramps);
  items = ownItems(1);
  itemViews.setLayout(items);
  const s = gridStart(track);
  placeCar(createCar(s.x, s.z, s.heading));
  camera.snapTo(car);
  startEffects(1);
}

let state: RaceStateMessage | undefined;
/** Our racer index in the current race, or -1 when we're not in it. */
let myIndex = -1;

const inRace = () =>
  state !== undefined &&
  myIndex >= 0 &&
  (state.phase === 'countdown' || state.phase === 'racing' || state.phase === 'results');

/** Where sounds are heard from: the car the camera follows. */
let listenerX = car.x;
let listenerZ = car.z;
const heardAt = (x: number, z: number) => distanceVolume(math.sqrt((x - listenerX) ** 2 + (z - listenerZ) ** 2));

const ITEM_SOUNDS: Partial<Record<ItemEvent['type'], SoundName>> = {
  pickup: 'pickup',
  fire: 'fire',
  drop: 'drop',
  explode: 'explode',
  boost: 'boost',
  splash: 'splash',
  slick: 'skid',
};

/** The laps we'd completed, and whether we'd finished, in the last race state: a change plays a jingle. */
let lapsBefore = 0;
let finishedBefore = false;

/** GO, and a jingle for each lap, the final lap and the finish, as the server's state says they happen. */
function playRaceSounds(before: RaceStateMessage | undefined, now: RaceStateMessage, newRace: boolean) {
  const laps = myIndex >= 0 ? now.laps[myIndex] ?? 0 : 0;
  const finished = myIndex >= 0 && (now.finishTimes[myIndex] ?? -1) >= 0;
  if (!newRace && myIndex >= 0) {
    if (before?.phase === 'countdown' && now.phase === 'racing') sounds.play('go');
    if (finished && !finishedBefore) sounds.play('finish');
    else if (!finished && laps > lapsBefore) sounds.play(laps === now.totalLaps - 1 ? 'finalLap' : 'lap');
  }
  lapsBefore = laps;
  finishedBefore = finished;
}

raceStateRemote.OnClientEvent.Connect((message: RaceStateMessage) => {
  const named = trackById(message.trackId);
  if (named) switchTrack(named);
  const newRace = state === undefined || message.raceId !== state.raceId;
  const before = state;
  state = message;
  myIndex = -1;
  message.racers.forEach((r, i) => {
    if (r.userId === me.UserId) myIndex = i;
  });
  playRaceSounds(before, message, newRace);

  if (message.racers.size() === 0) {
    others.clear();
  } else if (newRace) {
    others.setRacers(message.racers, myIndex, track);
    items = ownItems(message.seed);
    itemViews.setLayout(items);
    startEffects(message.raceId);
    if (myIndex >= 0) {
      placeCar(gridPosition(track, message.racers[myIndex].gridSlot));
      myColor = Color3.fromHex(message.racers[myIndex].color);
      model.setColor(myColor);
    }
  }
  itemViews.syncState(message.pickupsDown, message.bombs);
});

snapshotRemote.OnClientEvent.Connect((time: number, data: number[]) => {
  others.onSnapshot(time, data);
  netReadout?.onSnapshot(time);
  if (state) itemViews.onSnapshot(time, data, state.racers.size() * CAR_FIELDS);
});

itemEventsRemote.OnClientEvent.Connect((events: ItemEvent[]) => {
  for (const e of events) {
    // The server decided a missile or bomb got us: spin out here, on the car we drive.
    if (e.type === 'explode' && e.victim === myIndex && inRace()) items.hit(0, car);
    itemViews.onEvent(e);
    // Our own boosts, oil and puddles are heard from our own items (below), straight away.
    const ours = (e.type === 'boost' || e.type === 'slick' || e.type === 'splash') && e.racer === myIndex;
    const name = ITEM_SOUNDS[e.type];
    if (name && !ours) sounds.play(name, heardAt(e.x, e.z));
  }
});

let accumulator = 0;
let sinceSent = 0;
/** The countdown number last beeped, so each of 3, 2, 1 beeps once. */
let lastBeep = 0;

const speedOf = (c: CarState) => math.sqrt(c.vx * c.vx + c.vz * c.vz);

/**
 * Our engine, or the leader's while we watch a race (`leaderIndex`), and the nearest other car's,
 * fading with distance.
 */
function updateEngines(
  focus: CarState,
  leaderIndex: number | undefined,
  otherCars: Map<number, CarState>,
  dt: number,
  throttle: number,
  topSpeed: number,
) {
  sounds.engine('player', engineNote(speedOf(focus), leaderIndex === undefined ? throttle : 1, topSpeed), dt);
  let nearest: CarState | undefined;
  let nearestDistance = math.huge;
  for (const [i, other] of otherCars) {
    const d = math.sqrt((other.x - focus.x) ** 2 + (other.z - focus.z) ** 2);
    if (i !== leaderIndex && d < nearestDistance) {
      nearest = other;
      nearestDistance = d;
    }
  }
  if (!nearest) {
    sounds.quietEngine('rival', dt);
    return;
  }
  const theirs = engineNote(speedOf(nearest), 1, topSpeed);
  // Detuned a little from ours, so the two don't merge into one note.
  sounds.engine(
    'rival',
    { pitch: theirs.pitch * 1.07, volume: theirs.volume * 0.6 * math.max(0, 1 - nearestDistance / 40) },
    dt,
  );
}

/**
 * Studio only: with the Workspace attribute `Autopilot` on, the AI drives our car instead of the controls,
 * for playing a whole cup hands-free. Only the controls change, so the grid, finishing and reset work as
 * usual. The driver is rebuilt when the track or vehicle changes.
 */
let autopilot: AiDriver | undefined;
let autopilotFor = '';
function autopilotInput(vehicle: VehicleId, cars: Map<number, CarState>): CarInput {
  const key = `${def.id}/${vehicle}`;
  let driver = autopilot;
  if (!driver || autopilotFor !== key) {
    driver = new AiDriver(track, buildRacingLine(track, DEFAULT_TUNING), { pace: 0.97, steerGain: 2.4 }, VEHICLES[vehicle].tuning);
    autopilot = driver;
    autopilotFor = key;
  }
  const traffic: CarState[] = [];
  for (const [, other] of cars) traffic.push(other);
  return driver.drive(car, track.project(car.x, car.z), traffic, 1, STEP).input;
}

RunService.BindToRenderStep('Drive', Enum.RenderPriority.Camera.Value + 1, (frameDt) => {
  const now = serverNow();
  const racing = inRace();
  const phase = state?.phase;
  // On the grid until GO; after the line, the car rolls to a stop.
  const heldOnGrid = racing && phase === 'countdown';
  const finished = racing && state!.finishTimes[myIndex] >= 0;
  // Our car is the vehicle the server put us in for this race, or the one we've picked outside a race.
  const vehicle = racing ? state!.racers[myIndex].vehicle : picked;
  const tuning = VEHICLES[vehicle].tuning;

  if (!heldOnGrid && input.consumeReset()) resetCar();
  if (input.consumeFire() && racing && phase === 'racing' && !finished) useItemRemote.FireServer(state!.raceId);
  const otherCars = others.update(now, frameDt, ROAD_TOP);
  const autopilotOn = RunService.IsStudio() && game.Workspace.GetAttribute('Autopilot') === true;
  const wanted = autopilotOn ? autopilotInput(vehicle, otherCars) : input.carInput();
  const controls = heldOnGrid || finished ? NO_INPUT : wanted;

  accumulator += math.min(frameDt, MAX_FRAME);
  while (accumulator >= STEP) {
    prev = poseOf(car);
    if (!heldOnGrid) {
      stepWithEffects(car, controls, STEP, tuning, items.status[0]);
      // Bumps move only our car; the other car's device (or the server, for AI) moves theirs.
      if (racing) for (const [, other] of otherCars) collideCars(car, { ...other });
      const proj = collideWithWalls(car, track, STEP).proj;
      const jump = updateHeight(car, proj, ramps, track.length, STEP);
      if (jump) sounds.play(jump);
      items.update(STEP, [car], [proj]);
    }
    accumulator -= STEP;
  }
  for (const e of items.drainEvents()) {
    const name = ITEM_SOUNDS[e.type];
    if (name) sounds.play(name);
  }

  // 3, 2, 1 on the grid; GO comes with the state that starts the race.
  if (heldOnGrid) {
    const n = math.ceil(state!.phaseEndsAt - now);
    if (n !== lastBeep && n >= 1 && n <= 3) sounds.play('beep');
    lastBeep = n;
  } else lastBeep = 0;

  sinceSent += frameDt;
  if (racing && (phase === 'racing' || phase === 'results') && sinceSent >= 1 / SEND_RATE) {
    // Keep the remainder, as the server does with snapshots, so reports go out a steady 20 times a second.
    sinceSent = math.min(sinceSent - 1 / SEND_RATE, 1 / SEND_RATE);
    carStateRemote.FireServer(state!.raceId, now, car.x, car.z, car.heading, car.steer, car.vx, car.vz, car.y);
  }

  // A different vehicle for our car: build its model in place of the old one.
  if (vehicle !== model.vehicle) {
    model.destroy();
    model = new CarModel(myColor, 'MyCar', vehicle);
  }
  const pose = blend(prev, car, accumulator / STEP);
  model.place({ ...pose, y: pose.y + ROAD_TOP });
  itemViews.update(frameDt, now);

  // Watching a race we're not in: follow the leader.
  const leaderIndex = !racing && state && state.standings.size() > 0 ? state.standings[0] : undefined;
  const leader = leaderIndex !== undefined ? others.shownCar(leaderIndex) : undefined;
  const focus = leader ?? car;
  listenerX = focus.x;
  listenerZ = focus.z;
  // The throttle the player is pressing, so they can rev on the grid.
  updateEngines(focus, leader ? leaderIndex : undefined, otherCars, frameDt, wanted.throttle, tuning.maxSpeed);
  camera.update(focus, frameDt);
  weather?.update(frameDt, focus.x, focus.z);
  meteors?.update(frameDt, focus.x, focus.z);
  // The cup's news is only for its final results, so it's dropped as soon as those are over.
  if (!state?.cupFinal) news = [];
  hud.update(state, myIndex, now, def.name, recordsPanel.chaseLine(def.id), recordsPanel.newBestLine(def.id), news);
  recordsPanel.update(state, def.name);
  voteMenu.update(state, profile?.trophies ?? {});
  vehiclePanel.update(state, picked, profile?.unlocked ?? [DEFAULT_VEHICLE], profile?.available ?? true);
  netReadout?.update(frameDt, state);
});
