// What the server and players' devices send each other. The server owns the race (AI cars, laps,
// positions, results); each player's device drives that player's car and reports where it is.
//
//   player → server  CarState   (unreliable, 20 Hz): raceId, x, z, heading, steer, vx, vz, y
//   player → server  UseItem    (reliable): raceId, when the player fires or drops their item
//   server → all     Snapshot   (unreliable, 20 Hz): server time, CAR_FIELDS numbers per racer,
//                               then MISSILE_FIELDS numbers per missile in flight
//   server → all     RaceState  (reliable, 4 Hz, on every phase change and after item events):
//                               RaceStateMessage
//   server → all     ItemEvents (reliable, as they happen): ItemEvent[] (from items.ts)

export const NET_FOLDER = 'Net';
export const REMOTE = {
  carState: 'CarState',
  snapshot: 'Snapshot',
  raceState: 'RaceState',
  useItem: 'UseItem',
  itemEvents: 'ItemEvents',
} as const;

/** The wait between one race's results and the next race's grid. */
export const NEXT_LOBBY_SECONDS = 10;

/** How often cars are reported, each way. */
export const SEND_RATE = 20;

/** Numbers per car in a snapshot: x, z, heading, steer, vx, vz, y. */
export const CAR_FIELDS = 7;
/** Numbers per missile in a snapshot: id, x, z, heading. */
export const MISSILE_FIELDS = 4;

/**
 * waiting: nobody here. lobby: the timer to the next race is running. countdown: on the grid, 3-2-1.
 * racing: GO until the race is over. results: standings on screen before the next lobby.
 */
export type Phase = 'waiting' | 'lobby' | 'countdown' | 'racing' | 'results';

export interface RacerView {
  name: string;
  color: string;
  gridSlot: number;
  /** The player driving this car, or 0 for an AI car. */
  userId: number;
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
}
