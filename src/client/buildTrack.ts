import type { TrackPath } from 'shared/trackPath';
import { ROAD_TOP, type TrackDef } from 'shared/tracks';

// Builds Meadow Loop out of Parts from its centreline: a ground plane, the road, striped kerbs, low
// walls and a start line. rc-racer's trackScene.ts builds the same strips as triangle ribbons; here
// each centreline segment gets one box per strip, a little longer than the segment so curves don't
// show gaps.
//
// Each player builds their own copy from the shared centreline. A track built on the server has to
// replicate to the player Part by Part, and the race would start with half of it missing.

const WALL_HEIGHT = 0.7;
const WALL_THICKNESS = 0.6;
const CURB_WIDTH = 0.9;
/** Tops of the flat layers above the road, far enough apart that they don't flicker from far away. */
const CURB_TOP = 0.1;
/**
 * Red kerb stripes sit this much above the white ones. Neighbouring boxes overlap a little, and two
 * colours overlapping at the same height flicker as the camera moves (z-fighting).
 */
const STRIPE_LIFT = 0.05;
const LINE_TOP = 0.2;
/** Thickness of the road and kerb boxes. */
const SLAB = 0.2;
/** Extra length on each segment's box, to close the gap on the outside of bends. */
const OVERLAP = 0.15;

const CURB_RED = Color3.fromRGB(217, 38, 38);
const CURB_WHITE = Color3.fromRGB(242, 242, 242);
const WALL_COLOR = Color3.fromHex('#f1f1f1');

function offsetPoint(track: TrackPath, i: number, offset: number) {
  const p = track.points[i];
  const t = track.tangent(i);
  // Right of travel is (-tz, tx).
  return { x: p.x - t.z * offset, z: p.z + t.x * offset };
}

function block(size: Vector3, cframe: CFrame, color: Color3, parent: Instance) {
  const part = new Instance('Part');
  part.Anchored = true;
  part.CanCollide = false;
  part.CanQuery = false;
  part.CanTouch = false;
  part.Material = Enum.Material.SmoothPlastic;
  part.TopSurface = Enum.SurfaceType.Smooth;
  part.BottomSurface = Enum.SurfaceType.Smooth;
  part.Size = size;
  part.CFrame = cframe;
  part.Color = color;
  part.Parent = parent;
  return part;
}

/** One box per centreline segment, between two sideways offsets, with each box's colour and top from `look`. */
function strip(
  track: TrackPath,
  from: number,
  to: number,
  height: number,
  look: (i: number) => { color: Color3; top: number },
  parent: Instance,
) {
  const n = track.points.size();
  const middle = (from + to) / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = offsetPoint(track, i, middle);
    const b = offsetPoint(track, j, middle);
    const edge = (offset: number) => {
      const p = offsetPoint(track, i, offset);
      const q = offsetPoint(track, j, offset);
      return math.sqrt((q.x - p.x) ** 2 + (q.z - p.z) ** 2);
    };
    const length = math.max(edge(from), edge(to)) + OVERLAP;
    const { color, top } = look(i);
    const y = top - height / 2;
    const centre = new Vector3((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    const cframe = CFrame.lookAt(centre, new Vector3(b.x, y, b.z));
    block(new Vector3(to - from, height, length), cframe, color, parent);
  }
}

export function buildTrack(track: TrackPath, def: TrackDef): Folder {
  const folder = new Instance('Folder');
  folder.Name = def.name;

  block(
    new Vector3(600, 1, 600),
    new CFrame(0, -0.5, 0),
    Color3.fromHex(def.theme.ground),
    folder,
  ).Name = 'Ground';

  const hw = track.halfWidth;
  const road = Color3.fromHex(def.theme.road);
  strip(track, -hw, hw, SLAB, () => ({ color: road, top: ROAD_TOP }), folder);

  const curb = (i: number) =>
    math.floor(i / 3) % 2 === 0
      ? { color: CURB_RED, top: CURB_TOP + STRIPE_LIFT }
      : { color: CURB_WHITE, top: CURB_TOP };
  strip(track, -hw, -hw + CURB_WIDTH, SLAB, curb, folder);
  strip(track, hw - CURB_WIDTH, hw, SLAB, curb, folder);

  const wall = () => ({ color: WALL_COLOR, top: WALL_HEIGHT });
  strip(track, -hw - WALL_THICKNESS, -hw, WALL_HEIGHT, wall, folder);
  strip(track, hw, hw + WALL_THICKNESS, WALL_HEIGHT, wall, folder);

  const start = track.pointAt(0);
  const line = new Vector3(start.x, LINE_TOP - 0.05, start.z);
  block(
    new Vector3(hw * 2, 0.1, 0.8),
    CFrame.lookAt(line, line.add(new Vector3(start.tx, 0, start.tz))),
    CURB_WHITE,
    folder,
  ).Name = 'StartLine';

  folder.Parent = game.Workspace;
  return folder;
}
