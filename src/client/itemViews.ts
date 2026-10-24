import { ItemSystem, seededRandom, type ItemEvent, type TrackLayout } from 'shared/items';
import { RAMP_HEIGHT, RAMP_LENGTH, type Ramp } from 'shared/jumps';
import { MISSILE_FIELDS } from 'shared/protocol';
import type { TrackPath } from 'shared/trackPath';
import { ROAD_TOP } from 'shared/tracks';
import { FACE_CAMERA_YAW } from './followCamera';
import { blob, bombModel, missileModel, part, ringModel, type PartModel } from './itemModels';

// What items look like, from rc-racer's itemScene.ts and rampScene.ts, in Parts: oil and puddles,
// boost pads, ramps, item boxes, bombs and missiles, and explosions. Nothing here affects the race:
// the server decides pickups, missiles, bombs and hits, and this draws what it says.

/** Missiles fly at this speed (items.ts MISSILE_SPEED), for drawing them between snapshots. */
const MISSILE_SPEED = 42;
/** Don't fly a missile on for longer than this without hearing about it. */
const MAX_EXTRAPOLATE = 0.2;
/** Flat things on the road sit this far above it, clear of it so they don't flicker. */
const DECAL_LIFT = 0.04;
/** Missiles fly this high. */
const MISSILE_Y = 0.5;

// Item boxes, as on the web: the item itself, bigger, bobbing over a glowing ring and swaying either
// side of facing the camera, so a slim missile never turns edge-on.
/** Height of the line item boxes bob around. */
const BOX_Y = 0.9;
/** Lowest point of a bomb box, so it hovers just above the road. */
const PICKUP_FLOOR = 0.35;
const BOMB_PICKUP_SCALE = 1.6;
/** The missile is slim, so its box is drawn bigger still. */
const MISSILE_PICKUP_SCALE = 2.3;
/** Nose-up tilt for the missile box, so it reads from the high camera. */
const MISSILE_PICKUP_TILT = 0.35;
/** How far boxes sway either side of facing the camera (radians). */
const PICKUP_SWAY = 0.35;
const RING_LIFT = 0.03;

// Boost pads, as on the web: three chevron arrows on the road that light up in turn, back to front.
const ARROW_COUNT = 3;
const ARROW_SPACING = 1.1;
/** Seconds for one chase along the arrows, and how far each arrow lags the one behind (share of a chase). */
const CHASE_PERIOD = 1;
const CHASE_LAG = 0.15;
/** Each chevron is a ">" of two bars, from the web's chevron shape: 1.4 wide, 0.78 long. */
const ARM_LENGTH = 0.9;
const ARM_WIDTH = 0.19;
const ARM_ANGLE = math.atan2(0.58, 0.64);
const ARROW_YELLOW = Color3.fromHex('#fde047');
const RING_COLOR = { missile: Color3.fromHex('#ff5a36'), bomb: Color3.fromHex('#a855f7') };

interface BoxView {
  item: PartModel;
  /** Where the item sits relative to the bobbing, swaying holder. */
  inHolder: CFrame;
  ring: PartModel;
  x: number;
  z: number;
  /** Each box bobs a little out of step with the others. */
  phase: number;
}

/** A puddle's pool sits this far above its rim, clear of it so they don't flicker. */
const POOL_LIFT = 0.04;
const OIL = Color3.fromHex('#17171f');
const PUDDLE = Color3.fromHex('#5fb8e6');
const PUDDLE_RIM = Color3.fromHex('#e6f7ff');

interface MissileView {
  model: PartModel;
  x: number;
  z: number;
  heading: number;
  seen: boolean;
}

export class ItemViews {
  private readonly folder = new Instance('Folder');
  /** Hazards and boost pads: rebuilt when a race rolls new hazards. */
  private layoutFolder: Folder | undefined;
  private readonly boxes = new Map<number, BoxView>();
  /** Every pad's bars for each arrow, back to front, so the chase can light them together. */
  private arrows: Part[][] = [];
  private readonly bombs = new Map<number, { model: PartModel; spark: Part }>();
  private readonly missiles = new Map<number, MissileView>();
  private missileTime = -math.huge;
  private clock = 0;

  constructor(
    track: TrackPath,
    layout: TrackLayout,
    ramps: Ramp[],
  ) {
    this.folder.Name = 'Items';
    this.folder.Parent = game.Workspace;
    for (const ramp of ramps) this.buildRamp(ramp);
    // Item boxes are the same every race. A full ItemSystem numbers them the way the server's does.
    for (const p of new ItemSystem(track, 1, layout, 1).pickups) {
      const missile = p.kind === 'missile';
      const ring = ringModel(this.folder, RING_COLOR[p.kind]);
      ring.place(new CFrame(p.x, ROAD_TOP + RING_LIFT, p.z));
      const item = missile
        ? missileModel(this.folder, MISSILE_PICKUP_SCALE)
        : bombModel(this.folder, BOMB_PICKUP_SCALE).model;
      // The missile is centred and tipped nose-up; the bomb's foot is lowered to the floor line.
      const inHolder = missile
        ? CFrame.Angles(0, 0, MISSILE_PICKUP_TILT).mul(new CFrame(0.25 * MISSILE_PICKUP_SCALE, 0, 0))
        : new CFrame(0, PICKUP_FLOOR - BOX_Y, 0);
      this.boxes.set(p.id, { item, inHolder, ring, x: p.x, z: p.z, phase: p.id * 1.7 });
    }
  }

  /** Draws a race's oil, puddles and boost pads, from the device's copy of its items. */
  setLayout(items: ItemSystem): void {
    this.layoutFolder?.Destroy();
    const folder = new Instance('Folder');
    folder.Name = 'Layout';
    items.hazards.forEach((h, index) => {
      // As on the web: one of three blob shapes, each hazard turned its own way.
      const shape = () => seededRandom((index % 3) + 1);
      const turn = index * 1.7;
      const y = ROAD_TOP + DECAL_LIFT;
      if (h.kind === 'oil') {
        blob(h.x, y, h.z, h.radius, shape(), turn, (w) => {
          w.Color = OIL;
          w.Material = Enum.Material.Glass;
        }, folder);
        return;
      }
      // A pale rim round a slightly smaller see-through blue pool. The pool shows the rim through
      // it, not the dark road, so it reads as water.
      blob(h.x, y, h.z, h.radius, shape(), turn, (w) => {
        w.Color = PUDDLE_RIM;
        w.Transparency = 0.25;
      }, folder);
      blob(h.x, y + POOL_LIFT, h.z, h.radius * 0.86, shape(), turn, (w) => {
        w.Color = PUDDLE;
        w.Transparency = 0.4;
        w.Reflectance = 0.15;
      }, folder);
    });
    this.arrows = [];
    for (let i = 0; i < ARROW_COUNT; i++) this.arrows.push([]);
    for (const pad of items.boostPads) {
      // Built along +X, the way cars drive over it, then turned to the pad's heading.
      const root = new CFrame(pad.x, ROAD_TOP + DECAL_LIFT, pad.z).mul(CFrame.Angles(0, -pad.heading, 0));
      for (let i = 0; i < ARROW_COUNT; i++) {
        const x = (i - (ARROW_COUNT - 1) / 2) * ARROW_SPACING;
        for (const side of [-1, 1]) {
          // Each bar runs from the back corner of the ">" to its tip.
          const bar = part(new Vector3(ARM_LENGTH, 0.02, ARM_WIDTH), ARROW_YELLOW, folder);
          bar.CFrame = root.mul(new CFrame(x - 0.06, 0, side * 0.29)).mul(CFrame.Angles(0, side * ARM_ANGLE, 0));
          this.arrows[i].push(bar);
        }
      }
    }
    folder.Parent = this.folder;
    this.layoutFolder = folder;
  }

  private buildRamp(ramp: Ramp) {
    // A WedgePart rises towards its back (+Z), so its back faces the way cars drive.
    const forward = new Vector3(math.cos(ramp.heading), 0, math.sin(ramp.heading));
    const centre = new Vector3(ramp.x, ROAD_TOP + RAMP_HEIGHT / 2, ramp.z);
    const wedge = new Instance('WedgePart');
    wedge.Anchored = true;
    wedge.CanCollide = false;
    wedge.CanQuery = false;
    wedge.CanTouch = false;
    wedge.Material = Enum.Material.SmoothPlastic;
    wedge.Color = Color3.fromHex('#f2c230');
    wedge.Size = new Vector3(ramp.width, RAMP_HEIGHT, RAMP_LENGTH);
    wedge.CFrame = CFrame.lookAt(centre, centre.sub(forward));
    wedge.Parent = this.folder;
  }

  /** Item boxes that are taken, and the bombs on the track, from the race state. */
  syncState(pickupsDown: number[], bombs: number[]): void {
    for (const [id, box] of this.boxes) {
      const ready = !pickupsDown.includes(id);
      box.item.setVisible(ready);
      box.ring.setVisible(ready);
    }

    const live = new Set<number>();
    for (let k = 0; k + 2 < bombs.size(); k += 3) {
      const [id, x, z] = [bombs[k], bombs[k + 1], bombs[k + 2]];
      live.add(id);
      if (!this.bombs.has(id)) {
        const bomb = bombModel(this.folder);
        bomb.model.place(new CFrame(x, ROAD_TOP, z));
        this.bombs.set(id, bomb);
      }
    }
    for (const [id, bomb] of this.bombs) {
      if (live.has(id)) continue;
      bomb.model.destroy();
      this.bombs.delete(id);
    }
  }

  /** Missiles in flight, from the end of a snapshot. */
  onSnapshot(time: number, data: number[], offset: number): void {
    if (time <= this.missileTime) return;
    this.missileTime = time;
    for (const [, m] of this.missiles) m.seen = false;
    for (let k = offset; k + MISSILE_FIELDS <= data.size(); k += MISSILE_FIELDS) {
      const id = data[k];
      let m = this.missiles.get(id);
      if (!m) {
        m = { model: missileModel(this.folder), x: 0, z: 0, heading: 0, seen: true };
        this.missiles.set(id, m);
      }
      m.x = data[k + 1];
      m.z = data[k + 2];
      m.heading = data[k + 3];
      m.seen = true;
    }
    for (const [id, m] of this.missiles) {
      if (m.seen) continue;
      m.model.destroy();
      this.missiles.delete(id);
    }
  }

  /** Removes everything, for a change of track. */
  destroy(): void {
    this.folder.Destroy();
  }

  /** Explosions where missiles and bombs go off. */
  onEvent(e: ItemEvent): void {
    if (e.type !== 'explode') return;
    const blast = new Instance('Explosion');
    blast.Position = new Vector3(e.x, ROAD_TOP + 0.6, e.z);
    blast.BlastRadius = 2.5;
    // Just the look: nothing here is physical.
    blast.BlastPressure = 0;
    blast.DestroyJointRadiusPercent = 0;
    blast.ExplosionType = Enum.ExplosionType.NoCraters;
    blast.Parent = game.Workspace;
  }

  update(dt: number, serverNow: number): void {
    this.clock += dt;
    const t = this.clock;
    for (const [, box] of this.boxes) {
      const bob = math.sin(t * 2.4 + box.phase) * 0.12;
      const sway = math.sin(t * 1.3 + box.phase) * PICKUP_SWAY;
      const holder = new CFrame(box.x, ROAD_TOP + BOX_Y + bob, box.z).mul(
        CFrame.Angles(math.sin(t * 1.7 + box.phase) * 0.12, FACE_CAMERA_YAW + sway, 0),
      );
      box.item.place(holder.mul(box.inHolder));
    }

    // Each arrow lights in turn, back to front; every pad chases together.
    this.arrows.forEach((bars, i) => {
      const wave = 0.5 + 0.5 * math.cos(2 * math.pi * (t / CHASE_PERIOD - i * CHASE_LAG));
      const material = wave ** 4 > 0.35 ? Enum.Material.Neon : Enum.Material.SmoothPlastic;
      for (const bar of bars) bar.Material = material;
    });

    // Live bombs blink; a bomb in an item box glows steadily, so it doesn't look armed.
    const on = t % 0.6 < 0.3;
    for (const [, bomb] of this.bombs) bomb.spark.Transparency = on ? 0 : 0.7;

    const age = math.clamp(serverNow - this.missileTime, 0, MAX_EXTRAPOLATE);
    for (const [, m] of this.missiles) {
      const x = m.x + math.cos(m.heading) * MISSILE_SPEED * age;
      const z = m.z + math.sin(m.heading) * MISSILE_SPEED * age;
      m.model.place(new CFrame(x, ROAD_TOP + MISSILE_Y, z).mul(CFrame.Angles(0, -m.heading, 0)));
    }
  }
}
