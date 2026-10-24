// The missile and bomb, from rc-racer's itemScene.ts, in Parts: drawn as they are when fired and
// dropped, and bigger, floating over a glowing ring, as item boxes. Roblox has no cone Part, so the
// missile's nose is rounded and its flame is a short neon cylinder.

export function part(
  size: Vector3,
  color: Color3,
  parent: Instance,
  material: Enum.Material = Enum.Material.SmoothPlastic,
  shape: Enum.PartType = Enum.PartType.Block,
): Part {
  const p = new Instance('Part');
  p.Anchored = true;
  p.CanCollide = false;
  p.CanQuery = false;
  p.CanTouch = false;
  p.CastShadow = false;
  p.Shape = shape;
  p.Material = material;
  p.Size = size;
  p.Color = color;
  p.Parent = parent;
  return p;
}

/** A few Parts moved as one, each at its own place relative to the model's root. */
export class PartModel {
  readonly model = new Instance('Model');
  private readonly parts: Part[] = [];
  private readonly offsets: CFrame[] = [];
  private readonly cframes: CFrame[] = [];
  /** Each part's transparency when shown. */
  private readonly looks: number[] = [];

  constructor(parent: Instance) {
    this.model.Parent = parent;
  }

  add(p: Part, offset: CFrame): Part {
    p.Parent = this.model;
    this.parts.push(p);
    this.offsets.push(offset);
    this.cframes.push(offset);
    this.looks.push(p.Transparency);
    return p;
  }

  place(root: CFrame): void {
    this.offsets.forEach((o, i) => (this.cframes[i] = root.mul(o)));
    game.Workspace.BulkMoveTo(this.parts, this.cframes, Enum.BulkMoveMode.FireCFrameChanged);
  }

  setVisible(visible: boolean): void {
    this.parts.forEach((p, i) => (p.Transparency = visible ? this.looks[i] : 1));
  }

  destroy(): void {
    this.model.Destroy();
  }
}

const WHITE = Color3.fromHex('#f2f2f2');
const RED = Color3.fromHex('#e63946');
const FLAME = Color3.fromHex('#ff8c1a');
const BOMB = Color3.fromHex('#15151a');
const FUSE = Color3.fromHex('#8a6a4a');
export const SPARK = Color3.fromHex('#ff3b3b');

/** A cylinder Part's axis is its X, so it already lies along the missile. */
const ALONG_X = new CFrame();
/** Turns a cylinder Part upright. */
const UPRIGHT = CFrame.Angles(0, 0, math.pi / 2);

/** A missile pointing along +X, centred on its body, `s` times its fired size. */
export function missileModel(parent: Instance, s = 1): PartModel {
  const m = new PartModel(parent);
  const at = (x: number) => new CFrame(x * s, 0, 0);
  m.add(part(new Vector3(0.6, 0.24, 0.24).mul(s), WHITE, parent, undefined, Enum.PartType.Cylinder), at(-0.15).mul(ALONG_X));
  m.add(part(new Vector3(0.26, 0.26, 0.26).mul(s), RED, parent, undefined, Enum.PartType.Ball), at(0.2));
  // Two fins, crossed.
  m.add(part(new Vector3(0.2, 0.22, 0.02).mul(s), RED, parent), at(-0.36));
  m.add(part(new Vector3(0.2, 0.22, 0.02).mul(s), RED, parent), at(-0.36).mul(CFrame.Angles(math.pi / 2, 0, 0)));
  m.add(part(new Vector3(0.35, 0.18, 0.18).mul(s), FLAME, parent, Enum.Material.Neon, Enum.PartType.Cylinder), at(-0.62));
  return m;
}

/** A bomb sitting on the ground at its root, `s` times its dropped size. Returns the fuse's spark too. */
export function bombModel(parent: Instance, s = 1): { model: PartModel; spark: Part } {
  const m = new PartModel(parent);
  m.add(part(new Vector3(0.9, 0.9, 0.9).mul(s), BOMB, parent, undefined, Enum.PartType.Ball), new CFrame(0, 0.45 * s, 0));
  m.add(part(new Vector3(0.25, 0.1, 0.1).mul(s), FUSE, parent, undefined, Enum.PartType.Cylinder), new CFrame(0, 1.02 * s, 0).mul(UPRIGHT));
  const spark = m.add(part(new Vector3(0.16, 0.16, 0.16).mul(s), SPARK, parent, Enum.Material.Neon, Enum.PartType.Ball), new CFrame(0, 1.18 * s, 0));
  return { model: m, spark };
}

/** Ground rings sit just inside the pickup radius (1.7), as on the web. */
const RING_INNER = 1.25;
const RING_OUTER = 1.55;
const RING_SEGMENTS = 24;

/** A flat glowing ring on the road, built from short straight pieces. */
export function ringModel(parent: Instance, color: Color3): PartModel {
  const m = new PartModel(parent);
  const radius = (RING_INNER + RING_OUTER) / 2;
  // A touch longer than each piece's share of the circle, so they meet without gaps.
  const length = ((2 * math.pi * RING_OUTER) / RING_SEGMENTS) * 1.05;
  for (let k = 0; k < RING_SEGMENTS; k++) {
    const angle = (k / RING_SEGMENTS) * 2 * math.pi;
    const p = part(new Vector3(RING_OUTER - RING_INNER, 0.02, length), color, parent, Enum.Material.Neon);
    m.add(p, CFrame.Angles(0, angle, 0).mul(new CFrame(radius, 0, 0)));
  }
  return m;
}

/**
 * A flat triangle from two WedgeParts, the usual way to draw one in Roblox: split it along its
 * height at the corner opposite its longest side, and fill each half with a right-angled wedge.
 */
function triangle(a: Vector3, b: Vector3, c: Vector3, thickness: number, look: (w: WedgePart) => void, parent: Instance) {
  // Put the longest side between b and c, so a is the corner the height drops from.
  const ab0 = b.sub(a).Magnitude;
  const ac0 = c.sub(a).Magnitude;
  const bc0 = c.sub(b).Magnitude;
  if (ab0 > ac0 && ab0 > bc0) [a, c] = [c, a];
  else if (ac0 > bc0 && ac0 > ab0) [a, b] = [b, a];

  const ab = b.sub(a);
  const ac = c.sub(a);
  const bc = c.sub(b);
  const right = ac.Cross(ab).Unit;
  const up = bc.Cross(right).Unit;
  const back = bc.Unit;
  const height = math.abs(ab.Dot(up));

  const w1 = new Instance('WedgePart');
  w1.Size = new Vector3(thickness, height, math.abs(ab.Dot(back)));
  w1.CFrame = CFrame.fromMatrix(a.add(b).div(2), right, up, back);
  const w2 = new Instance('WedgePart');
  w2.Size = new Vector3(thickness, height, math.abs(ac.Dot(back)));
  w2.CFrame = CFrame.fromMatrix(a.add(c).div(2), right.mul(-1), up, back.mul(-1));
  for (const w of [w1, w2]) {
    w.Anchored = true;
    w.CanCollide = false;
    w.CanQuery = false;
    w.CanTouch = false;
    w.CastShadow = false;
    w.Material = Enum.Material.SmoothPlastic;
    look(w);
    w.Parent = parent;
  }
}

const BLOB_SIDES = 20;

/**
 * A flat, irregular blob on the road, as rc-racer's blobGeometry: 20 corners, each 0.8–1.05 of
 * `radius` from the centre, from a seeded pattern, turned by `turn`. Built as a fan of triangles.
 */
export function blob(
  x: number,
  y: number,
  z: number,
  radius: number,
  rand: () => number,
  turn: number,
  look: (w: WedgePart) => void,
  parent: Instance,
): void {
  const centre = new Vector3(x, y, z);
  const corners: Vector3[] = [];
  for (let i = 0; i < BLOB_SIDES; i++) {
    const r = (0.8 + rand() * 0.25) * radius;
    // Three's Y rotation (the web's) turns a point at angle a to a - turn.
    const a = (i / BLOB_SIDES) * 2 * math.pi - turn;
    corners.push(new Vector3(x + math.cos(a) * r, y, z + math.sin(a) * r));
  }
  for (let i = 0; i < BLOB_SIDES; i++) triangle(centre, corners[i], corners[(i + 1) % BLOB_SIDES], 0.02, look, parent);
}
