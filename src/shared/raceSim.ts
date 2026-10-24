import { AiDriver, rubberBand } from './aiDriver';
import { DEFAULT_TUNING, stepCar, type CarInput, type CarState } from './carPhysics';
import { collideCars, collideWithWalls } from './collision';
import { AI_RACERS, GRID_SIZE, gridPosition, PLAYER_COLORS, playerSlot, STAND_IN_SKILL } from './grid';
import { Math } from './jsMath';
import { NOT_FINISHED, Race, TOTAL_LAPS } from './race';
import { buildRacingLine, type RacingLine } from './racingLine';
import type { TrackPath } from './trackPath';

// One multiplayer race, without rendering or networking: what the server runs. It's rc-racer's
// world.ts reshaped for several players: AI cars are stepped here, each player's car is whatever its
// owner last reported (moved on by its velocity between reports), and the race rules see them all
// the same. Items, ramps and hazards come later.

const NO_INPUT: CarInput = { throttle: 0, steer: 0, handbrake: false };

export interface Entrant {
  name: string;
  userId: number;
}

export interface SimRacer {
  name: string;
  color: string;
  gridSlot: number;
  /** The player driving this car, or 0 for an AI car. */
  userId: number;
  car: CarState;
  /** Set for an AI car, including a player's car the AI took over when they left. */
  driver: AiDriver | undefined;
}

export class RaceSim {
  readonly line: RacingLine;
  readonly racers: SimRacer[] = [];
  readonly race: Race;

  constructor(
    readonly track: TrackPath,
    /** Players in the order they joined; the first starts at the back. At most GRID_SIZE. */
    players: Entrant[],
    totalLaps = TOTAL_LAPS,
  ) {
    this.line = buildRacingLine(track, DEFAULT_TUNING);
    const playerCount = math.min(players.size(), GRID_SIZE);
    for (let slot = 0; slot < GRID_SIZE; slot++) {
      const n = GRID_SIZE - 1 - slot;
      if (n < playerCount) {
        const p = players[n];
        this.racers.push({
          name: p.name,
          color: PLAYER_COLORS[n],
          gridSlot: playerSlot(n),
          userId: p.userId,
          car: gridPosition(track, slot),
          driver: undefined,
        });
      } else {
        const ai = AI_RACERS[slot];
        this.racers.push({
          name: ai.name,
          color: ai.color,
          gridSlot: slot,
          userId: 0,
          car: gridPosition(track, slot),
          driver: new AiDriver(track, this.line, ai.skill, DEFAULT_TUNING),
        });
      }
    }
    this.race = new Race(track.length, this.racers.size(), totalLaps);
  }

  /** The racer index of a player's car, or -1 if they aren't in this race. */
  indexOf(userId: number): number {
    for (let i = 0; i < this.racers.size(); i++) if (this.racers[i].userId === userId) return i;
    return -1;
  }

  /** Where a player's device says their car is. */
  reportCar(index: number, state: Pick<CarState, 'x' | 'z' | 'heading' | 'steer' | 'vx' | 'vz'>): void {
    const car = this.racers[index].car;
    car.x = state.x;
    car.z = state.z;
    car.heading = state.heading;
    car.steer = state.steer;
    car.vx = state.vx;
    car.vz = state.vz;
  }

  /** A player left: an AI driver takes their car home. */
  standIn(index: number): void {
    const racer = this.racers[index];
    racer.userId = 0;
    racer.name = `${racer.name} (AI)`;
    racer.driver = new AiDriver(this.track, this.line, STAND_IN_SKILL, DEFAULT_TUNING);
  }

  playersRacing(): number {
    let n = 0;
    for (const r of this.racers) if (r.userId !== 0) n++;
    return n;
  }

  /** True once every player still here has crossed the line. */
  playersFinished(): boolean {
    for (let i = 0; i < this.racers.size(); i++) {
      if (this.racers[i].userId !== 0 && this.race.finishTimes[i] === NOT_FINISHED) return false;
    }
    return true;
  }

  /** Race time the first player finished in, or undefined. */
  firstPlayerFinish(): number | undefined {
    let first: number | undefined;
    for (let i = 0; i < this.racers.size(); i++) {
      const t = this.race.finishTimes[i];
      if (this.racers[i].userId !== 0 && t !== NOT_FINISHED && (first === undefined || t < first)) first = t;
    }
    return first;
  }

  step(dt: number): void {
    const { race, track, racers } = this;
    const cars = racers.map((r) => r.car);

    // AI cars race whichever player is furthest ahead, so the front stays a fight. With no players
    // left (everyone quit mid-race) they just race each other.
    let leader = -math.huge;
    racers.forEach((r, i) => {
      if (r.userId !== 0) leader = math.max(leader, race.progress(i));
    });

    racers.forEach((racer, i) => {
      if (!racer.driver) {
        // A player's car: carry it along between reports.
        racer.car.x += racer.car.vx * dt;
        racer.car.z += racer.car.vz * dt;
        return;
      }
      let input = NO_INPUT;
      if (!race.controlsLocked() && race.finishTimes[i] === NOT_FINISHED) {
        const proj = track.project(racer.car.x, racer.car.z);
        const others = cars.filter((c) => c !== racer.car);
        const boost = leader === -math.huge ? 1 : rubberBand(leader - race.progress(i));
        const decision = racer.driver.drive(racer.car, proj, others, boost, dt);
        if (decision.respawn) this.respawn(i);
        else input = decision.input;
      }
      stepCar(racer.car, input, dt, racer.driver.tuning);
    });

    // The server only moves AI cars. A bump between an AI car and a player's car moves the AI car
    // here and the player's car on their own device; two players' devices sort out their own bumps.
    for (let i = 0; i < cars.size(); i++) {
      for (let j = i + 1; j < cars.size(); j++) {
        const aiI = racers[i].driver !== undefined;
        const aiJ = racers[j].driver !== undefined;
        if (aiI && aiJ) collideCars(cars[i], cars[j]);
        else if (aiI) collideCars(cars[i], { ...cars[j] });
        else if (aiJ) collideCars({ ...cars[i] }, cars[j]);
      }
    }

    const distances = racers.map((r) =>
      r.driver ? collideWithWalls(r.car, track, dt).proj.distance : track.project(r.car.x, r.car.z).distance,
    );
    race.update(dt, distances);
  }

  /** Puts an AI car back on the centreline nearest to it, facing the way the track runs. */
  private respawn(index: number): void {
    const { car, driver } = this.racers[index];
    const proj = this.track.project(car.x, car.z);
    const p = this.track.points[proj.index];
    car.x = p.x;
    car.z = p.z;
    car.heading = Math.atan2(proj.tz, proj.tx);
    car.vx = 0;
    car.vz = 0;
    car.steer = 0;
    this.race.racers[index].resetPosition();
    driver?.reset();
  }
}
