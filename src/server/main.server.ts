import { countVotes, Cup, voteOptions, winningOption, type Scorer, type VoteOption } from 'shared/cup';
import { GRID_SIZE } from 'shared/grid';
import { COUNTDOWN_SECONDS, NOT_FINISHED, TOTAL_LAPS } from 'shared/race';
import { RaceSim, type Entrant } from 'shared/raceSim';
import {
  MAX_REPORT_AGE,
  NET_FOLDER,
  REMOTE,
  SEND_RATE,
  type Phase,
  type RaceStateMessage,
  type RecordsMessage,
} from 'shared/protocol';
import { fastestPossible, NO_TIME, type RecordKind } from 'shared/records';
import type { TrackPath } from 'shared/trackPath';
import { trackById, TRACKS, trackPath, type CircuitId, type TrackDef } from 'shared/tracks';
import { DEFAULT_VEHICLE, isVehicleId, VEHICLE_IDS, VEHICLES, type VehicleId } from 'shared/vehicles';
import { RecordBook } from './records';

// Runs the races. Players vote between the four cups and two quick races; a cup is four races with
// points for every place (shared/cup.ts), a quick race is one. Each race has AI filling the grid
// slots players don't take, then results, and on to the next race of the cup or the next vote.
// Everyone in the server when a race starts races (up to GRID_SIZE); anyone who joins later watches
// until the next one, and joins a cup with no points.

const Players = game.GetService('Players');
const RunService = game.GetService('RunService');
const ReplicatedStorage = game.GetService('ReplicatedStorage');

/** The first vote is longer, so friends have time to join. */
const FIRST_VOTE_SECONDS = 20;
const VOTE_SECONDS = 15;
/** The wait between the races of a cup. */
const LOBBY_SECONDS = 10;
const RESULTS_SECONDS = 10;
/** The results after a cup's last race stay up longer: they're the cup's final standings. */
const CUP_RESULTS_SECONDS = 15;
/** Once the first player finishes, the rest have this long before the race ends. */
const FINISH_GRACE_SECONDS = 30;
const STEP = 1 / 120;
const STATE_INTERVAL = 0.25;
/**
 * A report that moves a car faster than this (studs/s, plus RESET_ALLOWANCE) is ignored, so a device
 * can't teleport its car round the track. That's 1.6× the fastest vehicle's top speed, so a faster
 * vehicle added later isn't rejected.
 */
const MAX_REPORTED_SPEED =
  VEHICLE_IDS.reduce((fastest, id) => math.max(fastest, VEHICLES[id].tuning.maxSpeed), 0) * 1.6;
/** A reset moves a car back onto the centreline: at most about half the road's width. */
const RESET_ALLOWANCE = 4;
/** Highest a reported car can be: a fast car off a ramp peaks a little under 2 studs up. */
const MAX_REPORTED_HEIGHT = 4;
/** Missiles sent per snapshot, to stay well under the 900-byte limit on unreliable messages. */
const MAX_SNAPSHOT_MISSILES = 8;

const net = new Instance('Folder');
net.Name = NET_FOLDER;
const carStateRemote = new Instance('UnreliableRemoteEvent');
carStateRemote.Name = REMOTE.carState;
carStateRemote.Parent = net;
const snapshotRemote = new Instance('UnreliableRemoteEvent');
snapshotRemote.Name = REMOTE.snapshot;
snapshotRemote.Parent = net;
const voteRemote = new Instance('RemoteEvent');
voteRemote.Name = REMOTE.vote;
voteRemote.Parent = net;
const raceStateRemote = new Instance('RemoteEvent');
raceStateRemote.Name = REMOTE.raceState;
raceStateRemote.Parent = net;
const useItemRemote = new Instance('RemoteEvent');
useItemRemote.Name = REMOTE.useItem;
useItemRemote.Parent = net;
const itemEventsRemote = new Instance('RemoteEvent');
itemEventsRemote.Name = REMOTE.itemEvents;
itemEventsRemote.Parent = net;
const recordsRemote = new Instance('RemoteEvent');
recordsRemote.Name = REMOTE.records;
recordsRemote.Parent = net;
const chooseVehicleRemote = new Instance('RemoteEvent');
chooseVehicleRemote.Name = REMOTE.chooseVehicle;
chooseVehicleRemote.Parent = net;
net.Parent = ReplicatedStorage;

const now = () => game.Workspace.GetServerTimeNow();

const paths = new Map<string, TrackPath>();
function pathOf(def: TrackDef): TrackPath {
  let path = paths.get(def.id);
  if (!path) {
    path = trackPath(def);
    paths.set(def.id, path);
  }
  return path;
}

type Mode = { kind: 'cup'; cup: Cup } | { kind: 'quick'; track: TrackDef };

/** Players in the order they joined: the earliest get places on the grid first. */
const joined: Player[] = [];
let phase: Phase = 'waiting';
let phaseEndsAt = 0;
let sim: RaceSim | undefined;
let raceId = 0;
let goAt = 0;
let mode: Mode | undefined;
/** The track being raced or about to be: every device builds it. */
let track: TrackDef = TRACKS[0];
/** The vote under way: the choices, and each player's pick by user id. */
let vote: { options: VoteOption[]; picks: Map<number, number> } | undefined;
/** Who scores for each car of the race, fixed at the start so a player's points stay theirs. */
let scorers: Scorer[] = [];
/**
 * Each player car's last accepted report, by racer index: when it arrived and where it put the car,
 * for the speed check, and when it was sent, so a report that arrives late and out of order is dropped.
 */
const lastReport = new Map<number, { t: number; sentAt: number; x: number; z: number }>();
/** The longest frame (s) in this stretch of WORST_FRAME_WINDOW and the one before, for the owner's readout. */
let worstFrame = 0;
let previousWorstFrame = 0;
let sinceWorstFrame = 0;
const WORST_FRAME_WINDOW = 5;

const records = new RecordBook();
/** Racer indices whose times from this race have been handed to the records. */
const recorded = new Set<number>();
/** Players who beat their own best on the current track, and with what. */
const newBests = new Map<number, Set<RecordKind>>();
/** Each player's vehicle pick by user id. It applies from the next race start. */
const vehiclePicks = new Map<number, VehicleId>();

/** Sends a player the current track's records and their own bests on it. */
function sendRecords(player: Player) {
  const trackId = track.id;
  task.spawn(() => {
    const board = records.board(trackId);
    // The track may have changed while the board was read; the next send covers the new one.
    if (track.id !== trackId || !player.IsDescendantOf(Players)) return;
    const mine = newBests.get(player.UserId);
    const message: RecordsMessage = {
      trackId,
      available: records.available,
      race: board.race,
      lap: board.lap,
      myRace: records.best(player.UserId, trackId, 'race') ?? NO_TIME,
      myLap: records.best(player.UserId, trackId, 'lap') ?? NO_TIME,
      newRace: mine?.has('race') ?? false,
      newLap: mine?.has('lap') ?? false,
    };
    recordsRemote.FireClient(player, message);
  });
}

function sendRecordsToAll() {
  for (const p of joined) sendRecords(p);
}

/** The track changes: everyone gets its records, and last track's new bests are done with. */
function trackChanged() {
  newBests.clear();
  sendRecordsToAll();
}

/**
 * Hands a player's times from this race to the records: the race time if they finished, and their best
 * lap. Times quicker than the car could possibly go are dropped.
 */
function recordTimes(s: RaceSim, index: number) {
  if (recorded.has(index)) return;
  recorded.add(index);
  const racer = s.racers[index];
  // Best times are still kept per track only, so a truck's times would land on the buggy's boards.
  // Only the buggy's are kept until they're kept per vehicle (docs/progression.md).
  if (racer.vehicle !== 'buggy') return;
  const player = Players.GetPlayerByUserId(racer.userId);
  if (!player) return;
  const finish = s.race.finishTimes[index];
  const times: [RecordKind, number | undefined][] = [
    ['race', finish !== NOT_FINISHED ? finish : undefined],
    ['lap', s.race.racers[index].bestLap()],
  ];
  const trackId = track.id;
  const length = s.track.length;
  task.spawn(() => {
    let improved = false;
    for (const [kind, time] of times) {
      const laps = kind === 'race' ? s.race.totalLaps : 1;
      if (time === undefined || time < fastestPossible(length, laps, MAX_REPORTED_SPEED)) continue;
      if (!records.submit(player, trackId, kind, time)) continue;
      improved = true;
      if (track.id !== trackId) continue;
      const kinds = newBests.get(player.UserId) ?? new Set<RecordKind>();
      kinds.add(kind);
      newBests.set(player.UserId, kinds);
    }
    // A new best may have changed the top 10, which everyone sees.
    if (improved) sendRecordsToAll();
  });
}

function stateMessage(): RaceStateMessage {
  return {
    phase,
    phaseEndsAt,
    raceId,
    racers: sim
      ? sim.racers.map((r) => ({
          name: r.name,
          color: r.color,
          gridSlot: r.gridSlot,
          userId: r.userId,
          vehicle: r.vehicle,
        }))
      : [],
    totalLaps: sim ? sim.race.totalLaps : TOTAL_LAPS,
    goAt,
    laps: sim ? sim.race.racers.map((p) => p.lapsCompleted) : [],
    standings: sim ? sim.race.standings() : [],
    finishTimes: sim ? [...sim.race.finishTimes] : [],
    playerCount: joined.size(),
    seed: sim ? sim.seed : 0,
    items: sim ? sim.items.status.map((s) => s.item ?? '') : [],
    bombs: bombList(),
    pickupsDown: sim ? sim.items.pickups.filter((p) => p.respawn > 0).map((p) => p.id) : [],
    trackId: track.id,
    modeLabel: modeLabel(),
    voteOptions: vote ? vote.options.map((o) => o.label) : [],
    voteCounts: vote ? voteCounts(vote) : [],
    cup:
      mode?.kind === 'cup'
        ? mode.cup.standings().map((r) => ({
            name: r.name,
            color: r.color,
            points: r.points,
            lastPoints: r.lastPoints,
            userId: r.userId,
          }))
        : [],
    cupFinal: mode?.kind === 'cup' && mode.cup.done() && phase === 'results',
    serverWorstFrame: math.max(worstFrame, previousWorstFrame),
  };
}

function voteCounts(v: { options: VoteOption[]; picks: Map<number, number> }): number[] {
  const picks: number[] = [];
  for (const [, pick] of v.picks) picks.push(pick);
  return countVotes(v.options.size(), picks);
}

function modeLabel(): string {
  if (phase === 'vote') return 'Vote for the next race';
  if (!mode) return '';
  if (mode.kind === 'quick') return 'Quick race';
  const { cup } = mode;
  const total = cup.tracks.size();
  // During the results the race just scored is the one shown.
  const race = phase === 'results' ? cup.round : math.min(cup.round + 1, total);
  return `${cup.name()} · Race ${race} of ${total}`;
}

function bombList(): number[] {
  const list: number[] = [];
  if (sim) for (const b of sim.items.bombs) list.push(b.id, b.x, b.z);
  return list;
}

const broadcastState = () => raceStateRemote.FireAllClients(stateMessage());

function enterPhase(to: Phase, seconds = 0) {
  phase = to;
  phaseEndsAt = seconds > 0 ? now() + seconds : 0;
  broadcastState();
}

function startVote(seconds: number) {
  mode = undefined;
  vote = { options: voteOptions(() => math.random()), picks: new Map() };
  enterPhase('vote', seconds);
}

/** Most votes wins; a tie, or nobody voting, is settled at random. */
function closeVote() {
  if (!vote) return;
  const option = vote.options[winningOption(voteCounts(vote), () => math.random())];
  vote = undefined;
  const quick = option.kind === 'quick' ? trackById(option.id) : undefined;
  mode = quick ? { kind: 'quick', track: quick } : { kind: 'cup', cup: new Cup(option.id as CircuitId) };
  startRace();
}

function startRace() {
  if (!mode) return;
  const upcoming = mode.kind === 'cup' ? mode.cup.nextTrack() : mode.track;
  if (!upcoming) return;
  track = upcoming;
  const entrants: Entrant[] = [];
  for (const p of joined) {
    if (entrants.size() < GRID_SIZE) {
      entrants.push({ name: p.DisplayName, userId: p.UserId, vehicle: vehiclePicks.get(p.UserId) ?? DEFAULT_VEHICLE });
    }
  }
  raceId++;
  // A fresh hazard layout every race; players' devices roll the same one from this seed.
  sim = new RaceSim(pathOf(track), entrants, math.random(1, 2 ** 30), track.layout);
  scorers = sim.racers.map((r) => ({
    key: r.userId !== 0 ? `player:${r.userId}` : `ai:${r.name}`,
    name: r.name,
    color: r.color,
    userId: r.userId,
  }));
  lastReport.clear();
  recorded.clear();
  goAt = now() + COUNTDOWN_SECONDS;
  enterPhase('countdown', COUNTDOWN_SECONDS);
  trackChanged();
}

function raceOver(s: RaceSim): boolean {
  if (s.playersRacing() === 0 || s.playersFinished()) return true;
  const first = s.firstPlayerFinish();
  return first !== undefined && s.race.clock - first >= FINISH_GRACE_SECONDS;
}

/** The race is over: score it if it's part of a cup, and show the results. */
function finishRace(s: RaceSim) {
  // Players still out on track when time ran out keep their best lap.
  s.racers.forEach((r, i) => {
    if (r.userId !== 0) recordTimes(s, i);
  });
  let seconds = RESULTS_SECONDS;
  if (mode?.kind === 'cup') {
    mode.cup.addRace(s.race.standings().map((i) => scorers[i]));
    if (mode.cup.done()) seconds = CUP_RESULTS_SECONDS;
  }
  enterPhase('results', seconds);
}

/** After the results: the cup's next race, or a new vote. */
function afterResults() {
  sim = undefined;
  goAt = 0;
  if (joined.size() === 0) {
    mode = undefined;
    enterPhase('waiting');
  } else if (mode?.kind === 'cup' && !mode.cup.done()) {
    track = mode.cup.nextTrack()!;
    enterPhase('lobby', LOBBY_SECONDS);
    trackChanged();
  } else {
    startVote(VOTE_SECONDS);
  }
}

function addPlayer(player: Player) {
  joined.push(player);
  if (phase === 'waiting') startVote(FIRST_VOTE_SECONDS);
  else broadcastState();
  task.spawn(() => {
    records.load(player);
    sendRecords(player);
  });
}

Players.PlayerAdded.Connect(addPlayer);
for (const p of Players.GetPlayers()) addPlayer(p);

Players.PlayerRemoving.Connect((player) => {
  const i = joined.indexOf(player);
  if (i >= 0) joined.remove(i);
  records.forget(player.UserId);
  if (sim) {
    const index = sim.indexOf(player.UserId);
    if (index >= 0) sim.standIn(index);
  }
  if (vote) vote.picks.delete(player.UserId);
  vehiclePicks.delete(player.UserId);
  if ((phase === 'vote' || phase === 'lobby') && joined.size() === 0) {
    vote = undefined;
    mode = undefined;
    enterPhase('waiting');
  } else broadcastState();
});

voteRemote.OnServerEvent.Connect((player, pick) => {
  if (!vote || phase !== 'vote' || !typeIs(pick, 'number')) return;
  if (pick !== math.floor(pick) || pick < 0 || pick >= vote.options.size()) return;
  vote.picks.set(player.UserId, pick);
  broadcastState();
});

chooseVehicleRemote.OnServerEvent.Connect((player, vehicle) => {
  if (isVehicleId(vehicle)) vehiclePicks.set(player.UserId, vehicle);
});

const isNumber = (v: unknown): v is number => typeIs(v, 'number') && v === v;

carStateRemote.OnServerEvent.Connect((player, id, sentAt, x, z, heading, steer, vx, vz, y) => {
  if (!sim || id !== raceId || (phase !== 'racing' && phase !== 'results')) return;
  if (!isNumber(x) || !isNumber(z) || !isNumber(heading) || !isNumber(steer) || !isNumber(vx) || !isNumber(vz)) return;
  if (!isNumber(y) || !isNumber(sentAt)) return;
  const index = sim.indexOf(player.UserId);
  if (index < 0) return;

  const t = os.clock();
  const last = lastReport.get(index);
  if (last) {
    // Unreliable messages can arrive out of order: an older report would pull the car backwards.
    if (sentAt <= last.sentAt) return;
    const moved = math.sqrt((x - last.x) ** 2 + (z - last.z) ** 2);
    if (moved > MAX_REPORTED_SPEED * (t - last.t) + RESET_ALLOWANCE) return;
  }
  lastReport.set(index, { t, sentAt, x, z });
  const age = math.clamp(now() - sentAt, 0, MAX_REPORT_AGE);
  sim.reportCar(index, { x, z, heading, steer: math.clamp(steer, -1, 1), vx, vz, y: math.clamp(y, 0, MAX_REPORTED_HEIGHT) }, age);
});

useItemRemote.OnServerEvent.Connect((player, id) => {
  if (!sim || id !== raceId || phase !== 'racing') return;
  const index = sim.indexOf(player.UserId);
  if (index >= 0) sim.useItem(index);
});

let accumulator = 0;
let sinceSnapshot = 0;
let sinceState = 0;

RunService.Heartbeat.Connect((dt) => {
  const t = now();
  worstFrame = math.max(worstFrame, dt);
  sinceWorstFrame += dt;
  if (sinceWorstFrame >= WORST_FRAME_WINDOW) {
    previousWorstFrame = worstFrame;
    worstFrame = 0;
    sinceWorstFrame = 0;
  }
  if (phase === 'vote' && t >= phaseEndsAt) closeVote();
  else if (phase === 'lobby' && t >= phaseEndsAt) startRace();

  if (sim) {
    accumulator += math.min(dt, 0.1);
    while (accumulator >= STEP) {
      sim.step(STEP);
      accumulator -= STEP;
    }

    // Pickups, firing, explosions and hits go out as they happen, with the state they changed.
    const events = sim.drainEvents();
    if (events.size() > 0) {
      itemEventsRemote.FireAllClients(events);
      broadcastState();
    }

    // A player's times go to the records as they cross the line, so leaving straight after keeps them.
    const s = sim;
    s.racers.forEach((r, i) => {
      if (r.userId !== 0 && s.race.finishTimes[i] !== NOT_FINISHED) recordTimes(s, i);
    });

    if (phase === 'countdown' && sim.race.phase !== 'countdown') enterPhase('racing');
    else if (phase === 'racing' && raceOver(sim)) finishRace(sim);
    else if (phase === 'results' && t >= phaseEndsAt) afterResults();
  }

  sinceSnapshot += dt;
  if (sim && sinceSnapshot >= 1 / SEND_RATE) {
    // Keep the remainder, so snapshots go out 20 times a second rather than every third or fourth
    // frame; after a hitch, start afresh rather than sending a burst.
    sinceSnapshot = math.min(sinceSnapshot - 1 / SEND_RATE, 1 / SEND_RATE);
    const data: number[] = [];
    for (const { car } of sim.racers) data.push(car.x, car.z, car.heading, car.steer, car.vx, car.vz, car.y);
    let missiles = 0;
    for (const m of sim.items.missiles) {
      if (missiles++ >= MAX_SNAPSHOT_MISSILES) break;
      data.push(m.id, m.x, m.z, m.heading);
    }
    snapshotRemote.FireAllClients(t, data);
  }

  sinceState += dt;
  if (sinceState >= STATE_INTERVAL) {
    sinceState = 0;
    broadcastState();
  }
});
