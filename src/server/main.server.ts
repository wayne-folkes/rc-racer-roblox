import { DEFAULT_TUNING } from 'shared/carPhysics';
import { GRID_SIZE } from 'shared/grid';
import { COUNTDOWN_SECONDS, TOTAL_LAPS } from 'shared/race';
import { RaceSim, type Entrant } from 'shared/raceSim';
import { CAR_FIELDS, NET_FOLDER, NEXT_LOBBY_SECONDS, REMOTE, SEND_RATE, type Phase, type RaceStateMessage } from 'shared/protocol';
import { MEADOW_LOOP, trackPath } from 'shared/tracks';

// Runs the races: a lobby timer, then a race on the grid with AI filling the slots players don't
// take, results, and round again. Everyone in the server when the lobby timer runs out races (up to
// GRID_SIZE); anyone who joins later watches until the next one.

const Players = game.GetService('Players');
const RunService = game.GetService('RunService');
const ReplicatedStorage = game.GetService('ReplicatedStorage');

/** The wait for the first race, so friends have time to join. */
const FIRST_LOBBY_SECONDS = 20;
const RESULTS_SECONDS = 10;
/** Once the first player finishes, the rest have this long before the race ends. */
const FINISH_GRACE_SECONDS = 30;
const STEP = 1 / 120;
const STATE_INTERVAL = 0.25;
/**
 * A report that moves a car faster than this (studs/s, plus RESET_ALLOWANCE) is ignored, so a device
 * can't teleport its car round the track.
 */
const MAX_REPORTED_SPEED = DEFAULT_TUNING.maxSpeed * 1.6;
/** A reset moves a car back onto the centreline: at most about half the road's width. */
const RESET_ALLOWANCE = 4;

const net = new Instance('Folder');
net.Name = NET_FOLDER;
const carStateRemote = new Instance('UnreliableRemoteEvent');
carStateRemote.Name = REMOTE.carState;
carStateRemote.Parent = net;
const snapshotRemote = new Instance('UnreliableRemoteEvent');
snapshotRemote.Name = REMOTE.snapshot;
snapshotRemote.Parent = net;
const raceStateRemote = new Instance('RemoteEvent');
raceStateRemote.Name = REMOTE.raceState;
raceStateRemote.Parent = net;
net.Parent = ReplicatedStorage;

const track = trackPath(MEADOW_LOOP);
const now = () => game.Workspace.GetServerTimeNow();

/** Players in the order they joined: the earliest get places on the grid first. */
const joined: Player[] = [];
let phase: Phase = 'waiting';
let phaseEndsAt = 0;
let sim: RaceSim | undefined;
let raceId = 0;
let goAt = 0;
/** Each player car's last accepted report, by racer index, for the speed check. */
const lastReport = new Map<number, { t: number; x: number; z: number }>();

function stateMessage(): RaceStateMessage {
  return {
    phase,
    phaseEndsAt,
    raceId,
    racers: sim
      ? sim.racers.map((r) => ({ name: r.name, color: r.color, gridSlot: r.gridSlot, userId: r.userId }))
      : [],
    totalLaps: sim ? sim.race.totalLaps : TOTAL_LAPS,
    goAt,
    laps: sim ? sim.race.racers.map((p) => p.lapsCompleted) : [],
    standings: sim ? sim.race.standings() : [],
    finishTimes: sim ? [...sim.race.finishTimes] : [],
    playerCount: joined.size(),
  };
}

const broadcastState = () => raceStateRemote.FireAllClients(stateMessage());

function enterPhase(to: Phase, seconds = 0) {
  phase = to;
  phaseEndsAt = seconds > 0 ? now() + seconds : 0;
  broadcastState();
}

function startRace() {
  const entrants: Entrant[] = [];
  for (const p of joined) {
    if (entrants.size() < GRID_SIZE) entrants.push({ name: p.DisplayName, userId: p.UserId });
  }
  raceId++;
  sim = new RaceSim(track, entrants);
  lastReport.clear();
  goAt = now() + COUNTDOWN_SECONDS;
  enterPhase('countdown', COUNTDOWN_SECONDS);
}

function raceOver(s: RaceSim): boolean {
  if (s.playersRacing() === 0 || s.playersFinished()) return true;
  const first = s.firstPlayerFinish();
  return first !== undefined && s.race.clock - first >= FINISH_GRACE_SECONDS;
}

function addPlayer(player: Player) {
  joined.push(player);
  if (phase === 'waiting') enterPhase('lobby', FIRST_LOBBY_SECONDS);
  else broadcastState();
}

Players.PlayerAdded.Connect(addPlayer);
for (const p of Players.GetPlayers()) addPlayer(p);

Players.PlayerRemoving.Connect((player) => {
  const i = joined.indexOf(player);
  if (i >= 0) joined.remove(i);
  if (sim) {
    const index = sim.indexOf(player.UserId);
    if (index >= 0) sim.standIn(index);
  }
  if (phase === 'lobby' && joined.size() === 0) enterPhase('waiting');
  else broadcastState();
});

const isNumber = (v: unknown): v is number => typeIs(v, 'number') && v === v;

carStateRemote.OnServerEvent.Connect((player, id, x, z, heading, steer, vx, vz) => {
  if (!sim || id !== raceId || (phase !== 'racing' && phase !== 'results')) return;
  if (!isNumber(x) || !isNumber(z) || !isNumber(heading) || !isNumber(steer) || !isNumber(vx) || !isNumber(vz)) return;
  const index = sim.indexOf(player.UserId);
  if (index < 0) return;

  const t = os.clock();
  const last = lastReport.get(index);
  if (last) {
    const moved = math.sqrt((x - last.x) ** 2 + (z - last.z) ** 2);
    if (moved > MAX_REPORTED_SPEED * (t - last.t) + RESET_ALLOWANCE) return;
  }
  lastReport.set(index, { t, x, z });
  sim.reportCar(index, { x, z, heading, steer: math.clamp(steer, -1, 1), vx, vz });
});

let accumulator = 0;
let sinceSnapshot = 0;
let sinceState = 0;

RunService.Heartbeat.Connect((dt) => {
  const t = now();
  if (phase === 'lobby' && t >= phaseEndsAt) startRace();

  if (sim) {
    accumulator += math.min(dt, 0.1);
    while (accumulator >= STEP) {
      sim.step(STEP);
      accumulator -= STEP;
    }

    if (phase === 'countdown' && sim.race.phase !== 'countdown') enterPhase('racing');
    else if (phase === 'racing' && raceOver(sim)) enterPhase('results', RESULTS_SECONDS);
    else if (phase === 'results' && t >= phaseEndsAt) {
      sim = undefined;
      goAt = 0;
      if (joined.size() > 0) enterPhase('lobby', NEXT_LOBBY_SECONDS);
      else enterPhase('waiting');
    }
  }

  sinceSnapshot += dt;
  if (sim && sinceSnapshot >= 1 / SEND_RATE) {
    sinceSnapshot = 0;
    const data: number[] = [];
    for (const { car } of sim.racers) data.push(car.x, car.z, car.heading, car.steer, car.vx, car.vz);
    if (data.size() === sim.racers.size() * CAR_FIELDS) snapshotRemote.FireAllClients(t, data);
  }

  sinceState += dt;
  if (sinceState >= STATE_INTERVAL) {
    sinceState = 0;
    broadcastState();
  }
});
