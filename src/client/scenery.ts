import type { Point, TrackPath } from 'shared/trackPath';
import type { PondStyle, Scenery, TrackTheme } from 'shared/tracks';
// A relative path, so the Node tests resolve it too; roblox-ts compiles either form.
import { seededRandom } from '../shared/items';
import { blob, part } from './itemModels';

// The web game's scenery (trackScene.ts), built from Parts. The plan is plain data and draws every random
// number in the web's order, so each object lands where the web's does: planScenery() is what the tests
// run in Node, and buildScenery() turns the plan into Parts. Parts are anchored and never collide, query or
// touch, so nothing here affects the cars.

type Rand = () => number;

/** Scenery is scattered this far beyond the track's bounding box. */
const SCENERY_MARGIN = 30;
/** Scenery keeps this far clear of the road's edge. */
export const SCENERY_CLEARANCE = 4;
const SCENERY_SEED = 7;
/** Ponds keep this far clear of the road's edge, measured from the pond's edge. */
export const POND_CLEARANCE = 6;
export const POND_SPACING = 14;
/** The web's ponds have this many corners, and their jitter is drawn from the same stream, so later ponds match. */
const POND_CORNERS = 12;
/** The corner count of itemModels' blob, which draws one jitter value per corner. */
const BLOB_CORNERS = 20;
const CURB_WIDTH = 0.9;
/** Cracks keep this far clear of the kerb's edge. */
export const CRACK_CLEARANCE = 1.5;
/** A crater's rim reaches this many times its floor's radius. */
const CRATER_RIM = 1.25;
/** Cones and frustums are stacked from this many cylinders. */
const TIERS = 3;
const LEAF_COUNT = 3;

/** How far each scattered kind reaches from its centre, which its clearance from the road adds to. */
export const SCATTER_REACH: Record<string, number> = {
  crater: 4.5,
  mesa: 4.5,
  volcano: 6,
  spikes: 1,
  spires: 1,
  books: 2,
  toyBall: 1,
  cereal: 1.3,
  castle: 3,
  toolbox: 1,
  tower: 4,
  billboard: 1.3,
  tank: 1.4,
  container: 3.4,
  streetLight: 1.4,
  sign: 1.6,
};

/** Flat pieces are this thick. Their centres sit at these heights, so no two that overlap share a surface. */
const FLAT = 0.02;
const RIM_Y = 0.02;
const FLOOR_Y = 0.04;
const CRACK_Y = 0.03;
const LAVA_Y = 0.03;
const POND_RIM_Y = 0.02;
const POND_POOL_Y = 0.04;

interface Arm {
  side: number;
  height: number;
}

interface Spike {
  scale: number;
  x: number;
  z: number;
  tilt: number;
}

interface Spire {
  height: number;
  x: number;
  z: number;
  tiltX: number;
  tiltZ: number;
}

interface Book {
  width: number;
  depth: number;
  height: number;
  color: string;
  turn: number;
}

/** What a scenery object is, with the draws that set its size, colour and shape. */
export type Shape =
  | { kind: 'tree'; scale: number; leaf: number }
  | { kind: 'cactus'; scale: number; arms: Arm[] }
  | { kind: 'rock'; scale: number }
  | { kind: 'pine'; scale: number }
  | { kind: 'crater'; radius: number; footprint: number }
  | { kind: 'boulder'; scale: number; depth: number; color: string }
  | { kind: 'flag' }
  | { kind: 'mesa'; height: number; width: number; depth: number }
  | { kind: 'volcano'; scale: number }
  | { kind: 'spikes'; spikes: Spike[] }
  | { kind: 'spires'; spires: Spire[] }
  | { kind: 'crack'; length: number }
  | { kind: 'block'; size: number; color: string; top?: { color: string; turn: number } }
  | { kind: 'books'; books: Book[] }
  | { kind: 'toyBall'; radius: number; color: string }
  | { kind: 'cereal'; width: number; depth: number; height: number; color: string }
  | { kind: 'tin'; radius: number; height: number; label: string }
  | { kind: 'fruit'; radius: number; color: string }
  | { kind: 'castle'; scale: number }
  | { kind: 'bucket'; color: string }
  | { kind: 'spade'; color: string }
  | { kind: 'tyres'; count: number }
  | { kind: 'paint'; height: number; lid: string }
  | { kind: 'toolbox' }
  | { kind: 'tower'; width: number; depth: number; height: number; color: string; neon: string }
  | { kind: 'billboard'; color: string }
  | { kind: 'airCon'; width: number }
  | { kind: 'tank' }
  | { kind: 'aerial'; height: number }
  | { kind: 'container'; color: string; top?: { color: string; turn: number } }
  | { kind: 'bollard' }
  | { kind: 'crate'; scale: number }
  | { kind: 'lamp' }
  | { kind: 'streetLight' }
  | { kind: 'sign' }
  | { kind: 'bush'; scale: number }
  | { kind: 'pond'; style: PondStyle; radius: number; jitter: number[] };

/** A piece of scenery on the ground. `rotation` turns it about the vertical axis, as the web's rotation.y does. */
export type SceneryObject = Shape & { x: number; z: number; rotation: number };

interface Made {
  shape: Shape;
  /** The radius of the ground a flat object covers, or 0 for one that doesn't need the flat rule. */
  footprint: number;
}

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Flat {
  x: number;
  z: number;
  r: number;
}

/** The track's bounding box, grown by the scenery margin on every side. */
function sceneryBox(track: TrackPath): Box {
  let minX = math.huge;
  let maxX = -math.huge;
  let minZ = math.huge;
  let maxZ = -math.huge;
  for (const p of track.points) {
    minX = math.min(minX, p.x);
    maxX = math.max(maxX, p.x);
    minZ = math.min(minZ, p.z);
    maxZ = math.max(maxZ, p.z);
  }
  return {
    minX: minX - SCENERY_MARGIN,
    maxX: maxX + SCENERY_MARGIN,
    minZ: minZ - SCENERY_MARGIN,
    maxZ: maxZ + SCENERY_MARGIN,
  };
}

/** Whether a point lies inside the closed loop of track points (even-odd ray cast). */
function insideLoop(points: Point[], x: number, z: number): boolean {
  let inside = false;
  let j = points.size() - 1;
  for (let i = 0; i < points.size(); i++) {
    const a = points[i];
    const b = points[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    j = i;
  }
  return inside;
}

/**
 * Scatters up to `count` objects in the scenery box, skipping spots on or near the road. `reach` is how far
 * the object spreads from its centre, so its edges keep clear of the road too. An object with a footprint is
 * also kept clear of the others that have one: flat objects that overlapped would flicker where they met.
 */
function scatter(track: TrackPath, rand: Rand, count: number, reach: number, make: () => Made): SceneryObject[] {
  const out: SceneryObject[] = [];
  const box = sceneryBox(track);
  const flats: Flat[] = [];
  for (let attempt = 0; attempt < 2000 && out.size() < count; attempt++) {
    const x = box.minX + rand() * (box.maxX - box.minX);
    const z = box.minZ + rand() * (box.maxZ - box.minZ);
    if (math.abs(track.project(x, z).lateral) < track.halfWidth + SCENERY_CLEARANCE + reach) continue;

    const made = make();
    if (made.footprint > 0) {
      const footprint = made.footprint;
      if (flats.some((other) => math.sqrt((other.x - x) * (other.x - x) + (other.z - z) * (other.z - z)) < other.r + footprint + 0.5)) {
        continue;
      }
      flats.push({ x, z, r: footprint });
    }
    const rotation = rand() * math.pi * 2;
    out.push({ ...made.shape, x, z, rotation });
  }
  return out;
}

function append(into: SceneryObject[], more: SceneryObject[]): void {
  for (const object of more) into.push(object);
}

/** A colour from a list, with one draw, as the web's pick does. */
function pick(rand: Rand, list: string[]): string {
  return list[math.floor(rand() * list.size())];
}

function planTrees(track: TrackPath, rand: Rand): SceneryObject[] {
  return scatter(track, rand, 140, 0, () => {
    const scale = 0.7 + rand() * 0.7;
    const leaf = math.floor(rand() * LEAF_COUNT);
    return { shape: { kind: 'tree', scale, leaf }, footprint: 0 };
  });
}

/** Saguaros, with a sandy rock now and then. */
function planCacti(track: TrackPath, rand: Rand): SceneryObject[] {
  return scatter(track, rand, 120, 0, () => {
    if (rand() < 0.2) {
      const scale = 0.6 + rand() * 0.8;
      return { shape: { kind: 'rock', scale }, footprint: 0 };
    }
    // Arms run out from the trunk, then turn up.
    const arms = 1 + math.floor(rand() * 2);
    const first = rand() < 0.5 ? -1 : 1;
    const list: Arm[] = [];
    for (let i = 0; i < arms; i++) {
      const side = i === 0 ? first : -first;
      list.push({ side, height: 0.9 + rand() * 0.6 });
    }
    const scale = 0.8 + rand() * 0.5;
    return { shape: { kind: 'cactus', scale, arms: list }, footprint: 0 };
  });
}

function planPines(track: TrackPath, rand: Rand): SceneryObject[] {
  return scatter(track, rand, 120, 0, () => {
    const scale = 0.8 + rand() * 0.6;
    return { shape: { kind: 'pine', scale }, footprint: 0 };
  });
}

/** Moon: shallow craters, and grey boulders with the odd flag. */
function planCraters(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 80, SCATTER_REACH.crater, () => {
    const radius = 1.4 + rand() * 2.2;
    const footprint = radius * CRATER_RIM;
    return { shape: { kind: 'crater', radius, footprint }, footprint };
  });
  append(
    out,
    scatter(track, rand, 90, 0, () => {
      if (rand() < 0.04) return { shape: { kind: 'flag' }, footprint: 0 };
      const scale = 0.5 + rand() * 1.1;
      return { shape: { kind: 'boulder', scale, depth: 0.85, color: '#9b9ba1' }, footprint: 0 };
    }),
  );
  return out;
}

/** Mars: rust-red boulders and flat-topped mesas. */
function planMesas(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 26, SCATTER_REACH.mesa, () => {
    const height = 1.2 + rand() * 1.8;
    const width = 2.2 + rand() * 1.6;
    const depth = 2.2 + rand() * 1.6;
    return { shape: { kind: 'mesa', height, width, depth }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 100, 0, () => {
      const scale = 0.5 + rand() * 1.2;
      return { shape: { kind: 'boulder', scale, depth: 0.9, color: '#8f3f22' }, footprint: 0 };
    }),
  );
  return out;
}

/** Io: squat volcano cones with a glowing vent, and clusters of pale sulphur spikes. */
function planVolcanoes(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 20, SCATTER_REACH.volcano, () => {
    const scale = 0.8 + rand() * 0.6;
    return { shape: { kind: 'volcano', scale }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 70, SCATTER_REACH.spikes, () => {
      const n = 2 + math.floor(rand() * 3);
      const spikes: Spike[] = [];
      for (let i = 0; i < n; i++) {
        const scale = 0.6 + rand() * 1.1;
        const x = (rand() - 0.5) * 1.2;
        const z = (rand() - 0.5) * 1.2;
        const tilt = (rand() - 0.5) * 0.3;
        spikes.push({ scale, x, z, tilt });
      }
      return { shape: { kind: 'spikes', spikes }, footprint: 0 };
    }),
  );
  return out;
}

/** Europa: tilted ice spires, and the long reddish cracks across the surface. */
function planIce(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 60, SCATTER_REACH.spires, () => {
    const n = 1 + math.floor(rand() * 3);
    const spires: Spire[] = [];
    for (let i = 0; i < n; i++) {
      const height = 2 + rand() * 3.2;
      const x = (rand() - 0.5) * 1.6;
      const z = (rand() - 0.5) * 1.6;
      const tiltX = (rand() - 0.5) * 0.3;
      const tiltZ = (rand() - 0.5) * 0.3;
      spires.push({ height, x, z, tiltX, tiltZ });
    }
    return { shape: { kind: 'spires', spires }, footprint: 0 };
  });
  append(out, planCracks(track, rand));
  return out;
}

/** Thin lines lying on the ground, each a few bent segments long. A crack stops short of the road. */
function planCracks(track: TrackPath, rand: Rand): SceneryObject[] {
  const out: SceneryObject[] = [];
  const box = sceneryBox(track);
  const keepClear = track.halfWidth + CURB_WIDTH + CRACK_CLEARANCE;
  const clear = (x: number, z: number) => math.abs(track.project(x, z).lateral) > keepClear;

  let made = 0;
  for (let attempt = 0; made < 22 && attempt < 400; attempt++) {
    let x = box.minX + rand() * (box.maxX - box.minX);
    let z = box.minZ + rand() * (box.maxZ - box.minZ);
    if (!clear(x, z)) continue;
    let heading = rand() * math.pi * 2;
    for (let k = 0; k < 4; k++) {
      const length = 6 + rand() * 4;
      heading += (rand() - 0.5) * 1;
      const nx = x + math.cos(heading) * length;
      const nz = z + math.sin(heading) * length;
      if (!clear(nx, nz) || !clear((x + nx) / 2, (z + nz) / 2)) break;
      // Each segment is centred between its ends, and turned as the web's rotation.y is.
      out.push({ kind: 'crack', length, x: (x + nx) / 2, z: (z + nz) / 2, rotation: -heading });
      x = nx;
      z = nz;
    }
    made++;
  }
  return out;
}

/** Bedroom: building blocks, some stacked two high, piles of books and the odd ball. */
function planToys(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 140, 0, () => {
    const size = 0.8 + rand() * 0.8;
    const color = pick(rand, COLOR.toys);
    if (rand() < 0.3) {
      const topColor = pick(rand, COLOR.toys);
      const turn = rand() * (math.pi / 2);
      return { shape: { kind: 'block', size, color, top: { color: topColor, turn } }, footprint: 0 };
    }
    return { shape: { kind: 'block', size, color }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 24, SCATTER_REACH.books, () => {
      const n = 2 + math.floor(rand() * 3);
      const books: Book[] = [];
      for (let i = 0; i < n; i++) {
        const width = 2.4 + rand() * 0.8;
        const depth = 1.7 + rand() * 0.5;
        const height = 0.3 + rand() * 0.2;
        const color = pick(rand, COLOR.books);
        const turn = (rand() - 0.5) * 0.5;
        books.push({ width, depth, height, color, turn });
      }
      return { shape: { kind: 'books', books }, footprint: 0 };
    }),
  );
  append(
    out,
    scatter(track, rand, 24, SCATTER_REACH.toyBall, () => {
      const radius = 0.6 + rand() * 0.6;
      return { shape: { kind: 'toyBall', radius, color: pick(rand, COLOR.toys) }, footprint: 0 };
    }),
  );
  return out;
}

/** Kitchen: cereal boxes, tins and fruit dropped on the floor. */
function planPantry(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 40, SCATTER_REACH.cereal, () => {
    const width = 1.6 + rand() * 0.6;
    const depth = 0.6 + rand() * 0.2;
    const height = 2.2 + rand() * 0.8;
    return { shape: { kind: 'cereal', width, depth, height, color: pick(rand, COLOR.packets) }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 90, 0, () => {
      const radius = 0.35 + rand() * 0.2;
      const height = 0.8 + rand() * 0.6;
      return { shape: { kind: 'tin', radius, height, label: pick(rand, COLOR.labels) }, footprint: 0 };
    }),
  );
  append(
    out,
    scatter(track, rand, 50, 0, () => {
      const radius = 0.35 + rand() * 0.2;
      return { shape: { kind: 'fruit', radius, color: pick(rand, COLOR.fruit) }, footprint: 0 };
    }),
  );
  return out;
}

/** Sandbox: sandcastles with a tower at each corner, and buckets and spades left lying about. */
function planSandcastles(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 20, SCATTER_REACH.castle, () => {
    const scale = 0.9 + rand() * 0.5;
    return { shape: { kind: 'castle', scale }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 50, 0, () => ({ shape: { kind: 'bucket', color: pick(rand, COLOR.toys) }, footprint: 0 })),
  );
  append(
    out,
    scatter(track, rand, 40, 0, () => ({ shape: { kind: 'spade', color: pick(rand, COLOR.toys) }, footprint: 0 })),
  );
  return out;
}

/** Garage: stacks of tyres, paint tins and red toolboxes. */
function planWorkshop(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 50, 0, () => {
    const count = 1 + math.floor(rand() * 3);
    return { shape: { kind: 'tyres', count }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 70, 0, () => {
      const height = 0.7 + rand() * 0.3;
      return { shape: { kind: 'paint', height, lid: pick(rand, COLOR.toys) }, footprint: 0 };
    }),
  );
  append(out, scatter(track, rand, 20, SCATTER_REACH.toolbox, () => ({ shape: { kind: 'toolbox' }, footprint: 0 })));
  return out;
}

/** Downtown: dark towers ringed with neon bands, and neon billboards on poles. */
function planSkyscrapers(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 50, SCATTER_REACH.tower, () => {
    const width = 3 + rand() * 2.5;
    const depth = 3 + rand() * 2.5;
    const height = 4 + rand() * 6;
    const color = pick(rand, COLOR.towers);
    const neon = pick(rand, COLOR.neon);
    return { shape: { kind: 'tower', width, depth, height, color, neon }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 24, SCATTER_REACH.billboard, () => ({
      shape: { kind: 'billboard', color: pick(rand, COLOR.neon) },
      footprint: 0,
    })),
  );
  return out;
}

/** Rooftops: air-conditioning units, water tanks on legs, and aerials with a red light on top. */
function planRooftop(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 80, 0, () => {
    const width = 1.2 + rand() * 0.6;
    return { shape: { kind: 'airCon', width }, footprint: 0 };
  });
  append(out, scatter(track, rand, 20, SCATTER_REACH.tank, () => ({ shape: { kind: 'tank' }, footprint: 0 })));
  append(
    out,
    scatter(track, rand, 36, 0, () => {
      const height = 3 + rand() * 2;
      return { shape: { kind: 'aerial', height }, footprint: 0 };
    }),
  );
  return out;
}

/** Docks: shipping containers, some stacked two high, wooden crates and the odd bollard, and lamps along the quay. */
function planContainers(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 44, SCATTER_REACH.container, () => {
    const color = pick(rand, COLOR.containers);
    if (rand() < 0.35) {
      const topColor = pick(rand, COLOR.containers);
      const turn = (rand() - 0.5) * 0.2;
      return { shape: { kind: 'container', color, top: { color: topColor, turn } }, footprint: 0 };
    }
    return { shape: { kind: 'container', color }, footprint: 0 };
  });
  append(
    out,
    scatter(track, rand, 70, 0, () => {
      if (rand() < 0.15) return { shape: { kind: 'bollard' }, footprint: 0 };
      const scale = 0.9 + rand() * 0.5;
      return { shape: { kind: 'crate', scale }, footprint: 0 };
    }),
  );
  append(out, scatter(track, rand, 24, 0, () => ({ shape: { kind: 'lamp' }, footprint: 0 })));
  return out;
}

/** Freeway: street lights with a glowing head, green road signs, and dark bushes on the verge. */
function planStreetlights(track: TrackPath, rand: Rand): SceneryObject[] {
  const out = scatter(track, rand, 60, SCATTER_REACH.streetLight, () => ({
    shape: { kind: 'streetLight' },
    footprint: 0,
  }));
  append(out, scatter(track, rand, 14, SCATTER_REACH.sign, () => ({ shape: { kind: 'sign' }, footprint: 0 })));
  append(
    out,
    scatter(track, rand, 110, 0, () => {
      const scale = 0.6 + rand() * 0.8;
      return { shape: { kind: 'bush', scale }, footprint: 0 };
    }),
  );
  return out;
}

/** Flat, irregular pools, light blue or glowing lava: some in the infield, some outside the loop. */
function planPonds(track: TrackPath, rand: Rand, style: PondStyle): SceneryObject[] {
  const box = sceneryBox(track);
  const centres: Point[] = [];
  const out: SceneryObject[] = [];

  // Infield ponds first, so there's always a chance of one even on a tight loop.
  const fill = (infield: boolean, wanted: number) => {
    let found = 0;
    for (let attempt = 0; attempt < 4000 && found < wanted; attempt++) {
      const x = box.minX + rand() * (box.maxX - box.minX);
      const z = box.minZ + rand() * (box.maxZ - box.minZ);
      if (insideLoop(track.points, x, z) !== infield) continue;
      const radius = 2 + rand() * 1.5;
      if (math.abs(track.project(x, z).lateral) < track.halfWidth + POND_CLEARANCE + radius) continue;
      if (centres.some((c) => math.sqrt((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z)) < POND_SPACING)) continue;

      centres.push({ x, z });
      const jitter: number[] = [];
      for (let i = 0; i < POND_CORNERS; i++) jitter.push(rand());
      out.push({ kind: 'pond', style, radius, jitter, x, z, rotation: 0 });
      found++;
    }
  };
  fill(true, 3);
  fill(false, 3);
  return out;
}

type Planner = (track: TrackPath, rand: Rand) => SceneryObject[];

const PLANNERS: Record<Scenery, Planner> = {
  trees: planTrees,
  cacti: planCacti,
  pines: planPines,
  craters: planCraters,
  mesas: planMesas,
  volcanoes: planVolcanoes,
  ice: planIce,
  toys: planToys,
  pantry: planPantry,
  sandcastles: planSandcastles,
  workshop: planWorkshop,
  skyscrapers: planSkyscrapers,
  rooftop: planRooftop,
  containers: planContainers,
  streetlights: planStreetlights,
};

/** The theme's scenery, then its ponds if the theme has them. Deterministic, so a track looks the same every load. */
export function planScenery(track: TrackPath, theme: TrackTheme): SceneryObject[] {
  const rand = seededRandom(SCENERY_SEED);
  const objects = PLANNERS[theme.scenery](track, rand);
  if (theme.ponds !== undefined) append(objects, planPonds(track, rand, theme.ponds));
  return objects;
}

// Building. Every object is built in its own frame: its root sits at its ground position and turned by its
// rotation, and each Part is offset from there. Sizes are baked in, since a Part can't be scaled as a group.

const COLOR = {
  trunk: '#7a5230',
  leaves: ['#2f8f46', '#3aa356', '#27753a'],
  cactus: '#4f8f3a',
  sandRock: '#c49a6c',
  needle: '#1f5a3a',
  snow: '#ffffff',
  rim: '#b6b6bc',
  floor: '#5d5d64',
  pole: '#d8d8d8',
  cloth: '#e0e0e8',
  mesaBody: '#a64a28',
  mesaTop: '#c26a3e',
  volcano: '#7a5a22',
  vent: '#ff7a1c',
  spike: '#f4e662',
  ice: '#c4e5f7',
  crack: '#8a4a3c',
  // The track's puddles: a pale rim round a translucent pool.
  puddleRim: '#e6f7ff',
  puddlePool: '#5fb8e6',
  lava: '#ff6a1a',
  // Bedroom and garage: the toy colours are shared, and the books and their stacks have their own.
  toys: ['#e53b3b', '#f2c12e', '#3b7be5', '#3bb54a', '#f08a24'],
  books: ['#8c2f39', '#2f5d8c', '#3c7a4a', '#c9a227', '#6b3fa0', '#d9d2c3'],
  // Kitchen.
  packets: ['#e8b531', '#d9443a', '#3f7fd1', '#5aa64a'],
  labels: ['#d9443a', '#3f7fd1', '#f2c12e', '#3bb54a', '#ffffff'],
  fruit: ['#e0301e', '#f5a623', '#9bc53d'],
  tinCan: '#c9ced4',
  cerealPanel: '#fff6e0',
  // Sandbox.
  sand: '#d6b878',
  sandTower: '#ccab68',
  // Garage.
  tyre: '#1f1f24',
  hub: '#6a6d75',
  paintTin: '#b9bec4',
  toolbox: '#c8302c',
  toolHandle: '#2a2a2e',
  // Downtown.
  towers: ['#262a3a', '#2f3347', '#1f2230'],
  neon: ['#ff3cac', '#2de2e6', '#f9c80e', '#7b5cff'],
  neonPole: '#3a3d48',
  // Rooftops.
  acUnit: '#8a8f99',
  acFan: '#3a3d44',
  tankLeg: '#4a4d55',
  tankWood: '#7a5638',
  tankRoof: '#5a3f29',
  mast: '#9aa0aa',
  redLight: '#ff3030',
  // Docks.
  containers: ['#c2402f', '#2f6fb3', '#3a8f4f', '#d68b2a', '#6d6f75'],
  crate: '#9a7148',
  bollard: '#2c2c30',
  bollardCap: '#e0b52a',
  lampPole: '#5d616b',
  lampHead: '#ffcf7a',
  // Freeway.
  streetPole: '#6a6e78',
  streetHead: '#ffd27a',
  signPost: '#8a8f99',
  sign: '#2a8f58',
  bush: '#1d3b26',
  // Milk and oil, as ponds.
  milk: '#fbfaf3',
  oil: '#121216',
};

/** The four corners of a square, as the web's towers and tank legs sit at them. */
const CORNERS: number[][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** A Part at `offset` within `root`, in SmoothPlastic. Its physics and queries are off, as the other scenery's are. */
function place(parent: Instance, root: CFrame, offset: CFrame, size: Vector3, color: string, shape: Enum.PartType, shadow: boolean): Part {
  const p = part(size, Color3.fromHex(color), parent, Enum.Material.SmoothPlastic, shape);
  p.CFrame = root.mul(offset);
  p.CastShadow = shadow;
  return p;
}

/** A cylinder standing upright. Its axis is its X, so it is turned onto Y; `width` and `depth` are its two diameters. */
function standing(parent: Instance, root: CFrame, offset: CFrame, height: number, width: number, depth: number, color: string, shadow: boolean): Part {
  return place(parent, root, offset.mul(CFrame.Angles(0, 0, math.pi / 2)), new Vector3(height, width, depth), color, Enum.PartType.Cylinder, shadow);
}

/** A cylinder lying along X, as its axis already is. */
function lying(parent: Instance, root: CFrame, offset: CFrame, length: number, diameter: number, color: string, shadow: boolean): Part {
  return place(parent, root, offset, new Vector3(length, diameter, diameter), color, Enum.PartType.Cylinder, shadow);
}

function block(parent: Instance, root: CFrame, offset: CFrame, size: Vector3, color: string, shadow: boolean): Part {
  return place(parent, root, offset, size, color, Enum.PartType.Block, shadow);
}

/** A squashed rock: a block Part rounded off by a sphere mesh, since a Ball Part has to be uniform. */
function rock(parent: Instance, root: CFrame, offset: CFrame, size: Vector3, color: string, shadow: boolean): Part {
  const p = block(parent, root, offset, size, color, shadow);
  const mesh = new Instance('SpecialMesh');
  mesh.MeshType = Enum.MeshType.Sphere;
  mesh.Parent = p;
  return p;
}

/** A ball of radius `radius` centred at `offset`. A Ball Part has to be uniform, so its diameter is all three sides. */
function sphere(parent: Instance, root: CFrame, offset: CFrame, radius: number, color: string, shadow: boolean): Part {
  return place(parent, root, offset, new Vector3(2 * radius, 2 * radius, 2 * radius), color, Enum.PartType.Ball, shadow);
}

/** A flat disc on the ground at height `y`, centred on the root. */
function disc(parent: Instance, root: CFrame, y: number, diameter: number, color: string): Part {
  return standing(parent, root, new CFrame(0, y, 0), FLAT, diameter, diameter, color, false);
}

/**
 * A cone or frustum from TIERS stacked cylinders, each narrower than the one below. A tier's radius is taken
 * at its middle, so the stack's volume follows the frustum's. `bottom` and `top` are the x and z radii.
 */
function frustum(parent: Instance, root: CFrame, baseY: number, height: number, bottom: [number, number], top: [number, number], color: string, shadow: boolean): void {
  for (let k = 0; k < TIERS; k++) {
    const t = (k + 0.5) / TIERS;
    const width = 2 * (bottom[0] + (top[0] - bottom[0]) * t);
    const depth = 2 * (bottom[1] + (top[1] - bottom[1]) * t);
    standing(parent, root, new CFrame(0, baseY + ((k + 0.5) * height) / TIERS, 0), height / TIERS, width, depth, color, shadow);
  }
}

function cone(parent: Instance, root: CFrame, baseY: number, height: number, radius: number, color: string, shadow: boolean): void {
  frustum(parent, root, baseY, height, [radius, radius], [0, 0], color, shadow);
}

/** Feeds blob one jitter value per corner, from the pond's planned values, so the outline is the same each time. */
function jitterSource(values: number[]): () => number {
  let corner = 0;
  return () => {
    const value = values[math.floor((corner * POND_CORNERS) / BLOB_CORNERS)];
    corner++;
    return value;
  };
}

function buildObject(o: SceneryObject, parent: Instance): void {
  const root = new CFrame(o.x, 0, o.z).mul(CFrame.Angles(0, o.rotation, 0));
  switch (o.kind) {
    case 'tree': {
      const s = o.scale;
      standing(parent, root, new CFrame(0, 0.6 * s, 0), 1.2 * s, 0.55 * s, 0.55 * s, COLOR.trunk, true);
      cone(parent, root, 1.1 * s, 3 * s, 1.4 * s, COLOR.leaves[o.leaf], true);
      break;
    }
    case 'cactus': {
      const s = o.scale;
      standing(parent, root, new CFrame(0, 1.3 * s, 0), 2.6 * s, 0.48 * s, 0.48 * s, COLOR.cactus, true);
      for (const arm of o.arms) {
        lying(parent, root, new CFrame(arm.side * 0.42 * s, arm.height * s, 0), 0.6 * s, 0.26 * s, COLOR.cactus, true);
        standing(parent, root, new CFrame(arm.side * 0.72 * s, (arm.height + 0.45) * s, 0), 0.9 * s, 0.26 * s, 0.26 * s, COLOR.cactus, true);
      }
      break;
    }
    case 'rock': {
      const s = o.scale;
      rock(parent, root, new CFrame(0, 0.15 * s, 0), new Vector3(s, 0.55 * s, 0.8 * s), COLOR.sandRock, true);
      break;
    }
    case 'pine': {
      const s = o.scale;
      cone(parent, root, 0, 2.2 * s, 1.5 * s, COLOR.needle, true);
      cone(parent, root, 1.5 * s, 1.8 * s, 1.1 * s, COLOR.needle, true);
      cone(parent, root, 2.6 * s, 1.4 * s, 0.7 * s, COLOR.needle, true);
      // The snow cap is a small square pillar turned 45 degrees, its diagonal matching the cone's base.
      block(parent, root, new CFrame(0, 3.78 * s, 0).mul(CFrame.Angles(0, math.pi / 4, 0)), new Vector3(0.37 * s, 0.44 * s, 0.37 * s), COLOR.snow, true);
      break;
    }
    case 'crater': {
      // A pale rim a quarter wider than the dark floor, both flat on the ground.
      disc(parent, root, RIM_Y, 2 * o.radius * CRATER_RIM, COLOR.rim);
      disc(parent, root, FLOOR_Y, 2 * o.radius, COLOR.floor);
      break;
    }
    case 'boulder': {
      const s = o.scale;
      rock(parent, root, new CFrame(0, 0.25 * s, 0), new Vector3(1.2 * s, 0.84 * s, 1.2 * o.depth * s), o.color, true);
      break;
    }
    case 'flag': {
      standing(parent, root, new CFrame(0, 1.1, 0), 2.2, 0.08, 0.08, COLOR.pole, true);
      block(parent, root, new CFrame(0.47, 1.85, 0), new Vector3(0.9, 0.6, 0.04), COLOR.cloth, true);
      break;
    }
    case 'mesa': {
      // The body tapers from its full width at the foot to 0.8 of it at the top.
      frustum(parent, root, 0, o.height, [o.width, o.depth], [0.8 * o.width, 0.8 * o.depth], COLOR.mesaBody, true);
      standing(parent, root, new CFrame(0, o.height + 0.2, 0), 0.4, 1.32 * o.width, 1.32 * o.depth, COLOR.mesaTop, true);
      break;
    }
    case 'volcano': {
      const s = o.scale;
      frustum(parent, root, 0, 3.6 * s, [5 * s, 5 * s], [0.9 * s, 0.9 * s], COLOR.volcano, true);
      const vent = standing(parent, root, new CFrame(0, 3.62 * s, 0), FLAT, 2 * s, 2 * s, COLOR.vent, false);
      vent.Material = Enum.Material.Neon;
      break;
    }
    case 'spikes': {
      for (const spike of o.spikes) {
        const s = spike.scale;
        // A square pillar turned 45 degrees, its diagonal matching the cone's base, leaning by the spike's tilt.
        const offset = new CFrame(spike.x, 0.8 * s, spike.z).mul(CFrame.Angles(0, 0, spike.tilt)).mul(CFrame.Angles(0, math.pi / 4, 0));
        block(parent, root, offset, new Vector3(0.42 * s, 1.6 * s, 0.42 * s), COLOR.spike, true);
      }
      break;
    }
    case 'spires': {
      for (const spire of o.spires) {
        // The lean pivots on the spire's middle, as the web's does.
        const middle = root.mul(new CFrame(spire.x, spire.height / 2, spire.z)).mul(CFrame.Angles(spire.tiltX, 0, spire.tiltZ));
        cone(parent, middle, -spire.height / 2, spire.height, 0.6, COLOR.ice, true);
      }
      break;
    }
    case 'crack': {
      block(parent, root, new CFrame(0, CRACK_Y, 0), new Vector3(o.length, FLAT, 0.35), COLOR.crack, false);
      break;
    }
    case 'block': {
      block(parent, root, new CFrame(0, o.size / 2, 0), new Vector3(o.size, o.size, o.size), o.color, true);
      if (o.top !== undefined) {
        // The top block is 0.7 of the bottom one's size, sitting on it and turned about the vertical.
        const t = o.size * 0.7;
        block(
          parent,
          root,
          new CFrame(0, o.size + t / 2, 0).mul(CFrame.Angles(0, o.top.turn, 0)),
          new Vector3(t, t, t),
          o.top.color,
          true,
        );
      }
      break;
    }
    case 'books': {
      // Stacked one on another, each turned a little about the vertical.
      let y = 0;
      for (const book of o.books) {
        block(
          parent,
          root,
          new CFrame(0, y + book.height / 2, 0).mul(CFrame.Angles(0, book.turn, 0)),
          new Vector3(book.width, book.height, book.depth),
          book.color,
          true,
        );
        y += book.height;
      }
      break;
    }
    case 'toyBall': {
      sphere(parent, root, new CFrame(0, o.radius, 0), o.radius, o.color, true);
      break;
    }
    case 'cereal': {
      block(parent, root, new CFrame(0, o.height / 2, 0), new Vector3(o.width, o.height, o.depth), o.color, true);
      // The front panel stands just proud of the box, so the two never share a face.
      block(
        parent,
        root,
        new CFrame(0, o.height * 0.55, o.depth / 2 + 0.02),
        new Vector3(o.width * 0.6, o.height * 0.4, 0.04),
        COLOR.cerealPanel,
        true,
      );
      break;
    }
    case 'tin': {
      // A metal tin with a paper label round its middle, a little wider than the tin.
      standing(parent, root, new CFrame(0, o.height / 2, 0), o.height, 2 * o.radius, 2 * o.radius, COLOR.tinCan, true);
      const label = 2 * o.radius * 1.04;
      standing(parent, root, new CFrame(0, o.height / 2, 0), o.height * 0.6, label, label, o.label, true);
      break;
    }
    case 'fruit': {
      sphere(parent, root, new CFrame(0, o.radius, 0), o.radius, o.color, true);
      break;
    }
    case 'castle': {
      const s = o.scale;
      block(parent, root, new CFrame(0, 0.8 * s, 0), new Vector3(2.4 * s, 1.6 * s, 2.4 * s), COLOR.sand, true);
      for (const corner of CORNERS) {
        standing(
          parent,
          root,
          new CFrame(1.2 * s * corner[0], 1.1 * s, 1.2 * s * corner[1]),
          2.2 * s,
          s,
          s,
          COLOR.sandTower,
          true,
        );
      }
      break;
    }
    case 'bucket': {
      // Open end up, wider at the top.
      frustum(parent, root, 0, 1, [0.55, 0.55], [0.75, 0.75], o.color, true);
      break;
    }
    case 'spade': {
      // Lying on the sand: a handle along X with the blade at its end.
      lying(parent, root, new CFrame(0, 0.08, 0), 1.4, 0.16, COLOR.trunk, true);
      block(parent, root, new CFrame(1.05, 0.03, 0), new Vector3(0.7, 0.06, 0.6), o.color, true);
      break;
    }
    case 'tyres': {
      for (let i = 0; i < o.count; i++) {
        standing(parent, root, new CFrame(0, (i + 0.5) * 0.5, 0), 0.5, 1.7, 1.7, COLOR.tyre, true);
      }
      // The hub sits on the top tyre, a little proud of it.
      standing(parent, root, new CFrame(0, o.count * 0.5 + 0.02, 0), 0.04, 0.9, 0.9, COLOR.hub, true);
      break;
    }
    case 'paint': {
      standing(parent, root, new CFrame(0, o.height / 2, 0), o.height, 0.8, 0.8, COLOR.paintTin, true);
      standing(parent, root, new CFrame(0, o.height + 0.04, 0), 0.08, 0.84, 0.84, o.lid, true);
      break;
    }
    case 'toolbox': {
      block(parent, root, new CFrame(0, 0.45, 0), new Vector3(2, 0.9, 0.9), COLOR.toolbox, true);
      block(parent, root, new CFrame(0, 1.06, 0), new Vector3(1, 0.12, 0.12), COLOR.toolHandle, true);
      block(parent, root, new CFrame(-0.44, 0.98, 0), new Vector3(0.12, 0.16, 0.12), COLOR.toolHandle, true);
      block(parent, root, new CFrame(0.44, 0.98, 0), new Vector3(0.12, 0.16, 0.12), COLOR.toolHandle, true);
      break;
    }
    case 'tower': {
      block(parent, root, new CFrame(0, o.height / 2, 0), new Vector3(o.width, o.height, o.depth), o.color, true);
      // Each band is a slice a little wider than the tower, so it shows as a lit line round all four sides.
      const bands = 1 + math.floor(o.height / 3);
      for (let k = 1; k <= bands; k++) {
        const band = block(
          parent,
          root,
          new CFrame(0, (o.height * k) / (bands + 1), 0),
          new Vector3(o.width + 0.08, 0.18, o.depth + 0.08),
          o.neon,
          true,
        );
        band.Material = Enum.Material.Neon;
      }
      const cap = block(
        parent,
        root,
        new CFrame(0, o.height, 0),
        new Vector3(o.width + 0.12, 0.25, o.depth + 0.12),
        o.neon,
        true,
      );
      cap.Material = Enum.Material.Neon;
      break;
    }
    case 'billboard': {
      standing(parent, root, new CFrame(0, 1.5, 0), 3, 0.2, 0.2, COLOR.neonPole, true);
      const board = block(parent, root, new CFrame(0, 3.4, 0), new Vector3(2.4, 1.2, 0.12), o.color, true);
      board.Material = Enum.Material.Neon;
      break;
    }
    case 'airCon': {
      block(parent, root, new CFrame(0, 0.45, 0), new Vector3(o.width, 0.9, o.width), COLOR.acUnit, true);
      // The fan sits on the unit, a little proud of its top.
      standing(parent, root, new CFrame(0, 0.92, 0), 0.04, o.width * 0.7, o.width * 0.7, COLOR.acFan, true);
      break;
    }
    case 'tank': {
      for (const corner of CORNERS) {
        standing(parent, root, new CFrame(0.8 * corner[0], 0.6, 0.8 * corner[1]), 1.2, 0.16, 0.16, COLOR.tankLeg, true);
      }
      standing(parent, root, new CFrame(0, 2.1, 0), 1.8, 2.4, 2.4, COLOR.tankWood, true);
      cone(parent, root, 3.0, 0.6, 1.3, COLOR.tankRoof, true);
      break;
    }
    case 'aerial': {
      standing(parent, root, new CFrame(0, o.height / 2, 0), o.height, 0.12, 0.12, COLOR.mast, true);
      const light = sphere(parent, root, new CFrame(0, o.height, 0), 0.18, COLOR.redLight, true);
      light.Material = Enum.Material.Neon;
      break;
    }
    case 'container': {
      block(parent, root, new CFrame(0, 1.3, 0), new Vector3(6, 2.6, 2.4), o.color, true);
      if (o.top !== undefined) {
        block(
          parent,
          root,
          new CFrame(0, 3.9, 0).mul(CFrame.Angles(0, o.top.turn, 0)),
          new Vector3(6, 2.6, 2.4),
          o.top.color,
          true,
        );
      }
      break;
    }
    case 'bollard': {
      standing(parent, root, new CFrame(0, 0.35, 0), 0.7, 0.6, 0.6, COLOR.bollard, true);
      standing(parent, root, new CFrame(0, 0.75, 0), 0.1, 0.72, 0.72, COLOR.bollardCap, true);
      break;
    }
    case 'crate': {
      const s = o.scale;
      block(parent, root, new CFrame(0, s / 2, 0), new Vector3(s, s, s), COLOR.crate, true);
      break;
    }
    case 'lamp': {
      standing(parent, root, new CFrame(0, 2, 0), 4, 0.2, 0.2, COLOR.lampPole, true);
      const head = block(parent, root, new CFrame(0, 4.1, 0), new Vector3(0.5, 0.2, 0.5), COLOR.lampHead, true);
      head.Material = Enum.Material.Neon;
      break;
    }
    case 'streetLight': {
      // The arm reaches out along X, with the lamp hanging at its end.
      standing(parent, root, new CFrame(0, 2.25, 0), 4.5, 0.2, 0.2, COLOR.streetPole, true);
      block(parent, root, new CFrame(0.6, 4.45, 0), new Vector3(1.2, 0.1, 0.1), COLOR.streetPole, true);
      const head = block(parent, root, new CFrame(1.15, 4.35, 0), new Vector3(0.6, 0.15, 0.3), COLOR.streetHead, true);
      head.Material = Enum.Material.Neon;
      break;
    }
    case 'sign': {
      standing(parent, root, new CFrame(-1.2, 1.3, 0), 2.6, 0.16, 0.16, COLOR.signPost, true);
      standing(parent, root, new CFrame(1.2, 1.3, 0), 2.6, 0.16, 0.16, COLOR.signPost, true);
      block(parent, root, new CFrame(0, 2.6, 0), new Vector3(3, 1.4, 0.1), COLOR.sign, true);
      break;
    }
    case 'bush': {
      const s = o.scale;
      rock(parent, root, new CFrame(0, 0.3 * s, 0), new Vector3(1.44 * s, 0.96 * s, 1.32 * s), COLOR.bush, true);
      break;
    }
    case 'pond': {
      if (o.style === 'water') {
        // As the track's puddles: a pale rim, with a translucent pool a little smaller and higher.
        blob(o.x, POND_RIM_Y, o.z, o.radius, jitterSource(o.jitter), 0, (w) => {
          w.Color = Color3.fromHex(COLOR.puddleRim);
          w.Transparency = 0.25;
        }, parent);
        blob(o.x, POND_POOL_Y, o.z, o.radius * 0.86, jitterSource(o.jitter), 0, (w) => {
          w.Color = Color3.fromHex(COLOR.puddlePool);
          w.Transparency = 0.4;
        }, parent);
      } else if (o.style === 'lava') {
        blob(o.x, LAVA_Y, o.z, o.radius, jitterSource(o.jitter), 0, (w) => {
          w.Color = Color3.fromHex(COLOR.lava);
          w.Material = Enum.Material.Neon;
        }, parent);
      } else if (o.style === 'milk') {
        // One opaque blob, at the same height as the lava.
        blob(o.x, LAVA_Y, o.z, o.radius, jitterSource(o.jitter), 0, (w) => {
          w.Color = Color3.fromHex(COLOR.milk);
        }, parent);
      } else {
        // One blob of oil, a little reflective.
        blob(o.x, LAVA_Y, o.z, o.radius, jitterSource(o.jitter), 0, (w) => {
          w.Color = Color3.fromHex(COLOR.oil);
          w.Reflectance = 0.3;
        }, parent);
      }
      break;
    }
  }
}

/** Builds the theme's scenery and ponds as Parts under `parent`. */
export function buildScenery(track: TrackPath, theme: TrackTheme, parent: Instance): void {
  for (const object of planScenery(track, theme)) buildObject(object, parent);
}
