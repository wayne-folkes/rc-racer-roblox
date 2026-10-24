import type { CarState } from './carPhysics';
import { clearsGround, type RampSpec } from './jumps';
import { Math } from './jsMath';
import type { Projection, TrackPath } from './trackPath';

// Pickups, weapons, boost pads and track hazards. Pure simulation: the world applies the
// effects (spins, boosts, slides) to the cars, and the scene draws what's here.

export type ItemKind = 'missile' | 'bomb';
export const ITEM_KINDS: ItemKind[] = ['missile', 'bomb'];

export type HazardKind = 'oil' | 'puddle';

/** A spot on the track: distance as a fraction of the lap, and metres right of the centreline. */
export interface TrackSpot {
  at: number;
  lateral: number;
}

export interface HazardSpec extends TrackSpot {
  kind: HazardKind;
  radius: number;
}

/**
 * A stretch of road where one hazard turns up each race. Its kind, size and exact spot are drawn at
 * random, so the road is never quite the same twice. Like a fixed hazard it sits on a steady part of
 * the racing line, and the whole stretch has to be steady.
 */
export interface HazardZone {
  /** Centre of the stretch, as a fraction of the lap. */
  at: number;
  /** How far either side of the centre a hazard may land, as a fraction of the lap. */
  reach: number;
  /** A hazard lands anywhere up to this many metres either side of the centreline. */
  room: number;
}

export interface PickupSpec extends TrackSpot {
  kind: ItemKind;
}

export interface TrackLayout {
  /** Hazards that are always in the same place. */
  hazards: HazardSpec[];
  /** Stretches that each get a randomly placed hazard when a race is built. */
  hazardZones?: HazardZone[];
  pickups: PickupSpec[];
  /** Strips on the road that boost any car driving over them. */
  boostPads: TrackSpot[];
  ramps?: RampSpec[];
}

const PICKUP_SPACING = 3;

/** Three pickups side by side across the track, left to right. */
export function pickupRow(at: number, kinds: [ItemKind, ItemKind, ItemKind]): PickupSpec[] {
  return kinds.map((kind, k) => ({ kind, at, lateral: (k - 1) * PICKUP_SPACING }));
}

/** Zones for a track this wide: a stretch around each `at`, with the hazard kept off the walls. */
export function hazardZones(halfWidth: number, ats: number[], reach = 0.015): HazardZone[] {
  return ats.map((at) => ({ at, reach, room: halfWidth - 2.2 }));
}

/** Oil patches are smaller than puddles; each is drawn from its own range. */
export const HAZARD_RADIUS: Record<HazardKind, [number, number]> = {
  oil: [1.4, 1.8],
  puddle: [1.8, 2.4],
};

/** Picks a hazard's kind, size and spot within its zone. */
export function rollHazard(zone: HazardZone, rand: () => number): HazardSpec {
  const kind: HazardKind = rand() < 0.5 ? 'oil' : 'puddle';
  const [min, max] = HAZARD_RADIUS[kind];
  return {
    kind,
    radius: min + rand() * (max - min),
    at: zone.at + (rand() * 2 - 1) * zone.reach,
    lateral: (rand() * 2 - 1) * zone.room,
  };
}

// Hazards sit on steady stretches of the racing line, so there's always time to pick a way
// round; one on a line that's swinging across the road (like the S-bend) can't be avoided.
export const DEMO_LAYOUT: TrackLayout = {
  hazards: [],
  hazardZones: hazardZones(5.5, [0.163, 0.23, 0.68, 0.82]),
  // Each row mixes the items, so taking one means picking a line.
  pickups: [...pickupRow(0.06, ['missile', 'bomb', 'missile']), ...pickupRow(0.47, ['bomb', 'missile', 'bomb'])],
  // Off the racing line, at the start of fast stretches: worth a detour, but it is one.
  boostPads: [
    { at: 0.1, lateral: 2.5 },
    { at: 0.64, lateral: -1 },
    { at: 0.88, lateral: 2.8 },
  ],
  // The first ramp sits just before the top-straight puddle: a fast car clears it.
  ramps: [{ at: 0.125 }, { at: 0.74 }],
};

export interface Hazard {
  kind: HazardKind;
  x: number;
  z: number;
  radius: number;
}

/** A pickup shows what it gives, and always gives the same thing. */
export interface BoostPad {
  x: number;
  z: number;
  /** Direction of travel over the pad, for drawing its arrows. */
  heading: number;
}

export interface Pickup {
  id: number;
  kind: ItemKind;
  x: number;
  z: number;
  /** Seconds until the box is back; 0 means it's there to collect. */
  respawn: number;
}

export interface Missile {
  id: number;
  owner: number;
  x: number;
  z: number;
  heading: number;
  /** Missiles fly along the track, so they're tracked in track coordinates. */
  distance: number;
  lateral: number;
  /** Racer it's homing in on, if any. */
  target: number | undefined;
  age: number;
}

export interface Bomb {
  id: number;
  owner: number;
  x: number;
  z: number;
  age: number;
}

export interface RacerStatus {
  item: ItemKind | undefined;
  /** Seconds the item has been held (the AI waits a moment before using one). */
  holdTime: number;
  /** Seconds left spinning out after a hit. Controls don't work while spinning. */
  spin: number;
  /** Seconds left of boost. */
  boost: number;
  /** Seconds left sliding after hitting oil. */
  slick: number;
  inPuddle: boolean;
  onOil: boolean;
  onPad: boolean;
}

export type ItemEvent =
  | { type: 'pickup'; racer: number; item: ItemKind; pickupId: number; x: number; z: number }
  | { type: 'fire' | 'drop'; racer: number; id: number; x: number; z: number }
  | { type: 'boost'; racer: number; x: number; z: number }
  | { type: 'explode'; victim: number | undefined; id: number; x: number; z: number }
  | { type: 'slick' | 'splash'; racer: number; x: number; z: number };

const PICKUP_RADIUS = 1.7;
const PICKUP_RESPAWN = 4;
const MISSILE_SPEED = 42;
const MISSILE_LIFE = 2.5;
/** How fast a missile can move sideways while homing (m/s). */
const MISSILE_HOMING = 10;
/** Missiles home in on the nearest car up to this far ahead along the track. */
const MISSILE_RANGE = 60;
const MISSILE_HIT_RADIUS = 1.4;
/** Missiles fly low, but can still clip a car that's only just left the ground. */
const MISSILE_REACH = 1.3;
/** Cars touch a boost pad when their centre is within this distance of its middle. */
export const BOOST_PAD_RADIUS = 1.8;
const BOMB_DROP_BEHIND = 2.2;
/** Bombs can't go off until they've had time to fall behind the car that dropped them. */
const BOMB_ARM_TIME = 0.5;
const BOMB_LIFE = 20;
const BOMB_HIT_RADIUS = 1.5;
export const SPIN_TIME = 1.1;
/** Share of speed kept when hit. */
const HIT_SPEED_KEEP = 0.35;
export const BOOST_TIME = 1.6;
export const SLICK_TIME = 0.9;
/** Sideways jolt (radians of heading) when running over oil. */
const OIL_KICK = 0.35;
/** Cars touch a hazard when their centre is within its radius plus this. */
const CAR_HALF_WIDTH = 0.6;

/** Mixed into the race seed for the hazard dice. */
const HAZARD_SEED = 0x68a3f1;

/** Small seeded random number generator, so races (and tests) are repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spotToWorld(track: TrackPath, spot: TrackSpot) {
  const p = track.pointAt(spot.at * track.length);
  return { x: p.x - p.tz * spot.lateral, z: p.z + p.tx * spot.lateral };
}

const freshStatus = (): RacerStatus => ({
  item: undefined,
  holdTime: 0,
  spin: 0,
  boost: 0,
  slick: 0,
  inPuddle: false,
  onOil: false,
  onPad: false,
});

export class ItemSystem {
  readonly hazards: Hazard[];
  readonly pickups: Pickup[];
  readonly boostPads: BoostPad[];
  missiles: Missile[] = [];
  bombs: Bomb[] = [];
  readonly status: RacerStatus[];

  private events: ItemEvent[] = [];
  private nextId = 1;
  private rng: () => number;

  constructor(
    private readonly track: TrackPath,
    racerCount: number,
    layout: TrackLayout = DEMO_LAYOUT,
    private readonly seed = 1,
  ) {
    this.rng = seededRandom(seed);
    // Zones are rolled once, here, from their own stream so the item boxes' dice are untouched.
    const hazardDice = seededRandom(seed ^ HAZARD_SEED);
    const rolled = (layout.hazardZones ?? []).map((zone) => rollHazard(zone, hazardDice));
    this.hazards = [...layout.hazards, ...rolled].map((h) => ({ kind: h.kind, radius: h.radius, ...spotToWorld(track, h) }));
    this.pickups = layout.pickups.map((p) => ({
      id: this.takeId(),
      kind: p.kind,
      respawn: 0,
      ...spotToWorld(track, p),
    }));
    this.boostPads = layout.boostPads.map((spot) => {
      const p = track.pointAt(spot.at * track.length);
      return { ...spotToWorld(track, spot), heading: Math.atan2(p.tz, p.tx) };
    });
    this.status = [];
    for (let i = 0; i < racerCount; i++) this.status.push(freshStatus());
  }

  /** Clears everything for a new race. */
  reset(): void {
    this.rng = seededRandom(this.seed);
    this.missiles = [];
    this.bombs = [];
    this.events = [];
    for (const p of this.pickups) p.respawn = 0;
    for (let i = 0; i < this.status.size(); i++) this.status[i] = freshStatus();
  }

  /** Returns and clears what happened since the last call, for effects and sounds. */
  drainEvents(): ItemEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Uses the racer's held item. Returns false if there was nothing to use. */
  use(racer: number, car: CarState, proj: Projection, projs: Projection[]): boolean {
    const status = this.status[racer];
    const item = status.item;
    if (!item || status.spin > 0) return false;
    status.item = undefined;
    status.holdTime = 0;

    if (item === 'missile') {
      const distance = (proj.distance + 2.5) % this.track.length;
      const id = this.takeId();
      this.missiles.push({
        id,
        owner: racer,
        x: car.x,
        z: car.z,
        heading: car.heading,
        distance,
        lateral: proj.lateral,
        target: this.nearestAhead(racer, proj.distance, projs),
        age: 0,
      });
      this.events.push({ type: 'fire', racer, id, x: car.x, z: car.z });
    } else {
      const x = car.x - Math.cos(car.heading) * BOMB_DROP_BEHIND;
      const z = car.z - Math.sin(car.heading) * BOMB_DROP_BEHIND;
      const id = this.takeId();
      this.bombs.push({ id, owner: racer, x, z, age: 0 });
      this.events.push({ type: 'drop', racer, id, x, z });
    }
    return true;
  }

  /** The closest other car ahead along the track, within missile range. */
  private nearestAhead(racer: number, distance: number, projs: Projection[]): number | undefined {
    let best: number | undefined = undefined;
    let bestGap = MISSILE_RANGE;
    for (let i = 0; i < projs.size(); i++) {
      if (i === racer) continue;
      const gap = (((projs[i].distance - distance) % this.track.length) + this.track.length) % this.track.length;
      if (gap > 0 && gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    }
    return best;
  }

  /** Advances timers, pickups, missiles, bombs and hazards. Hit cars are slowed here. */
  update(dt: number, cars: CarState[], projs: Projection[]): void {
    for (const s of this.status) {
      s.spin = Math.max(0, s.spin - dt);
      s.boost = Math.max(0, s.boost - dt);
      s.slick = Math.max(0, s.slick - dt);
      if (s.item) s.holdTime += dt;
    }
    this.updatePickups(dt, cars);
    this.updateMissiles(dt, cars, projs);
    this.updateBombs(dt, cars);
    this.updateHazards(cars);
    this.updateBoostPads(cars);
  }

  private updateBoostPads(cars: CarState[]): void {
    cars.forEach((car, racer) => {
      const status = this.status[racer];
      const onPad =
        !clearsGround(car) && this.boostPads.some((p) => Math.hypot(car.x - p.x, car.z - p.z) < BOOST_PAD_RADIUS);
      // A spinning car slides over without picking up the boost.
      if (onPad && !status.onPad && status.spin === 0) {
        status.boost = BOOST_TIME;
        this.events.push({ type: 'boost', racer, x: car.x, z: car.z });
      }
      status.onPad = onPad;
    });
  }

  private updatePickups(dt: number, cars: CarState[]): void {
    for (const p of this.pickups) {
      if (p.respawn > 0) {
        p.respawn = Math.max(0, p.respawn - dt);
        continue;
      }
      // Cars already holding an item drive straight through, leaving it for someone else.
      const racer = cars.findIndex(
        (c, i) => !this.status[i].item && !clearsGround(c) && Math.hypot(c.x - p.x, c.z - p.z) < PICKUP_RADIUS,
      );
      if (racer < 0) continue;
      p.respawn = PICKUP_RESPAWN;
      this.status[racer].item = p.kind;
      this.status[racer].holdTime = 0;
      this.events.push({ type: 'pickup', racer, item: p.kind, pickupId: p.id, x: p.x, z: p.z });
    }
  }

  private updateMissiles(dt: number, cars: CarState[], projs: Projection[]): void {
    const wall = this.track.halfWidth - 0.3;
    this.missiles = this.missiles.filter((m) => {
      m.age += dt;
      m.distance = (m.distance + MISSILE_SPEED * dt) % this.track.length;
      if (m.target !== undefined) {
        const want = projs[m.target].lateral - m.lateral;
        m.lateral += Math.max(-MISSILE_HOMING * dt, Math.min(MISSILE_HOMING * dt, want));
      }
      const p = this.track.pointAt(m.distance);
      m.x = p.x - p.tz * m.lateral;
      m.z = p.z + p.tx * m.lateral;
      m.heading = Math.atan2(p.tz, p.tx);

      const victim = cars.findIndex(
        (c, i) => i !== m.owner && c.y < MISSILE_REACH && Math.hypot(c.x - m.x, c.z - m.z) < MISSILE_HIT_RADIUS,
      );
      if (victim >= 0) {
        this.hit(victim, cars[victim]);
        this.events.push({ type: 'explode', victim, id: m.id, x: m.x, z: m.z });
        return false;
      }
      if (Math.abs(m.lateral) > wall || m.age > MISSILE_LIFE) {
        this.events.push({ type: 'explode', victim: undefined, id: m.id, x: m.x, z: m.z });
        return false;
      }
      return true;
    });
  }

  private updateBombs(dt: number, cars: CarState[]): void {
    this.bombs = this.bombs.filter((b) => {
      b.age += dt;
      if (b.age < BOMB_ARM_TIME) return true;
      const victim = cars.findIndex((c) => !clearsGround(c) && Math.hypot(c.x - b.x, c.z - b.z) < BOMB_HIT_RADIUS);
      if (victim >= 0) {
        this.hit(victim, cars[victim]);
        this.events.push({ type: 'explode', victim, id: b.id, x: b.x, z: b.z });
        return false;
      }
      if (b.age > BOMB_LIFE) {
        this.events.push({ type: 'explode', victim: undefined, id: b.id, x: b.x, z: b.z });
        return false;
      }
      return true;
    });
  }

  private updateHazards(cars: CarState[]): void {
    cars.forEach((car, racer) => {
      const status = this.status[racer];
      const touching = (kind: HazardKind) =>
        !clearsGround(car) &&
        this.hazards.some(
          (h) => h.kind === kind && Math.hypot(car.x - h.x, car.z - h.z) < h.radius + CAR_HALF_WIDTH,
        );

      const onOil = touching('oil');
      if (onOil && !status.onOil && Math.hypot(car.vx, car.vz) > 3) {
        status.slick = SLICK_TIME;
        car.heading += (this.rng() < 0.5 ? -1 : 1) * OIL_KICK;
        this.events.push({ type: 'slick', racer, x: car.x, z: car.z });
      }
      status.onOil = onOil;

      const inPuddle = touching('puddle');
      if (inPuddle && !status.inPuddle) this.events.push({ type: 'splash', racer, x: car.x, z: car.z });
      status.inPuddle = inPuddle;
    });
  }

  /** Spins a car out and knocks most of its speed off. Public so a player's device can apply a hit the server decided. */
  hit(racer: number, car: CarState): void {
    this.status[racer].spin = SPIN_TIME;
    this.status[racer].boost = 0;
    car.vx *= HIT_SPEED_KEEP;
    car.vz *= HIT_SPEED_KEEP;
  }

  /** Returns the next object id (missiles, bombs and pickups share one counter). */
  private takeId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }
}
