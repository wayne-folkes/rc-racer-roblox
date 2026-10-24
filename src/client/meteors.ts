import { part } from './itemModels';
import { seededRandom } from '../shared/items';
import type { TrackPath } from '../shared/trackPath';

// Meteors for the Space Cup: now and then one streaks in near the car, hits the ground beside the track
// in a flash, a shockwave and a spray of rock, and leaves a crater behind. They land clear of the road.
// Purely visual: nothing here touches the cars or the race.
//
// MeteorSchedule holds the timing and the landing rules, with no Roblox in them, so Node can test them.
// MeteorShower builds the Parts and animates them.

/** Seconds between impacts, and the wait before the first. */
export const GAP_MIN = 4;
export const GAP_MAX = 9;
export const FIRST_MIN = 1.5;
export const FIRST_MAX = 4;
/** Impacts land this far from the car, which keeps them on screen. */
export const NEAR = 8;
export const FAR = 28;
export const CRATER_MIN = 1.6;
export const CRATER_MAX = 3.4;
/** Craters keep this far clear of the road: the curb and wall, and the crater's rim. */
export const ROAD_MARGIN = 0.9 + 0.6 + 1.5;
export const RIM = 1.25;
/** Craters from earlier impacts stay, up to this many; then the oldest goes. */
export const MAX_CRATERS = 12;
const AIM_ATTEMPTS = 14;
const CRATER_Y = 0.02;
const CRATER_GROW = 0.25;

const FALL_TIME = 0.7;
const FALL_HEIGHT = 40;
/** How far across the ground a meteor travels while it falls. */
const FALL_DRIFT = 16;
const TRAIL_LENGTH = 6;

const FLASH_TIME = 0.4;
const RING_TIME = 0.7;
/** The shockwave is this many short Neon pieces round a circle. The crater's rim takes the same count. */
const RING_SEGMENTS = 16;
const ROCKS = 12;
const ROCK_GRAVITY = 14;
const ROCK_LIFE = 1.4;
/** Rocks that land below this height are hidden, as on the web. */
const ROCK_LANDED = 0.1;

/** Where a meteor is to land: the spot on the ground, the crater's radius, and the bearing it falls in from. */
export interface Landing {
  x: number;
  z: number;
  radius: number;
  drift: number;
}

interface Crater {
  x: number;
  z: number;
  radius: number;
}

function distance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return math.sqrt(dx * dx + dz * dz);
}

/**
 * When the next meteor is due, and where it lands. Pure: no Roblox, so it can be tested in Node. The random
 * numbers are drawn in the same order as the web's meteorScene.ts, so a seed gives the same pattern.
 */
export class MeteorSchedule {
  private wait: number;
  private readonly craters: Crater[] = [];

  constructor(
    private readonly track: TrackPath,
    private readonly rand: () => number,
  ) {
    this.wait = FIRST_MIN + rand() * (FIRST_MAX - FIRST_MIN);
  }

  /** Counts the wait down by dt. True when a meteor is due, and the wait for the next one is set. */
  countdown(dt: number): boolean {
    this.wait -= dt;
    if (this.wait > 0) return false;
    this.wait = GAP_MIN + this.rand() * (GAP_MAX - GAP_MIN);
    return true;
  }

  /**
   * A spot near the focus, clear of the road and of the craters already there, or undefined if none turned up
   * in a few tries. The spot is NEAR to FAR from the focus.
   */
  aim(focusX: number, focusZ: number): Landing | undefined {
    for (let attempt = 0; attempt < AIM_ATTEMPTS; attempt++) {
      const angle = this.rand() * math.pi * 2;
      const reach = NEAR + this.rand() * (FAR - NEAR);
      const x = focusX + math.cos(angle) * reach;
      const z = focusZ + math.sin(angle) * reach;
      const radius = CRATER_MIN + this.rand() * (CRATER_MAX - CRATER_MIN);
      if (math.abs(this.track.project(x, z).lateral) < this.track.halfWidth + ROAD_MARGIN + radius * RIM) continue;
      if (this.craters.some((c) => distance(c.x, c.z, x, z) < (c.radius + radius) * RIM + 1)) continue;
      return { x, z, radius, drift: this.rand() * math.pi * 2 };
    }
    return undefined;
  }

  /** A meteor has hit and left this crater. True if the oldest one had to go to keep the count down. */
  settle(x: number, z: number, radius: number): boolean {
    this.craters.push({ x, z, radius });
    if (this.craters.size() <= MAX_CRATERS) return false;
    this.craters.shift();
    return true;
  }

  /** How many craters the schedule is still counting. */
  craterCount(): number {
    return this.craters.size();
  }
}

interface Falling {
  model: Model;
  head: Part;
  streak: Part;
  age: number;
  from: Vector3;
  to: Vector3;
  /** Unit direction of travel, from the sky to the ground. */
  dir: Vector3;
  radius: number;
}

interface Rock {
  part: Part;
  pos: Vector3;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
}

interface Impact {
  model: Model;
  flash: Part;
  ring: Part[];
  rocks: Rock[];
  age: number;
  radius: number;
  x: number;
  z: number;
}

interface CraterView {
  model: Model;
  floor: Part;
  rim: Part[];
  age: number;
  radius: number;
  x: number;
  z: number;
}

/** A crater's floor is a flat cylinder: this turns its axis (X) to up (Y). */
function upright(): CFrame {
  return CFrame.Angles(0, 0, math.pi / 2);
}

/** Meteors for one track. `groundColor` is the ground colour, which the craters are shaded from. */
export class MeteorShower {
  private readonly root: Folder;
  private readonly rand: () => number;
  private readonly schedule: MeteorSchedule;
  private readonly falling: Falling[] = [];
  private readonly impacts: Impact[] = [];
  private readonly craters: CraterView[] = [];
  private readonly floorColor: Color3;
  private readonly rimColor: Color3;
  private readonly rockColor: Color3;

  constructor(track: TrackPath, groundColor: string, seed: number, parent: Instance) {
    this.root = new Instance('Folder');
    this.root.Parent = parent;
    this.rand = seededRandom(seed);
    this.schedule = new MeteorSchedule(track, this.rand);
    const ground = Color3.fromHex(groundColor);
    const black = Color3.fromRGB(0, 0, 0);
    const white = Color3.fromRGB(255, 255, 255);
    // Shaded like the web: the floor at 55% of the ground, the rim paler, the rock at 70%.
    this.floorColor = ground.Lerp(black, 0.45);
    this.rimColor = ground.Lerp(white, 0.3);
    this.rockColor = ground.Lerp(black, 0.3);
  }

  /** Moves the meteors one frame. The focus is the point the camera follows, the player's car. */
  update(dt: number, focusX: number, focusZ: number): void {
    if (this.schedule.countdown(dt)) {
      const landing = this.schedule.aim(focusX, focusZ);
      if (landing !== undefined) this.launch(landing);
    }

    for (let i = this.falling.size() - 1; i >= 0; i--) {
      const meteor = this.falling[i];
      meteor.age += dt;
      const t = math.min(1, meteor.age / FALL_TIME);
      const at = meteor.from.Lerp(meteor.to, t);
      meteor.head.CFrame = new CFrame(at);
      // The streak trails behind the head, along the path it has come.
      const tailAt = at.sub(meteor.dir.mul(TRAIL_LENGTH / 2));
      meteor.streak.CFrame = CFrame.lookAt(tailAt, tailAt.add(meteor.dir));
      if (t < 1) continue;
      this.strike(meteor.to.X, meteor.to.Z, meteor.radius);
      meteor.model.Destroy();
      this.falling.remove(i);
    }

    for (let i = this.impacts.size() - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      impact.age += dt;
      this.animateImpact(impact, dt);
      if (impact.age > ROCK_LIFE) {
        impact.model.Destroy();
        this.impacts.remove(i);
      }
    }

    for (const crater of this.craters) {
      if (crater.age >= CRATER_GROW) continue;
      crater.age += dt;
      // Eased out, so it opens fast and settles.
      const t = math.min(1, crater.age / CRATER_GROW);
      this.sizeCrater(crater, crater.radius * (1 - (1 - t) * (1 - t)));
    }
  }

  /** Removes everything this shower has made. */
  destroy(): void {
    this.root.Destroy();
  }

  private launch(landing: Landing): void {
    const to = new Vector3(landing.x, 0, landing.z);
    const from = new Vector3(
      landing.x + math.cos(landing.drift) * FALL_DRIFT,
      FALL_HEIGHT,
      landing.z + math.sin(landing.drift) * FALL_DRIFT,
    );
    const model = new Instance('Model');
    model.Parent = this.root;
    const head = part(new Vector3(0.8, 0.8, 0.8), Color3.fromHex('#fff1c8'), model, Enum.Material.Neon, Enum.PartType.Ball);
    const streak = part(new Vector3(0.5, 0.5, TRAIL_LENGTH), Color3.fromHex('#ff9a3c'), model, Enum.Material.Neon);
    streak.Transparency = 0.25;
    this.falling.push({
      model,
      head,
      streak,
      age: 0,
      from,
      to,
      dir: to.sub(from).Unit,
      radius: landing.radius,
    });
  }

  private strike(x: number, z: number, radius: number): void {
    const model = new Instance('Model');
    model.Parent = this.root;
    const flash = part(new Vector3(1, 1, 1), Color3.fromHex('#fff1c8'), model, Enum.Material.Neon, Enum.PartType.Ball);
    const ring: Part[] = [];
    for (let k = 0; k < RING_SEGMENTS; k++) {
      ring.push(part(new Vector3(1, 0.02, 1), Color3.fromHex('#ffe2b0'), model, Enum.Material.Neon));
    }

    // The rocks are drawn in the web's order: heading, outward speed, size, then the upward speed.
    const rocks: Rock[] = [];
    for (let k = 0; k < ROCKS; k++) {
      const heading = this.rand() * math.pi * 2;
      const outward = (3 + this.rand() * 6) * (0.6 + radius / CRATER_MAX);
      const scale = 0.6 + this.rand() * 1.2;
      const size = 0.5 * scale;
      const rock = part(new Vector3(size, size, size), this.rockColor, model, Enum.Material.Slate, Enum.PartType.Ball);
      const vy = 5 + this.rand() * 6;
      rocks.push({
        part: rock,
        pos: new Vector3(x, 0.3, z),
        vx: math.cos(heading) * outward,
        vy,
        vz: math.sin(heading) * outward,
        spinX: 0,
        spinZ: 0,
      });
    }

    this.impacts.push({ model, flash, ring, rocks, age: 0, radius, x, z });

    // The schedule keeps the same list of craters, in the same order, and says when it has dropped the oldest.
    const dropped = this.schedule.settle(x, z, radius);
    this.craters.push(this.buildCrater(x, z, radius));
    if (dropped) this.craters.shift()!.model.Destroy();
  }

  private animateImpact(impact: Impact, dt: number): void {
    // The flash: grows and fades.
    const flashT = math.min(1, impact.age / FLASH_TIME);
    const diameter = impact.radius * (2 + 5 * flashT);
    impact.flash.Size = new Vector3(diameter, diameter, diameter);
    impact.flash.Transparency = flashT;

    // The shockwave: a ring that widens and fades, drawn as pieces round its middle.
    const ringT = math.min(1, impact.age / RING_TIME);
    const reach = impact.radius * (1 + 3.5 * ringT);
    const mid = reach * 0.92;
    const width = reach * 0.15;
    const arc = ((2 * math.pi * mid) / RING_SEGMENTS) * 1.05;
    for (let k = 0; k < RING_SEGMENTS; k++) {
      const a = (k / RING_SEGMENTS) * 2 * math.pi;
      const piece = impact.ring[k];
      piece.Size = new Vector3(width, 0.02, arc);
      piece.CFrame = new CFrame(impact.x, CRATER_Y + 0.01, impact.z).mul(CFrame.Angles(0, a, 0)).mul(new CFrame(mid, 0, 0));
      piece.Transparency = 1 - 0.8 * (1 - ringT);
    }

    // The rock: thrown up and out, and hidden once it lands.
    for (const rock of impact.rocks) {
      rock.vy -= ROCK_GRAVITY * dt;
      rock.pos = rock.pos.add(new Vector3(rock.vx * dt, rock.vy * dt, rock.vz * dt));
      rock.spinX += rock.vz * dt;
      rock.spinZ -= rock.vx * dt;
      rock.part.CFrame = new CFrame(rock.pos).mul(CFrame.Angles(rock.spinX, 0, rock.spinZ));
      rock.part.Transparency = rock.pos.Y > ROCK_LANDED ? 0 : 1;
    }
  }

  /** A flat floor and a paler rim, both built from parts. Starts small and is grown by update(). */
  private buildCrater(x: number, z: number, radius: number): CraterView {
    const model = new Instance('Model');
    model.Parent = this.root;
    const floor = part(new Vector3(0.04, 0.02, 0.02), this.floorColor, model, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder);
    floor.CFrame = new CFrame(x, CRATER_Y, z).mul(upright());
    const rim: Part[] = [];
    for (let k = 0; k < RING_SEGMENTS; k++) {
      rim.push(part(new Vector3(0.1, 0.04, 0.1), this.rimColor, model, Enum.Material.SmoothPlastic));
    }
    const crater: CraterView = { model, floor, rim, age: 0, radius, x, z };
    this.sizeCrater(crater, 0.01);
    return crater;
  }

  private sizeCrater(crater: CraterView, grown: number): void {
    const r = math.max(0.01, grown);
    crater.floor.Size = new Vector3(0.04, 2 * r, 2 * r);
    const mid = r * (1 + RIM) / 2;
    const width = r * (RIM - 1);
    const arc = ((2 * math.pi * mid) / RING_SEGMENTS) * 1.05;
    for (let k = 0; k < RING_SEGMENTS; k++) {
      const a = (k / RING_SEGMENTS) * 2 * math.pi;
      const piece = crater.rim[k];
      piece.Size = new Vector3(width, 0.04, arc);
      piece.CFrame = new CFrame(crater.x, CRATER_Y, crater.z).mul(CFrame.Angles(0, a, 0)).mul(new CFrame(mid, 0, 0));
    }
  }
}
