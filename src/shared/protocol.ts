import type { VehicleId } from './vehicles';

// What the server and players' devices send each other. The server owns the race (AI cars, laps,
// positions, results); each player's device drives that player's car and reports where it is.
//
//   player → server  CarState   (unreliable, 20 Hz): raceId, sentAt (server time), x, z, heading,
//                               steer, vx, vz, y
//   player → server  UseItem    (reliable): raceId, when the player fires or drops their item
//   player → server  Vote       (reliable): the index of the option the player picks in a vote
//   player → server  ChooseVehicle (reliable): the VehicleId the player picks, for their next race
//   server → all     Snapshot   (unreliable, 20 Hz): server time, CAR_FIELDS numbers per racer,
//                               then MISSILE_FIELDS numbers per missile in flight
//   server → all     RaceState  (reliable, 4 Hz, on every phase change and after item events):
//                               RaceStateMessage
//   server → all     ItemEvents (reliable, as they happen): ItemEvent[] (from items.ts)
//   server → player  Records    (reliable, when the track changes, on joining, and after a new best):
//                               RecordsMessage, with that player's own bests

export const NET_FOLDER = 'Net';
export const REMOTE = {
  carState: 'CarState',
  snapshot: 'Snapshot',
  raceState: 'RaceState',
  useItem: 'UseItem',
  vote: 'Vote',
  chooseVehicle: 'ChooseVehicle',
  itemEvents: 'ItemEvents',
  records: 'Records',
} as const;


/** How often cars are reported, each way. */
export const SEND_RATE = 20;

/**
 * A player's report is carried on by its velocity for the time it took to reach the server, up to
 * this long (s). Longer than a phone's usual trip, short enough that a stale report can't fling a car.
 */
export const MAX_REPORT_AGE = 0.5;

/** Numbers per car in a snapshot: x, z, heading, steer, vx, vz, y. */
export const CAR_FIELDS = 7;
/** Numbers per missile in a snapshot: id, x, z, heading. */
export const MISSILE_FIELDS = 4;

/**
 * waiting: nobody here. vote: choosing a cup or a quick race. lobby: the wait before the next race of
 * a cup. countdown: on the grid, 3-2-1. racing: GO until the race is over. results: the race's
 * results (and the cup standings) before the next lobby or vote.
 */
export type Phase = 'waiting' | 'vote' | 'lobby' | 'countdown' | 'racing' | 'results';

/** A row of the cup standings. */
export interface StandingView {
  name: string;
  color: string;
  points: number;
  /** Points from the latest race. */
  lastPoints: number;
  /** 0 for an AI car. */
  userId: number;
}

export interface RacerView {
  name: string;
  color: string;
  gridSlot: number;
  /** The player driving this car, or 0 for an AI car. */
  userId: number;
  /** The vehicle this car is, so everyone draws it as it's driven. */
  vehicle: VehicleId;
}

export interface RaceStateMessage {
  phase: Phase;
  /** Server time (Workspace.GetServerTimeNow) when the phase ends, or 0 if it has no timer. */
  phaseEndsAt: number;
  /** Counts up with every race, so late reports from a previous race are ignored. */
  raceId: number;
  /** Everyone in the current race, by racer index. Empty in the lobby. */
  racers: RacerView[];
  totalLaps: number;
  /** Server time of GO, or 0 before it. */
  goAt: number;
  /** Laps completed, by racer index. */
  laps: number[];
  /** Racer indices in race order. */
  standings: number[];
  /** Race time each racer finished in, or -1 while still racing. */
  finishTimes: number[];
  /** Players in the server, for the lobby screen. */
  playerCount: number;
  /** Seeds the race's hazard dice, so every device places oil and puddles in the same spots. */
  seed: number;
  /** The item each racer holds ('missile', 'bomb', or '' for none), by racer index. */
  items: string[];
  /** Bombs on the track: id, x, z for each. */
  bombs: number[];
  /** Ids of item boxes that have been taken and haven't come back yet. */
  pickupsDown: number[];
  /** The track being raced, or about to be: what every device builds. */
  trackId: string;
  /** What's being raced, e.g. 'Classic Cup · Race 2 of 4' or 'Quick race'. */
  modeLabel: string;
  /** In a vote: the choices, and the votes for each so far. Empty otherwise. */
  voteOptions: string[];
  voteCounts: number[];
  /** The cup standings, leader first; empty for a quick race. */
  cup: StandingView[];
  /** True on the results after a cup's last race. */
  cupFinal: boolean;
  /** The server's longest frame (s) over the last few seconds, for the owner's network readout. */
  serverWorstFrame: number;
}

/** A line of a track's top 10. */
export interface RecordRow {
  name: string;
  userId: number;
  /** Seconds. */
  time: number;
}

/** A track's best times, and the player's own, in seconds (NO_TIME in records.ts for none). */
export interface RecordsMessage {
  trackId: string;
  /** False if the records couldn't be loaded (or, in Studio, API access is off). */
  available: boolean;
  race: RecordRow[];
  lap: RecordRow[];
  myRace: number;
  myLap: number;
  /** Set when the player has just beaten their own best on this track. */
  newRace: boolean;
  newLap: boolean;
}
