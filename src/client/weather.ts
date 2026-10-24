import { part, PartModel } from './itemModels';
import { seededRandom } from '../shared/items';
import type { Weather } from '../shared/tracks';

// Ambient weather over the track: snow, dust, embers or ice glitter drifting around the car, or
// tumbleweeds rolling across the wind. Purely visual: nothing here reads or changes the cars or the race.
//
// The web draws the flurries as points in a box that rolls with the car. Here each flurry is a
// ParticleEmitter on an invisible Part kept over the car, with LockedToPart so the particles move with
// it: the box stays round the car, and the density in view holds at any speed.

export interface Vec2 {
  x: number;
  z: number;
}

/** The flurry box is this wide (across the wind), this deep (along it) and this tall, centred on the car. */
export const FLURRY_WIDTH = 70;
export const FLURRY_DEPTH = 50;
export const FLURRY_HEIGHT = 30;
/** The web's box is 90 by 90 by 30, and its particle counts are for that. Ours is scaled to the same density. */
const WEB_BOX_VOLUME = 90 * 90 * 30;
const BOX_VOLUME = FLURRY_WIDTH * FLURRY_DEPTH * FLURRY_HEIGHT;

const SMOKE = 'rbxasset://textures/particles/smoke_main.dds';
const SPARKLE = 'rbxasset://textures/particles/sparkles_main.dds';
const FIRE = 'rbxasset://textures/particles/fire_main.dds';

/** How one kind of drifting-particle weather looks and moves. */
interface Flurry {
  /** Particles on the web's box. The emitter's rate is scaled from this. */
  count: number;
  /** Speed the particles leave with (studs/s), and how long each lives (s). */
  speed: [number, number];
  life: [number, number];
  /** Wind drift (studs/s). Dust is blown along the wind; the others are nudged by it. */
  drift: number;
  /** Which way the particles leave: falling, rising, or along the wind for dust. */
  direction: 'Bottom' | 'Top' | 'Front';
  /** Particle size in studs, and how opaque it is at its fullest. */
  size: number;
  opacity: number;
  /** How much a particle glows on its own (0 to 1). */
  light: number;
  texture: string;
  /** The colour a particle starts with and the one it ends with. */
  core: string;
  rim: string;
  /** Spin (deg/s) either way. */
  spin: number;
}

const FLURRIES: Record<Exclude<Weather, 'tumbleweeds'>, Flurry> = {
  snow: {
    count: 2600,
    speed: [2.5, 5],
    life: [6, 12],
    drift: 0.6,
    direction: 'Bottom',
    size: 0.3,
    opacity: 0.9,
    light: 0,
    texture: SMOKE,
    core: '#ffffff',
    // A faint cool-grey rim, so flakes still show against snowy ground.
    rim: '#96a8c4',
    spin: 40,
  },
  // Fine dust blowing sideways across Mars.
  dust: {
    count: 1500,
    speed: [4, 6],
    life: [8, 12],
    drift: 5,
    direction: 'Front',
    size: 0.25,
    opacity: 0.6,
    light: 0,
    texture: SMOKE,
    core: '#f2cda0',
    rim: '#c88c5a',
    spin: 20,
  },
  // Sparks lifting off Io's lava.
  embers: {
    count: 700,
    speed: [1.5, 4],
    life: [6, 10],
    drift: 0.4,
    direction: 'Top',
    size: 0.3,
    opacity: 1,
    light: 1,
    texture: FIRE,
    core: '#ffe182',
    rim: '#ff5a14',
    spin: 30,
  },
  // Ice crystals catching the light over Europa.
  glitter: {
    count: 900,
    speed: [0.4, 1.2],
    life: [4, 8],
    drift: 0.3,
    direction: 'Bottom',
    size: 0.25,
    opacity: 1,
    light: 0.6,
    texture: SPARKLE,
    core: '#ffffff',
    rim: '#78c8ff',
    spin: 120,
  },
};

const TUMBLE_MIN = 2;
const TUMBLE_MAX = 4;
const TUMBLE_RADIUS = 0.8;
const TUMBLE_SPEED_MIN = 5;
const TUMBLE_SPEED_MAX = 9;
/** Sideways drift (m/s), either way. */
const TUMBLE_DRIFT = 1;
/** Spawn this far upwind of the car, and up to this far to either side of the wind line. */
const TUMBLE_SPAWN_MIN = 45;
const TUMBLE_SPAWN_MAX = 55;
const TUMBLE_SPAWN_ACROSS = 22;
/** Removed once it is this far downwind of the car. */
const TUMBLE_FAR_SIDE = 60;
/** Safety limit for one that's left far behind, e.g. after the car is moved. */
const TUMBLE_GONE_DISTANCE = 150;
/** Seconds away before a tumbleweed rolls in again. */
const TUMBLE_WAIT_MIN = 1;
const TUMBLE_WAIT_MAX = 4;
/** Height of each hop (m), and how fast the hops come (rad/s of the bounce phase). */
const TUMBLE_HOP_MIN = 0.3;
const TUMBLE_HOP_MAX = 0.6;
const TUMBLE_HOP_RATE = 7;

interface Tumbleweed {
  model: PartModel;
  active: boolean;
  /** Seconds until it rolls in again, while it's away. */
  wait: number;
  x: number;
  z: number;
  speed: number;
  drift: number;
  hop: number;
  bouncePhase: number;
  spin: number;
}

/** A random horizontal wind direction, as a unit vector. */
export function randomWind(rand: () => number): Vec2 {
  const angle = rand() * math.pi * 2;
  return { x: math.cos(angle), z: math.sin(angle) };
}

/** The direction across the wind, to the right of it. */
export function acrossWind(wind: Vec2): Vec2 {
  return { x: -wind.z, z: wind.x };
}

/** Where a tumbleweed rolls in from: upwind of the focus, and across the wind line by up to a set distance. */
export function tumbleweedSpawn(wind: Vec2, focusX: number, focusZ: number, rand: () => number): Vec2 {
  const upwind = TUMBLE_SPAWN_MIN + rand() * (TUMBLE_SPAWN_MAX - TUMBLE_SPAWN_MIN);
  const offset = (rand() * 2 - 1) * TUMBLE_SPAWN_ACROSS;
  const across = acrossWind(wind);
  return {
    x: focusX - wind.x * upwind + across.x * offset,
    z: focusZ - wind.z * upwind + across.z * offset,
  };
}

/** True once a tumbleweed is far enough downwind, or far enough away, to be put away. */
export function tumbleweedGone(along: number, away: number): boolean {
  return along > TUMBLE_FAR_SIDE || away > TUMBLE_GONE_DISTANCE;
}

/** Height of a tumbleweed's centre (studs) at a point in its bounce: it rests on the radius and hops up. */
export function hopHeight(phase: number, hop: number): number {
  return TUMBLE_RADIUS + hop * math.abs(math.sin(phase));
}

/** The emitter's face for a direction. The emitter's Front face points along the Part's look vector. */
function normalFor(direction: Flurry['direction']): Enum.NormalId {
  if (direction === 'Top') return Enum.NormalId.Top;
  if (direction === 'Front') return Enum.NormalId.Front;
  return Enum.NormalId.Bottom;
}

/** Fades a particle in, holds it at its opacity, and fades it out over its life. */
function fade(opacity: number): NumberSequence {
  const hidden = 1 - opacity;
  return new NumberSequence([
    new NumberSequenceKeypoint(0, 1),
    new NumberSequenceKeypoint(0.12, hidden),
    new NumberSequenceKeypoint(0.85, hidden),
    new NumberSequenceKeypoint(1, 1),
  ]);
}

/**
 * An invisible Part over the car, with a ParticleEmitter in it. The Part is the emission box, so its size
 * is the flurry box; with LockedToPart the particles move with it. Returns the Part, which update() moves.
 */
function createFlurry(parent: Instance, flurry: Flurry, wind: Vec2): Part {
  const anchor = part(new Vector3(FLURRY_WIDTH, FLURRY_HEIGHT, FLURRY_DEPTH), Color3.fromRGB(255, 255, 255), parent);
  anchor.Transparency = 1;

  const lifeMid = (flurry.life[0] + flurry.life[1]) / 2;
  const emitter = new Instance('ParticleEmitter');
  emitter.Shape = Enum.ParticleEmitterShape.Box;
  emitter.EmissionDirection = normalFor(flurry.direction);
  emitter.LockedToPart = true;
  emitter.Rate = (flurry.count * (BOX_VOLUME / WEB_BOX_VOLUME)) / lifeMid;
  emitter.Lifetime = new NumberRange(flurry.life[0], flurry.life[1]);
  emitter.Speed = new NumberRange(flurry.speed[0], flurry.speed[1]);
  emitter.SpreadAngle = new Vector2(20, 20);
  emitter.Size = new NumberSequence(flurry.size);
  emitter.Transparency = fade(flurry.opacity);
  emitter.Color = new ColorSequence(Color3.fromHex(flurry.core), Color3.fromHex(flurry.rim));
  emitter.LightEmission = flurry.light;
  emitter.Texture = flurry.texture;
  emitter.Rotation = new NumberRange(0, 360);
  emitter.RotSpeed = new NumberRange(-flurry.spin, flurry.spin);
  // A gentle push on the falling and rising kinds, so they drift with the wind. Dust is already moving along it.
  if (flurry.direction !== 'Front') {
    emitter.Acceleration = new Vector3(wind.x * flurry.drift * 0.2, 0, wind.z * flurry.drift * 0.2);
  }
  emitter.Parent = anchor;
  return anchor;
}

/** A few tan low-poly balls that roll across the wind, bouncing as they go. */
export class WeatherView {
  private readonly root: Folder;
  private readonly kind: Weather;
  private readonly rand: () => number;
  private readonly wind: Vec2;
  private readonly across: Vec2;
  /** The rolling axis across the wind: rolling about it turns the ball the way it travels. */
  private readonly rollAxis: Vector3;
  /** The emission box, for the flurry kinds. */
  private readonly anchor?: Part;
  private readonly weeds: Tumbleweed[] = [];

  /**
   * Builds the weather for a track theme. The seed sets the wind, as the web's raceCount does. It's
   * optional, so a caller that passes only the kind and parent gets the same wind every race.
   */
  constructor(kind: Weather, parent: Instance, seed: number = 1) {
    this.root = new Instance('Folder');
    this.root.Parent = parent;
    this.kind = kind;
    this.rand = seededRandom(seed);
    this.wind = randomWind(this.rand);
    this.across = acrossWind(this.wind);
    this.rollAxis = new Vector3(this.wind.z, 0, -this.wind.x);

    if (kind === 'tumbleweeds') {
      this.anchor = undefined;
      this.buildTumbleweeds();
    } else {
      this.anchor = createFlurry(this.root, FLURRIES[kind], this.wind);
    }
  }

  /** Moves the weather one frame. The focus is the point the camera looks at, the player's car. */
  update(dt: number, focusX: number, focusZ: number): void {
    if (this.anchor !== undefined) {
      this.placeAnchor(this.anchor, focusX, focusZ);
      return;
    }
    this.updateTumbleweeds(dt, focusX, focusZ);
  }

  /** Removes the weather's Parts and emitters. */
  destroy(): void {
    this.root.Destroy();
  }

  private placeAnchor(anchor: Part, focusX: number, focusZ: number): void {
    const at = new Vector3(focusX, FLURRY_HEIGHT / 2, focusZ);
    if (this.kind === 'dust') {
      // Turn the box so its front faces downwind, so the dust is emitted along the wind.
      anchor.CFrame = CFrame.lookAt(at, at.add(new Vector3(this.wind.x, 0, this.wind.z)));
    } else {
      anchor.CFrame = new CFrame(at);
    }
  }

  private buildTumbleweeds(): void {
    // The web draws a dark wireframe over the ball to make it look twiggy. Roblox has none, so three
    // thin twigs cross the ball instead, and they turn with it.
    const count = TUMBLE_MIN + math.floor(this.rand() * (TUMBLE_MAX - TUMBLE_MIN + 1));
    for (let i = 0; i < count; i++) {
      const model = new PartModel(this.root);
      const body = part(new Vector3(TUMBLE_RADIUS * 2, TUMBLE_RADIUS * 2, TUMBLE_RADIUS * 2), Color3.fromHex('#b8925c'), this.root, Enum.Material.Wood, Enum.PartType.Ball);
      model.add(body, new CFrame());
      const twigColour = Color3.fromHex('#4a3220');
      const twigSize = new Vector3(TUMBLE_RADIUS * 2.4, 0.14, 0.14);
      model.add(part(twigSize, twigColour, this.root, Enum.Material.Wood, Enum.PartType.Cylinder), CFrame.Angles(0, 0, 0));
      model.add(part(twigSize, twigColour, this.root, Enum.Material.Wood, Enum.PartType.Cylinder), CFrame.Angles(0, math.pi / 3, math.pi / 4));
      model.add(part(twigSize, twigColour, this.root, Enum.Material.Wood, Enum.PartType.Cylinder), CFrame.Angles(0, -math.pi / 3, -math.pi / 4));
      model.setVisible(false);
      // Staggered, so they don't all come in at once.
      this.weeds.push({
        model,
        active: false,
        wait: this.rand() * TUMBLE_WAIT_MAX,
        x: 0,
        z: 0,
        speed: 0,
        drift: 0,
        hop: 0,
        bouncePhase: 0,
        spin: 0,
      });
    }
  }

  /** Puts one back upwind of the focus, and sends it on its way. */
  private spawn(weed: Tumbleweed, focusX: number, focusZ: number): void {
    const spot = tumbleweedSpawn(this.wind, focusX, focusZ, this.rand);
    weed.x = spot.x;
    weed.z = spot.z;
    weed.speed = TUMBLE_SPEED_MIN + this.rand() * (TUMBLE_SPEED_MAX - TUMBLE_SPEED_MIN);
    weed.drift = (this.rand() * 2 - 1) * TUMBLE_DRIFT;
    weed.hop = TUMBLE_HOP_MIN + this.rand() * (TUMBLE_HOP_MAX - TUMBLE_HOP_MIN);
    weed.bouncePhase = this.rand() * math.pi * 2;
    weed.spin = 0;
    weed.active = true;
    weed.model.setVisible(true);
  }

  private updateTumbleweeds(dt: number, focusX: number, focusZ: number): void {
    for (const weed of this.weeds) {
      if (!weed.active) {
        weed.wait -= dt;
        if (weed.wait <= 0) this.spawn(weed, focusX, focusZ);
        continue;
      }

      weed.x += (this.wind.x * weed.speed + this.across.x * weed.drift) * dt;
      weed.z += (this.wind.z * weed.speed + this.across.z * weed.drift) * dt;
      weed.spin += (weed.speed / TUMBLE_RADIUS) * dt;
      weed.bouncePhase += TUMBLE_HOP_RATE * dt;
      const height = hopHeight(weed.bouncePhase, weed.hop);
      weed.model.place(new CFrame(weed.x, height, weed.z).mul(CFrame.fromAxisAngle(this.rollAxis, weed.spin)));

      const along = (weed.x - focusX) * this.wind.x + (weed.z - focusZ) * this.wind.z;
      const away = math.sqrt((weed.x - focusX) * (weed.x - focusX) + (weed.z - focusZ) * (weed.z - focusZ));
      if (tumbleweedGone(along, away)) {
        weed.active = false;
        weed.model.setVisible(false);
        weed.wait = TUMBLE_WAIT_MIN + this.rand() * (TUMBLE_WAIT_MAX - TUMBLE_WAIT_MIN);
      }
    }
  }
}
