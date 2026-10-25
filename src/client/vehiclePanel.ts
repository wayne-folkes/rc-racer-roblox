import type { RaceStateMessage } from 'shared/protocol';
import { DEFAULT_VEHICLE, VEHICLE_IDS, VEHICLES, type VehicleId } from 'shared/vehicles';

// The vehicle picker, shown between races: in the waiting room, during the vote, and in the lobby
// between a cup's races. Click or tap a vehicle, or press V to step to the next one. During the vote a
// gamepad reaches it with the D-pad, as it reaches the vote's buttons (voteMenu.ts). Hidden during a race.

const ContextActionService = game.GetService('ContextActionService');
const GuiService = game.GetService('GuiService');
const UserInputService = game.GetService('UserInputService');
const Players = game.GetService('Players');

const BUTTON_COLOR = new Color3(0.1, 0.11, 0.15);
const PICKED_COLOR = Color3.fromHex('#e6a417');
const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 64;
const GAP = 10;
const WHITE = new Color3(1, 1, 1);

/** A vehicle's button, and the parts of it that show whether it's picked. */
interface Card {
  button: TextButton;
  /** A gold border round the picked one; a gold fill would make its small print hard to read. */
  border: UIStroke;
  name: TextLabel;
}

export class VehiclePanel {
  private readonly frame: Frame;
  private readonly cards = new Map<VehicleId, Card>();
  private picked: VehicleId = DEFAULT_VEHICLE;
  /** Shrinks the panel on short screens (a phone on its side), as the records panel does. */
  private readonly scale: UIScale;

  constructor(private readonly onPick: (vehicle: VehicleId) => void) {
    const gui = new Instance('ScreenGui');
    gui.Name = 'VehiclePanel';
    gui.ResetOnSpawn = false;

    // A caption over a row of buttons, centred at the bottom of the screen just above the controls
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
    const caption = new Instance('TextLabel');
    caption.LayoutOrder = 0;
    caption.Size = new UDim2(1, 0, 0, 18);
    caption.BackgroundTransparency = 1;
    caption.Font = Enum.Font.GothamBold;
    caption.TextSize = 14;
    caption.TextColor3 = new Color3(1, 1, 1);
    caption.TextStrokeTransparency = 0.5;
    caption.Text = UserInputService.TouchEnabled ? 'Vehicle' : 'Vehicle (V)';
    caption.Parent = this.frame;

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

      const name = new Instance('TextLabel');
      name.BackgroundTransparency = 1;
      name.Position = new UDim2(0, 10, 0, 6);
      name.Size = new UDim2(1, -20, 0, 20);
      name.Font = Enum.Font.GothamBold;
      name.TextSize = 16;
      name.TextColor3 = new Color3(1, 1, 1);
      name.TextXAlignment = Enum.TextXAlignment.Left;
      name.Text = VEHICLES[id].name;
      name.Parent = button;

      const blurb = new Instance('TextLabel');
      blurb.BackgroundTransparency = 1;
      blurb.Position = new UDim2(0, 10, 0, 26);
      blurb.Size = new UDim2(1, -20, 0, 34);
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
      this.cards.set(id, { button, border, name });
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
    this.picked = vehicle;
    this.onPick(vehicle);
  }

  /** The vehicle after the picked one, wrapping round to the first. */
  private nextVehicle(): VehicleId {
    return VEHICLE_IDS[(VEHICLE_IDS.indexOf(this.picked) + 1) % VEHICLE_IDS.size()];
  }

  update(state: RaceStateMessage | undefined, picked: VehicleId): void {
    this.picked = picked;
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
    this.cards.forEach(({ border, name }, id) => {
      border.Enabled = id === picked;
      name.TextColor3 = id === picked ? PICKED_COLOR : WHITE;
    });
  }
}
