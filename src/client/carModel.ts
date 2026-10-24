// rc-racer's low-poly buggy (carModel.ts), rebuilt from Parts. The model faces +X, like the web one.
// Parts are anchored and moved together each frame; nothing here uses Roblox physics.

const MAX_WHEEL_TURN = 0.5;
const WHEEL_RADIUS = 0.34;
const WHEEL_WIDTH = 0.32;
const FRONT_X = 0.72;
const REAR_X = -0.72;
const HALF_TRACK = 0.68;

/** Turns a cylinder Part, whose axis is its X, so the axle runs along Z. */
const AXLE = CFrame.Angles(0, math.pi / 2, 0);

export interface CarPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  steer: number;
}

export class CarModel {
  readonly model = new Instance('Model');
  private readonly parts: Part[] = [];
  /** Each part's place relative to the car, whether it's a wheel, and whether it steers. */
  private readonly offsets: { offset: CFrame; wheel: boolean; steers: boolean }[] = [];
  private readonly cframes: CFrame[] = [];
  /** The body panels in the car's colour, for repainting it. */
  private readonly paintParts: Part[] = [];

  constructor(color = Color3.fromHex('#e63946'), name = 'Car') {
    const paint = color;
    const dark = Color3.fromHex('#1d2430');
    const glass = Color3.fromHex('#9fd3ff');
    const tyre = Color3.fromHex('#222222');

    const box = (w: number, h: number, d: number, c: Color3, x: number, y: number, z: number, roll = 0) => {
      const part = this.add('Block', new Vector3(w, h, d), c, new CFrame(x, y, z).mul(CFrame.Angles(0, 0, roll)));
      if (c === paint) this.paintParts.push(part);
    };

    box(2.2, 0.32, 1.1, paint, 0, 0.42, 0); // chassis
    box(0.6, 0.22, 1.0, paint, 0.95, 0.38, 0); // nose
    box(1.0, 0.36, 0.86, dark, -0.15, 0.74, 0); // cabin
    box(0.5, 0.3, 0.8, glass, 0.3, 0.72, 0, -0.35); // windscreen
    box(0.12, 0.42, 0.12, dark, -0.95, 0.8, 0.35); // wing struts
    box(0.12, 0.42, 0.12, dark, -0.95, 0.8, -0.35);
    box(0.5, 0.06, 1.4, paint, -1.0, 1.03, 0); // rear wing

    for (const x of [FRONT_X, REAR_X]) {
      for (const side of [-1, 1]) {
        const size = new Vector3(WHEEL_WIDTH, WHEEL_RADIUS * 2, WHEEL_RADIUS * 2);
        this.add('Cylinder', size, tyre, new CFrame(x, WHEEL_RADIUS, side * HALF_TRACK), x === FRONT_X);
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
