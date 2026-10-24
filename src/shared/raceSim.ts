import { AiDriver, rubberBand, type Obstacle } from './aiDriver';
import { DEFAULT_TUNING, type CarState } from './carPhysics';
import { collideCars, collideWithWalls } from './collision';
import { AI_RACERS, GRID_SIZE, gridPosition, PLAYER_COLORS, playerSlot, STAND_IN_SKILL } from './grid';
import { NO_INPUT, stepWithEffects } from './handling';
import { BOOST_PAD_RADIUS, DEMO_LAYOUT, ItemSystem, type ItemEvent, type TrackLayout } from './items';
import { Math } from './jsMath';
import { buildRamps, updateHeight, type Ramp } from './jumps';
import { NOT_FINISHED, Race, TOTAL_LAPS } from './race';
import { buildRacingLine, type RacingLine } from './racingLine';
import type { Projection, TrackPath } from './trackPath';

// One multiplayer race, without rendering or networking: what the server runs. It's rc-racer's
// world.ts reshaped for several players: AI cars are stepped here, each player's car is whatever its
// owner last reported (moved on by its velocity between reports), and the race rules and items see
// them all the same. Items between cars (pickups, missiles, bombs, hits) are decided here; boost pads,
// oil, puddles and ramps on a player's car are handled by that player's device.

/** AI fires missiles at cars this far ahead along the track (m)... */
const AI_MISSILE_RANGE: [number, number] = [4, 35];
/** ...and drops bombs on cars this far behind, if they're in its lane (within this many metres). */
const AI_BOMB_RANGE: [number, number] = [2, 9];
const AI_BOMB_LANE = 1.8;

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
  readonly items: ItemSystem;
  readonly ramps: Ramp[];
  /** Every car's projection onto the track after the last step. */
  private projs: Projection[];
  /** Item uses asked for since the last step. */
  private readonly useRequested: boolean[] = [];
  private events: ItemEvent[] = [];
  private hazardObstacles: Obstacle[] | undefined;
  private padTargets: Obstacle[] | undefined;

  constructor(
    readonly track: TrackPath,
    /** Players in the order they joined; the first starts at the back. At most GRID_SIZE. */
    players: Entrant[],
    /** Seeds the hazard dice; players' devices build the same hazards from it. */
    readonly seed = 1,
    layout: TrackLayout = DEMO_LAYOUT,
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
      this.useRequested.push(false);
    }
    this.race = new Race(track.length, this.racers.size(), totalLaps);
    this.items = new ItemSystem(track, this.racers.size(), layout, seed);
    this.ramps = buildRamps(track, layout.ramps ?? []);
    this.projs = this.racers.map((r) => track.project(r.car.x, r.car.z));
  }

  /** The racer index of a player's car, or -1 if they aren't in this race. */
  indexOf(userId: number): number {
    for (let i = 0; i < this.racers.size(); i++) if (this.racers[i].userId === userId) return i;
    return -1;
  }

  /** Where a player's device says their car is. */
  reportCar(index: number, state: Pick<CarState, 'x' | 'z' | 'heading' | 'steer' | 'vx' | 'vz' | 'y'>): void {
    const car = this.racers[index].car;
    car.x = state.x;
    car.z = state.z;
    car.heading = state.heading;
    car.steer = state.steer;
    car.vx = state.vx;
    car.vz = state.vz;
    car.y = state.y;
  }

  /** A player pressed fire: used on the next step, if they're racing and not spinning. */
  useItem(index: number): void {
    this.useRequested[index] = true;
  }

  /** A player left: an AI driver takes their car home. */
  standIn(index: number): void {
    const racer = this.racers[index];
    racer.userId = 0;
    racer.name = `${racer.name} (AI)`;
    racer.driver = new AiDriver(this.track, this.line, STAND_IN_SKILL, DEFAULT_TUNING);
  }

  /** Returns and clears the item events since the last call, to send to every player. */
  drainEvents(): ItemEvent[] {
    const events = this.events;
    this.events = [];
    return events;
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
    const { race, track, racers, items } = this;
    const cars = racers.map((r) => r.car);
    const obstacles = this.obstacles();

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
      if (!race.controlsLocked() && race.finishTimes[i] === NOT_FINISHED && items.status[i].spin === 0) {
        const proj = track.project(racer.car.x, racer.car.z);
        const others = cars.filter((c) => c !== racer.car);
        const boost = leader === -math.huge ? 1 : rubberBand(leader - race.progress(i));
        const decision = racer.driver.drive(racer.car, proj, others, boost, dt, obstacles, this.boostPadTargets());
        if (decision.respawn) this.respawn(i);
        else input = decision.input;
        if (this.aiWantsItem(i, proj)) this.useRequested[i] = true;
      }
      stepWithEffects(racer.car, input, dt, racer.driver.tuning, items.status[i]);
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

    this.projs = racers.map((r) =>
      r.driver ? collideWithWalls(r.car, track, dt).proj : track.project(r.car.x, r.car.z),
    );
    racers.forEach((r, i) => {
      if (r.driver) updateHeight(r.car, this.projs[i], this.ramps, track.length, dt);
    });

    this.useRequested.forEach((wanted, i) => {
      if (!wanted) return;
      this.useRequested[i] = false;
      const racing = race.phase === 'racing' || race.phase === 'finished';
      if (racing && race.finishTimes[i] === NOT_FINISHED) items.use(i, cars[i], this.projs[i], this.projs);
    });
    items.update(dt, cars, this.projs);
    for (const e of items.drainEvents()) this.events.push(e);

    race.update(
      dt,
      this.projs.map((p) => p.distance),
    );
  }

  /** Oil, puddles and bombs, for the AI to steer around. */
  private obstacles(): Obstacle[] {
    const obstacle = (x: number, z: number, radius: number): Obstacle => {
      const { distance, lateral } = this.track.project(x, z);
      return { distance, lateral, radius };
    };
    // Hazards never move, so they're only projected onto the track once.
    if (!this.hazardObstacles) this.hazardObstacles = this.items.hazards.map((h) => obstacle(h.x, h.z, h.radius));
    const all = [...this.hazardObstacles];
    for (const b of this.items.bombs) all.push(obstacle(b.x, b.z, 1.2));
    return all;
  }

  /** Boost pads in track coordinates, for the AI to aim at. They never move, so this is cached. */
  private boostPadTargets(): Obstacle[] {
    if (!this.padTargets) {
      this.padTargets = this.items.boostPads.map((p) => {
        const { distance, lateral } = this.track.project(p.x, p.z);
        return { distance, lateral, radius: BOOST_PAD_RADIUS };
      });
    }
    return this.padTargets;
  }

  /** Simple tactics, from rc-racer's world.ts: fire at cars just ahead, bomb cars close behind. */
  private aiWantsItem(i: number, proj: Projection): boolean {
    const { item, holdTime } = this.items.status[i];
    // Each car waits a slightly different moment before using what it picked up.
    if (!item || holdTime < 1.2 + ((i * 0.37) % 1.2)) return false;

    const me = this.race.progress(i);
    const others = this.racers.map((_, j) => j).filter((j) => j !== i);
    const gap = (j: number) => this.race.progress(j) - me;
    if (item === 'missile') return others.some((j) => gap(j) > AI_MISSILE_RANGE[0] && gap(j) < AI_MISSILE_RANGE[1]);
    if (item === 'bomb') {
      // The leader doesn't bomb its chasers: that would make it all but impossible to catch.
      if (this.race.position(i) === 1) return false;
      return others.some(
        (j) =>
          -gap(j) > AI_BOMB_RANGE[0] &&
          -gap(j) < AI_BOMB_RANGE[1] &&
          Math.abs(this.projs[j].lateral - proj.lateral) < AI_BOMB_LANE,
      );
    }
    return false;
  }

  /** Puts an AI car back on the centreline nearest to it, facing the way the track runs. */
  private respawn(index: number): void {
    const { car, driver } = this.racers[index];
    const proj = this.track.project(car.x, car.z);
    const p = this.track.points[proj.index];
    car.x = p.x;
    car.z = p.z;
    car.y = 0;
    car.vy = 0;
    car.airborne = false;
    car.heading = Math.atan2(proj.tz, proj.tx);
    car.vx = 0;
    car.vz = 0;
    car.steer = 0;
    this.race.racers[index].resetPosition();
    driver?.reset();
  }
}
