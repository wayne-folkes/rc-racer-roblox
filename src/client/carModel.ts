import { DEFAULT_VEHICLE, type VehicleId } from 'shared/vehicles';

// rc-racer's low-poly cars (carModel.ts), rebuilt from Parts: the buggy, and the Monster Truck. The
// model faces +X, like the web one. Parts are anchored and moved together each frame; nothing here
// uses Roblox physics.

const MAX_WHEEL_TURN = 0.5;

/** Turns a cylinder Part, whose axis is its X, so the axle runs along Z. */
const AXLE = CFrame.Angles(0, math.pi / 2, 0);

/** Adds one box to the body: size, colour, centre, then roll about Z. Returns the Part. */
type AddPart = (
  w: number,
  h: number,
  d: number,
  c: Color3,
  x: number,
  y: number,
  z: number,
  roll?: number,
) => Part;

/** The colours a shape's boxes can use: the paint, and three fixed ones. */
interface Colours {
  paint: Color3;
  dark: Color3;
  glass: Color3;
  lamp: Color3;
}

/** What makes one vehicle look different from another. Everything else about the model is shared. */
interface Shape {
  wheelRadius: number;
  wheelWidth: number;
  /** Wheel centres: the front and rear axles (x) and how far out the wheels sit (z). */
  frontX: number;
  rearX: number;
  halfTrack: number;
  /** Adds the body's boxes. */
  build(add: AddPart, colours: Colours): void;
}

const SHAPES: Record<VehicleId, Shape> = {
  buggy: {
    wheelRadius: 0.34,
    wheelWidth: 0.32,
    frontX: 0.72,
    rearX: -0.72,
    halfTrack: 0.68,
    build(add, { paint, dark, glass }) {
      add(2.2, 0.32, 1.1, paint, 0, 0.42, 0); // chassis
      add(0.6, 0.22, 1.0, paint, 0.95, 0.38, 0); // nose
      add(1.0, 0.36, 0.86, dark, -0.15, 0.74, 0); // cabin
      add(0.5, 0.3, 0.8, glass, 0.3, 0.72, 0, -0.35); // windscreen
      add(0.12, 0.42, 0.12, dark, -0.95, 0.8, 0.35); // wing struts
      add(0.12, 0.42, 0.12, dark, -0.95, 0.8, -0.35);
      add(0.5, 0.06, 1.4, paint, -1.0, 1.03, 0); // rear wing
    },
  },
  // Tall, with big wheels outside a narrow body. It's no wider than the buggy where it counts: the
  // wheels' outer edge sits at the cars' collision radius.
  truck: {
    wheelRadius: 0.5,
    wheelWidth: 0.4,
    frontX: 0.82,
    rearX: -0.82,
    halfTrack: 0.7,
    build(add, { paint, dark, glass, lamp }) {
      add(2.5, 0.2, 0.8, dark, 0, 0.62, 0); // frame between the wheels
      add(2.2, 0.44, 1.0, paint, 0, 0.98, 0); // body
      add(0.8, 0.2, 0.96, paint, 0.78, 1.3, 0); // hood
      add(0.95, 0.44, 0.92, paint, -0.2, 1.42, 0); // cab
      add(0.4, 0.34, 0.86, glass, 0.3, 1.42, 0, -0.35); // windscreen
      add(0.12, 0.3, 1.0, dark, -1.08, 1.3, 0); // tailgate
      add(0.14, 0.22, 1.0, dark, 1.24, 0.82, 0); // front bumper
      add(0.14, 0.08, 0.8, dark, -0.05, 1.7, 0); // roof light bar
      for (const z of [-0.28, 0, 0.28]) add(0.1, 0.1, 0.14, lamp, -0.05, 1.78, z).Material = Enum.Material.Neon;
      for (const z of [-0.3, 0.3]) add(0.06, 0.14, 0.22, lamp, 1.12, 1.0, z).Material = Enum.Material.Neon; // headlights
    },
  },
};

export interface CarPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  steer: number;
}

export class CarModel {
  readonly model = new Instance('Model');
  /** Which vehicle this model is, so a caller can tell whether to build a new one. */
  readonly vehicle: VehicleId;
  private readonly parts: Part[] = [];
  /** Each part's place relative to the car, whether it's a wheel, and whether it steers. */
  private readonly offsets: { offset: CFrame; wheel: boolean; steers: boolean }[] = [];
  private readonly cframes: CFrame[] = [];
  /** The body panels in the car's colour, for repainting it. */
  private readonly paintParts: Part[] = [];

  constructor(color = Color3.fromHex('#e63946'), name = 'Car', vehicle: VehicleId = DEFAULT_VEHICLE) {
    this.vehicle = vehicle;
    const shape = SHAPES[vehicle];
    const paint = color;
    const dark = Color3.fromHex('#1d2430');
    const glass = Color3.fromHex('#9fd3ff');
    const lamp = Color3.fromHex('#fef08a');
    const tyre = Color3.fromHex('#222222');

    const box: AddPart = (w, h, d, c, x, y, z, roll = 0) => {
      const part = this.add('Block', new Vector3(w, h, d), c, new CFrame(x, y, z).mul(CFrame.Angles(0, 0, roll)));
      if (c === paint) this.paintParts.push(part);
      return part;
    };
    shape.build(box, { paint, dark, glass, lamp });

    for (const x of [shape.frontX, shape.rearX]) {
      for (const side of [-1, 1]) {
        const size = new Vector3(shape.wheelWidth, shape.wheelRadius * 2, shape.wheelRadius * 2);
        this.add('Cylinder', size, tyre, new CFrame(x, shape.wheelRadius, side * shape.halfTrack), x === shape.frontX);
      }
    }

    this.model.Name = name;
    this.model.Parent = game.Workspace;
  }

  setColor(color: Color3): void {
    for (const part of this.paintParts) part.Color = color;
  }

  /** Shows a name above the car, for other players' and AI cars. */
  setLabel(text: string): void {
    const gui = new Instance('BillboardGui');
    gui.Size = new UDim2(0, 160, 0, 24);
    gui.StudsOffsetWorldSpace = new Vector3(0, 2.4, 0);
    gui.AlwaysOnTop = true;
    gui.Adornee = this.parts[0];
    const label = new Instance('TextLabel');
    label.BackgroundTransparency = 1;
    label.Size = new UDim2(1, 0, 1, 0);
    label.Font = Enum.Font.GothamBold;
    label.TextSize = 14;
    label.TextColor3 = new Color3(1, 1, 1);
    label.TextStrokeTransparency = 0.4;
    label.Text = text;
    label.Parent = gui;
    gui.Parent = this.model;
  }

  destroy(): void {
    this.model.Destroy();
  }

  private add(shape: 'Block' | 'Cylinder', size: Vector3, color: Color3, offset: CFrame, steers = false) {
    const part = new Instance('Part');
    part.Shape = shape === 'Block' ? Enum.PartType.Block : Enum.PartType.Cylinder;
    part.Anchored = true;
    part.CanCollide = false;
    part.CanQuery = false;
    part.CanTouch = false;
    part.Material = Enum.Material.SmoothPlastic;
    part.Size = size;
    part.Color = color;
    part.Parent = this.model;
    this.parts.push(part);
    this.offsets.push({ offset, wheel: shape === 'Cylinder', steers });
    this.cframes.push(offset);
    return part;
  }

  /** Puts the car at a pose: heading as in carPhysics.ts, so yaw is its negative in Roblox's frame. */
  place(pose: CarPose): void {
    const root = new CFrame(pose.x, pose.y, pose.z).mul(CFrame.Angles(0, -pose.heading, 0));
    const steer = CFrame.Angles(0, -pose.steer * MAX_WHEEL_TURN, 0);
    this.offsets.forEach(({ offset, wheel, steers }, i) => {
      this.cframes[i] = wheel ? root.mul(offset).mul(steers ? steer : CFrame.identity).mul(AXLE) : root.mul(offset);
    });
    game.Workspace.BulkMoveTo(this.parts, this.cframes, Enum.BulkMoveMode.FireCFrameChanged);
  }
}
