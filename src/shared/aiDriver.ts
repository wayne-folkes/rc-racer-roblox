import { DEFAULT_TUNING, forwardSpeed, speed, type CarInput, type CarState, type CarTuning } from './carPhysics';
import type { RacingLine } from './racingLine';
import type { Projection, TrackPath } from './trackPath';
import { Infinity, Math } from './jsMath';

export interface AiSkill {
  /** Multiplier on the racing line's target speeds and the car's top speed. */
  pace: number;
  /** How hard it steers towards its target (steer per radian of error). */
  steerGain: number;
}

/** Cars within this distance ahead... */
const LOOK_AHEAD_FOR_CARS = 10;
/** ...and less than this far to either side are in the way. */
const IN_THE_WAY_SIDE = 2.4;
/** How far to move across to get past a car in the way. */
const PASS_OFFSET = 3.2;
/** How fast the car moves across the track when changing lines (m/s). */
const LINE_CHANGE_RATE = 5;
/** Seconds to stick with a chosen passing side, so it doesn't dither left and right. */
const PASS_COMMIT_SECONDS = 1.2;
/** Closer than this behind a car it can't get past, it matches that car's speed. */
const FOLLOW_DISTANCE = 6;
/** Seconds without making progress before the car is put back on the track. */
const STUCK_SECONDS = 2;
/** Proportional throttle: full throttle or brake at this many m/s off the target speed. */
const SPEED_ERROR_FOR_FULL = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The fastest a car well behind the player is pushed: a lead of a few seconds doesn't last. */
const CATCH_UP = 1.12;
/** In easy mode a car behind only gets this small push. */
const EASY_CATCH_UP = 1.03;
/** Extra pace per metre a car trails the player by: the further back, the harder it pushes. */
const CATCH_UP_PER_METRE = 0.006;

/** The slowest a car ahead of the player is held to in easy mode (normally 0.92). */
const EASY_SLOWEST = 0.88;

/**
 * Pace multiplier that keeps races close without trapping the player in a pack: cars well ahead
 * of the player ease off a little, cars behind push to close the gap. `gap` is the player's progress
 * minus the AI car's, in metres. In easy mode a car that's well ahead eases off further, so a runaway
 * leader can be caught.
 */
export function rubberBand(gap: number, easy = false): number {
  const perMetre = gap > 0 && !easy ? CATCH_UP_PER_METRE : 0.003;
  return clamp(1 + gap * perMetre, easy ? EASY_SLOWEST : 0.92, easy ? EASY_CATCH_UP : CATCH_UP);
}

export interface AiDecision {
  input: CarInput;
  /** The car is stuck or facing backwards and should be put back on the track. */
  respawn: boolean;
}

/** Something on the track to steer around, like an oil slick or a bomb. */
export interface Obstacle {
  /** Distance along the track from the start line. */
  distance: number;
  /** Metres right of the centreline. */
  lateral: number;
  radius: number;
}

/** Detour onto boost pads up to this far ahead... */
const BOOST_PAD_LOOKAHEAD = 22;
/** ...when they're no more than this far from where the car was going to drive. */
const BOOST_PAD_MAX_DETOUR = 3;
/** Start steering around obstacles this far ahead. */
const OBSTACLE_LOOKAHEAD = 24;
/** Pass obstacles with this much space between their edge and the car's centre. */
const OBSTACLE_CLEARANCE = 1.8;

interface Traffic {
  /** Sideways position to aim for, in metres right of the centreline. */
  offset: number;
  /** Speed cap from a car close ahead that it can't get past, or Infinity. */
  speedCap: number;
}

export class AiDriver {
  /** This car's handling. Its top speed tracks the driver's pace, including rubber-banding. */
  readonly tuning: CarTuning;
  private stuckTime = 0;
  /** Current sideways shift from the racing line; eases towards the wanted shift. */
  private shift = 0;
  /** Side it's committed to passing on (-1 left, 1 right, 0 none), and for how much longer. */
  private passSide = 0;
  private passTime = 0;
  /** Where it was aiming while passing, held until the commitment runs out. */
  private passOffset = 0;

  constructor(
    private readonly track: TrackPath,
    private readonly line: RacingLine,
    readonly skill: AiSkill,
    /** The car's own handling before pace is applied, e.g. with upgrades. */
    private readonly baseTuning: CarTuning = DEFAULT_TUNING,
  ) {
    this.tuning = { ...baseTuning };
  }

  /**
   * @param proj The car's projection onto the track.
   * @param others Every other car, to get around.
   * @param paceBoost Extra pace multiplier, from rubberBand().
   * @param obstacles Hazards to steer around.
   * @param boostPads Pads worth a small detour (their radius is unused).
   */
  drive(
    car: CarState,
    proj: Projection,
    others: CarState[],
    paceBoost: number,
    dt: number,
    obstacles: Obstacle[] = [],
    boostPads: Obstacle[] = [],
  ): AiDecision {
    const pace = this.skill.pace * paceBoost;
    this.tuning.maxSpeed = this.baseTuning.maxSpeed * pace;

    const n = this.line.points.size();
    const lookahead = 5 + speed(car) * 0.3;
    const aimIndex = (proj.index + Math.round(lookahead / this.line.spacing)) % n;
    const lineOffset = this.line.offsets[aimIndex];
    const room = this.track.halfWidth - 1.2;

    const traffic = this.traffic(car, proj, others, lineOffset, room, dt);
    // Overtaking comes first; otherwise take a boost pad if it's close to the line.
    const towardsPad = this.passSide === 0 ? this.seekBoostPad(proj, boostPads, traffic.offset) : traffic.offset;
    const wantedOffset = this.avoidObstacles(proj, obstacles, towardsPad, room);
    const wantedShift = wantedOffset - lineOffset;
    this.shift += clamp(wantedShift - this.shift, -LINE_CHANGE_RATE * dt, LINE_CHANGE_RATE * dt);

    const offset = clamp(lineOffset + this.shift, -room, room);
    const p = this.track.points[aimIndex];
    const t = this.track.tangent(aimIndex);
    const aimX = p.x - t.z * offset;
    const aimZ = p.z + t.x * offset;

    let headingError = Math.atan2(aimZ - car.z, aimX - car.x) - car.heading;
    headingError = Math.atan2(Math.sin(headingError), Math.cos(headingError));
    const steer = clamp(headingError * this.skill.steerGain, -1, 1);

    // Look a few metres ahead for the target speed, so braking starts before the corner.
    const speedIndex = (proj.index + Math.round(3 / this.line.spacing)) % n;
    const target = Math.min(this.line.targetSpeed[speedIndex] * pace, traffic.speedCap);
    let throttle = clamp((target - forwardSpeed(car)) / SPEED_ERROR_FOR_FULL, -1, 1);
    // Pointing well away from the target (after a spin or a shunt): ease off while turning.
    if (Math.abs(headingError) > 0.9) throttle = Math.min(throttle, 0.5);

    return { input: { throttle, steer, handbrake: false }, respawn: this.checkStuck(car, proj, dt) };
  }

  /**
   * Works out where to drive among the other cars: on the racing line when it's clear, in a lane
   * beside a slower car to pass it, never squeezing a car alongside, and following when boxed in.
   * Positions are sideways offsets from the centreline, with other cars placed relative to this
   * one (close enough while cars point roughly along the track).
   */
  private traffic(
    car: CarState,
    proj: Projection,
    others: CarState[],
    lineOffset: number,
    room: number,
    dt: number,
  ): Traffic {
    const fx = Math.cos(car.heading);
    const fz = Math.sin(car.heading);
    const mySpeed = forwardSpeed(car);
    const nearby = others.map((o) => {
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const side = dx * -fz + dz * fx;
      return { ahead: dx * fx + dz * fz, side, lateral: proj.lateral + side, speed: o.vx * fx + o.vz * fz };
    });

    // The nearest slower car ahead that's on the racing line or right in front of this car.
    let blocker: (typeof nearby)[number] | undefined = undefined;
    for (const o of nearby) {
      if (o.ahead <= 0 || o.ahead > LOOK_AHEAD_FOR_CARS || o.speed > mySpeed + 1) continue;
      const inTheWay =
        Math.abs(o.lateral - lineOffset) < IN_THE_WAY_SIDE || Math.abs(o.side) < IN_THE_WAY_SIDE;
      if (inTheWay && (!blocker || o.ahead < blocker.ahead)) blocker = o;
    }

    this.passTime = Math.max(0, this.passTime - dt);
    let offset = lineOffset;
    if (blocker) {
      const fits = (side: number) => Math.abs(blocker.lateral + side * PASS_OFFSET) <= room;
      if (this.passSide === 0 || !fits(this.passSide)) {
        // Prefer the side with more road; keep the current side unless it no longer fits.
        const preferred = blocker.lateral > 0 ? -1 : 1;
        this.passSide = fits(preferred) ? preferred : fits(-preferred) ? -preferred : preferred;
      }
      this.passTime = PASS_COMMIT_SECONDS;
      this.passOffset = blocker.lateral + this.passSide * PASS_OFFSET;
    } else if (this.passTime === 0) {
      this.passSide = 0;
    }
    if (this.passSide !== 0) offset = this.passOffset;

    // Leave room for cars alongside instead of steering into them.
    for (const o of nearby) {
      if (Math.abs(o.ahead) > 2.5) continue;
      if (o.side > 0) offset = Math.min(offset, o.lateral - PASS_OFFSET * 0.8);
      else offset = Math.max(offset, o.lateral + PASS_OFFSET * 0.8);
    }
    offset = clamp(offset, -room, room);

    // Right behind a car with no way round: match its speed rather than ram it.
    const boxedIn = blocker !== undefined && blocker.ahead < FOLLOW_DISTANCE && Math.abs(blocker.side) < 1.8;
    return { offset, speedCap: boxedIn ? Math.max(0, blocker!.speed - 0.5) : Infinity };
  }

  /** Aims at the nearest boost pad just up the track, if it's only a small detour. */
  private seekBoostPad(proj: Projection, pads: Obstacle[], offset: number): number {
    const length = this.track.length;
    let best: Obstacle | undefined = undefined;
    let bestAhead = BOOST_PAD_LOOKAHEAD;
    for (const pad of pads) {
      const ahead = ((pad.distance - proj.distance + 1 + length) % length) - 1;
      if (ahead < 0 || ahead > bestAhead || Math.abs(pad.lateral - offset) > BOOST_PAD_MAX_DETOUR) continue;
      best = pad;
      bestAhead = ahead;
    }
    return best !== undefined ? best.lateral : offset;
  }

  /** Moves the aim off any obstacle just up the track that sits where the car is heading. */
  private avoidObstacles(proj: Projection, obstacles: Obstacle[], offset: number, room: number): number {
    const length = this.track.length;
    for (const o of obstacles) {
      // Measured along the track, so hazards on another part of the circuit never count.
      const ahead = ((o.distance - proj.distance + 1 + length) % length) - 1;
      if (ahead > OBSTACLE_LOOKAHEAD) continue;
      const lateral = o.lateral;
      const clear = o.radius + OBSTACLE_CLEARANCE;
      if (Math.abs(offset - lateral) >= clear) continue;
      // Go round on whichever side is closer to where it was heading, if there's room.
      const left = lateral - clear;
      const right = lateral + clear;
      const preferRight = offset >= lateral;
      if (preferRight) offset = right <= room ? right : left;
      else offset = left >= -room ? left : right;
    }
    return clamp(offset, -room, room);
  }

  private checkStuck(car: CarState, proj: Projection, dt: number): boolean {
    const alongTrack = car.vx * proj.tx + car.vz * proj.tz;
    this.stuckTime = alongTrack < 1.5 ? this.stuckTime + dt : 0;
    if (this.stuckTime < STUCK_SECONDS) return false;
    this.stuckTime = 0;
    return true;
  }

  /** Call when the race restarts or the car is respawned. */
  reset(): void {
    this.stuckTime = 0;
    this.shift = 0;
    this.passSide = 0;
    this.passTime = 0;
    this.passOffset = 0;
  }
}
