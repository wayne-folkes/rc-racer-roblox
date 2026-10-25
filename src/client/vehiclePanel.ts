import { PLAYER_COLORS } from 'shared/grid';
import type { RaceStateMessage } from 'shared/protocol';
import { unlockHint } from 'shared/unlocks';
import { DEFAULT_VEHICLE, VEHICLE_IDS, VEHICLES, type VehicleId } from 'shared/vehicles';
import { CarModel } from './carModel';

// The vehicle picker, shown between races: in the waiting room, during the vote, and in the lobby
// between a cup's races. Each card has a small turning 3D view of its vehicle. A locked vehicle is a
// black silhouette with "???" and how to unlock it; click or tap an unlocked card, or press V to step
// to the next unlocked one. During the vote a gamepad reaches the cards with the D-pad, as it reaches
// the vote's buttons (voteMenu.ts). Hidden during a race.

const ContextActionService = game.GetService('ContextActionService');
const GuiService = game.GetService('GuiService');
const UserInputService = game.GetService('UserInputService');
const Players = game.GetService('Players');

const BUTTON_COLOR = new Color3(0.1, 0.11, 0.15);
const PICKED_COLOR = Color3.fromHex('#e6a417');
const SLATE = Color3.fromRGB(74, 85, 104);
const BUTTON_WIDTH = 240;
const BUTTON_HEIGHT = 72;
/** The 3D view on the left of a card, and the gap between it and the text. */
const VIEW_SIZE = 72;
const TEXT_LEFT = VIEW_SIZE + 8;
const GAP = 10;
const WHITE = new Color3(1, 1, 1);
const BLACK = new Color3(0, 0, 0);
/** Every card's car is painted the same, so the cards show shapes rather than colours. */
const CARD_PAINT = Color3.fromHex(PLAYER_COLORS[0]);

/** The cars turn at this many radians a second, the camera about 3 studs out and a little above. */
const ORBIT_SPEED = 0.6;
const ORBIT_RADIUS = 3.5;
const ORBIT_HEIGHT = 1.8;
const LOOK_AT = new Vector3(0, 0.8, 0);
const VIEW_FOV = 50;
/** A gap between frames longer than this (a hitch, a hidden panel) doesn't swing the car round. */
const MAX_STEP = 0.1;

/** A vehicle's card, and the parts of it that change with its lock and with the pick. */
interface Card {
  button: TextButton;
  /** A gold border round the picked one; a gold fill would make its small print hard to read. */
  border: UIStroke;
  name: TextLabel;
  blurb: TextLabel;
  view: ViewportFrame;
  camera: Camera;
  /** Whether the card shows the vehicle unlocked. Unset until the first update. */
  open?: boolean;
}

export class VehiclePanel {
  private readonly frame: Frame;
  private readonly caption: TextLabel;
  private readonly cards = new Map<VehicleId, Card>();
  private picked: VehicleId = DEFAULT_VEHICLE;
  /** The vehicles the player can pick. Until the server says, only the buggy. */
  private unlocked: VehicleId[] = [DEFAULT_VEHICLE];
  /** Shrinks the panel on short screens (a phone on its side), as the records panel does. */
  private readonly scale: UIScale;
  private angle = 0;
  private lastClock: number | undefined;

  constructor(private readonly onPick: (vehicle: VehicleId) => void) {
    const gui = new Instance('ScreenGui');
    gui.Name = 'VehiclePanel';
    gui.ResetOnSpawn = false;

    // A caption over a row of cards, centred at the bottom of the screen just above the controls
    // hint (driveInput.ts), which takes the bottom 40 pixels.
    const count = VEHICLE_IDS.size();
    this.frame = new Instance('Frame');
    this.frame.AnchorPoint = new Vector2(0.5, 1);
    this.frame.Position = new UDim2(0.5, 0, 1, -44);
    this.frame.Size = new UDim2(0, count * BUTTON_WIDTH + (count - 1) * GAP, 0, 18 + 4 + BUTTON_HEIGHT);
    this.frame.BackgroundTransparency = 1;
    this.frame.Visible = false;
    this.scale = new Instance('UIScale', this.frame);
    const column = new Instance('UIListLayout', this.frame);
    column.Padding = new UDim(0, 4);
    column.HorizontalAlignment = Enum.HorizontalAlignment.Center;
    column.SortOrder = Enum.SortOrder.LayoutOrder;
    this.frame.Parent = gui;

    // The keyboard shortcut is only useful with a keyboard.
    this.caption = new Instance('TextLabel');
    this.caption.LayoutOrder = 0;
    this.caption.Size = new UDim2(1, 0, 0, 18);
    this.caption.BackgroundTransparency = 1;
    this.caption.Font = Enum.Font.GothamBold;
    this.caption.TextSize = 14;
    this.caption.TextColor3 = new Color3(1, 1, 1);
    this.caption.TextStrokeTransparency = 0.5;
    this.caption.Text = UserInputService.TouchEnabled ? 'Vehicle' : 'Vehicle (V)';
    this.caption.Parent = this.frame;

    const row = new Instance('Frame');
    row.LayoutOrder = 1;
    row.Size = new UDim2(1, 0, 0, BUTTON_HEIGHT);
    row.BackgroundTransparency = 1;
    const line = new Instance('UIListLayout', row);
    line.FillDirection = Enum.FillDirection.Horizontal;
    line.Padding = new UDim(0, GAP);
    line.SortOrder = Enum.SortOrder.LayoutOrder;
    row.Parent = this.frame;

    VEHICLE_IDS.forEach((id, i) => {
      const button = new Instance('TextButton');
      button.LayoutOrder = i;
      button.Size = new UDim2(0, BUTTON_WIDTH, 0, BUTTON_HEIGHT);
      button.BackgroundColor3 = BUTTON_COLOR;
      button.BackgroundTransparency = 0.15;
      button.Text = '';
      button.AutoButtonColor = true;
      button.Selectable = true;
      new Instance('UICorner', button).CornerRadius = new UDim(0, 10);
      button.Activated.Connect(() => this.choose(id));

      // The car on a slate backdrop, from its own camera. The model is parented to the view, so it
      // only shows there, and its parts are built at the origin, where the camera looks. The backdrop
      // is a frame of its own behind a clear view: the view's ImageColor3 darkens its background too,
      // which would turn a locked card's whole square black rather than just the car.
      const backdrop = new Instance('Frame');
      backdrop.Size = new UDim2(0, VIEW_SIZE, 0, VIEW_SIZE);
      backdrop.BackgroundColor3 = SLATE;
      new Instance('UICorner', backdrop).CornerRadius = new UDim(0, 10);
      backdrop.Parent = button;
      const view = new Instance('ViewportFrame');
      view.Size = new UDim2(1, 0, 1, 0);
      view.BackgroundTransparency = 1;
      view.Ambient = new Color3(0.6, 0.6, 0.6);
      const camera = new Instance('Camera');
      camera.FieldOfView = VIEW_FOV;
      camera.Parent = view;
      view.CurrentCamera = camera;
      new CarModel(CARD_PAINT, id, id, view);
      view.Parent = backdrop;

      const name = new Instance('TextLabel');
      name.BackgroundTransparency = 1;
      name.Position = new UDim2(0, TEXT_LEFT, 0, 6);
      name.Size = new UDim2(1, -(TEXT_LEFT + 8), 0, 20);
      name.Font = Enum.Font.GothamBold;
      name.TextSize = 16;
      name.TextColor3 = new Color3(1, 1, 1);
      name.TextXAlignment = Enum.TextXAlignment.Left;
      name.Text = VEHICLES[id].name;
      name.Parent = button;

      const blurb = new Instance('TextLabel');
      blurb.BackgroundTransparency = 1;
      blurb.Position = new UDim2(0, TEXT_LEFT, 0, 26);
      blurb.Size = new UDim2(1, -(TEXT_LEFT + 8), 0, 42);
      blurb.Font = Enum.Font.Gotham;
      blurb.TextSize = 10;
      blurb.TextColor3 = new Color3(0.85, 0.87, 0.9);
      blurb.TextWrapped = true;
      blurb.TextXAlignment = Enum.TextXAlignment.Left;
      blurb.TextYAlignment = Enum.TextYAlignment.Top;
      blurb.Text = VEHICLES[id].blurb;
      blurb.Parent = button;

      const border = new Instance('UIStroke');
      border.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
      border.Color = PICKED_COLOR;
      border.Thickness = 3;
      border.Enabled = false;
      border.Parent = button;

      button.Parent = row;
      this.cards.set(id, { button, border, name, blurb, view, camera });
    });

    ContextActionService.BindAction(
      'vehicle_key',
      (_, state) => {
        if (!this.frame.Visible || state !== Enum.UserInputState.Begin) return Enum.ContextActionResult.Pass;
        this.choose(this.nextVehicle());
        return Enum.ContextActionResult.Sink;
      },
      false,
      Enum.KeyCode.V,
    );

    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  private choose(vehicle: VehicleId) {
    // A locked card can't be picked; it shows its hint instead.
    if (!this.unlocked.includes(vehicle)) return;
    this.picked = vehicle;
    this.onPick(vehicle);
  }

  /** The unlocked vehicle after the picked one, wrapping round to the first. */
  private nextVehicle(): VehicleId {
    const at = VEHICLE_IDS.indexOf(this.picked);
    for (let step = 1; step <= VEHICLE_IDS.size(); step++) {
      const id = VEHICLE_IDS[(at + step) % VEHICLE_IDS.size()];
      if (this.unlocked.includes(id)) return id;
    }
    return this.picked;
  }

  /** Shows a card as unlocked (its real look) or locked (a silhouette, with the hint). */
  private showLock(id: VehicleId, card: Card, open: boolean) {
    card.open = open;
    card.view.ImageColor3 = open ? WHITE : BLACK;
    card.name.Text = open ? VEHICLES[id].name : '???';
    card.blurb.Text = open ? VEHICLES[id].blurb : unlockHint(id);
  }

  /** Turns the cars and points the cameras at them. Called only while the panel shows. */
  private spin(dt: number) {
    this.angle += ORBIT_SPEED * dt;
    const eye = new Vector3(math.cos(this.angle) * ORBIT_RADIUS, ORBIT_HEIGHT, math.sin(this.angle) * ORBIT_RADIUS);
    const aim = CFrame.lookAt(eye, LOOK_AT);
    for (const [, card] of this.cards) card.camera.CFrame = aim;
  }

  update(state: RaceStateMessage | undefined, picked: VehicleId, unlocked: VehicleId[], available: boolean): void {
    this.picked = picked;
    this.unlocked = unlocked;
    const now = os.clock();
    const dt = this.lastClock === undefined ? 0 : math.min(now - this.lastClock, MAX_STEP);
    this.lastClock = now;
    const between =
      state === undefined || state.phase === 'waiting' || state.phase === 'vote' || state.phase === 'lobby';
    if (!between) {
      if (this.frame.Visible) {
        this.frame.Visible = false;
        if (GuiService.SelectedObject && GuiService.SelectedObject.IsDescendantOf(this.frame)) GuiService.SelectedObject = undefined;
      }
      return;
    }

    this.frame.Visible = true;
    const height = game.Workspace.CurrentCamera?.ViewportSize.Y ?? 720;
    this.scale.Scale = math.clamp(height / 600, 0.6, 1);
    const base = UserInputService.TouchEnabled ? 'Vehicle' : 'Vehicle (V)';
    const caption = available ? base : `${base} · progress isn't being saved`;
    if (this.caption.Text !== caption) this.caption.Text = caption;
    this.cards.forEach((card, id) => {
      const open = unlocked.includes(id);
      if (card.open !== open) this.showLock(id, card, open);
      card.border.Enabled = id === picked;
      card.name.TextColor3 = id === picked ? PICKED_COLOR : WHITE;
    });
    this.spin(dt);
  }
}
