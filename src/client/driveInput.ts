import type { CarInput } from 'shared/carPhysics';

// Keyboard and gamepad through ContextActionService, plus on-screen buttons on touch devices, merged
// into one CarInput. The bindings follow rc-racer's input.ts and gamepad.ts.

const ContextActionService = game.GetService('ContextActionService');
const UserInputService = game.GetService('UserInputService');
const Players = game.GetService('Players');

type Control = 'gas' | 'brake' | 'left' | 'right' | 'handbrake';

const KEYS: Record<Control, Enum.KeyCode[]> = {
  gas: [Enum.KeyCode.W, Enum.KeyCode.Up, Enum.KeyCode.ButtonA],
  brake: [Enum.KeyCode.S, Enum.KeyCode.Down, Enum.KeyCode.ButtonX],
  left: [Enum.KeyCode.A, Enum.KeyCode.Left, Enum.KeyCode.DPadLeft],
  right: [Enum.KeyCode.D, Enum.KeyCode.Right, Enum.KeyCode.DPadRight],
  handbrake: [Enum.KeyCode.Space, Enum.KeyCode.ButtonL1, Enum.KeyCode.ButtonR1],
};
const RESET_KEYS = [Enum.KeyCode.R, Enum.KeyCode.ButtonY];
const FIRE_KEYS = [Enum.KeyCode.X, Enum.KeyCode.LeftShift, Enum.KeyCode.RightShift, Enum.KeyCode.ButtonB];
const STICK_DEADZONE = 0.18;

/** The controls, as shown along the bottom of the screen for the device in use. */
const KEYBOARD_HINT = 'WASD / arrows to drive · Space to drift · X to use item · R to reset';
const GAMEPAD_HINT = 'RT to drive · LT to brake · LB / RB to drift · B to use item · Y to reset';

const deadzone = (v: number) => {
  const mag = math.abs(v);
  if (mag < STICK_DEADZONE) return 0;
  return math.sign(v) * math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
};

export class DriveInput {
  /** What's holding each control down: key names, or 'touch' for an on-screen button. */
  private readonly held = new Map<Control, Set<string>>();
  private stickX = 0;
  private rightTrigger = 0;
  private leftTrigger = 0;
  private resetPressed = false;
  private firePressed = false;

  constructor() {
    for (const [control, keys] of pairs(KEYS)) {
      this.held.set(control, new Set());
      ContextActionService.BindAction(
        `drive_${control}`,
        (_, state, input) => {
          if (state === Enum.UserInputState.Begin) this.press(control, input.KeyCode.Name);
          else if (state === Enum.UserInputState.End || state === Enum.UserInputState.Cancel)
            this.release(control, input.KeyCode.Name);
          return Enum.ContextActionResult.Sink;
        },
        false,
        ...keys,
      );
    }

    ContextActionService.BindAction(
      'drive_analog',
      (_, state, input) => {
        const ended = state === Enum.UserInputState.End || state === Enum.UserInputState.Cancel;
        if (input.KeyCode === Enum.KeyCode.Thumbstick1) this.stickX = ended ? 0 : input.Position.X;
        else if (input.KeyCode === Enum.KeyCode.ButtonR2) this.rightTrigger = ended ? 0 : input.Position.Z;
        else if (input.KeyCode === Enum.KeyCode.ButtonL2) this.leftTrigger = ended ? 0 : input.Position.Z;
        return Enum.ContextActionResult.Sink;
      },
      false,
      Enum.KeyCode.Thumbstick1,
      Enum.KeyCode.ButtonR2,
      Enum.KeyCode.ButtonL2,
    );

    ContextActionService.BindAction(
      'drive_reset',
      (_, state) => {
        if (state === Enum.UserInputState.Begin) this.resetPressed = true;
        return Enum.ContextActionResult.Sink;
      },
      false,
      ...RESET_KEYS,
    );

    ContextActionService.BindAction(
      'drive_fire',
      (_, state) => {
        if (state === Enum.UserInputState.Begin) this.firePressed = true;
        return Enum.ContextActionResult.Sink;
      },
      false,
      ...FIRE_KEYS,
    );

    this.buildHud();
  }

  private press(control: Control, by: string) {
    this.held.get(control)!.add(by);
  }

  private release(control: Control, by: string) {
    this.held.get(control)!.delete(by);
  }

  private down(control: Control) {
    return this.held.get(control)!.size() > 0;
  }

  carInput(): CarInput {
    const digitalSteer = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    const gas = math.max(this.down('gas') ? 1 : 0, this.rightTrigger);
    const brake = math.max(this.down('brake') ? 1 : 0, this.leftTrigger);
    return {
      throttle: gas - brake,
      steer: digitalSteer !== 0 ? digitalSteer : deadzone(this.stickX),
      handbrake: this.down('handbrake'),
    };
  }

  /** True once per press of the reset key or button. */
  consumeReset(): boolean {
    const pressed = this.resetPressed;
    this.resetPressed = false;
    return pressed;
  }

  /** True once per press of the fire key or button: use the held item. */
  consumeFire(): boolean {
    const pressed = this.firePressed;
    this.firePressed = false;
    return pressed;
  }

  private buildHud() {
    const gui = new Instance('ScreenGui');
    gui.Name = 'DriveHud';
    gui.ResetOnSpawn = false;
    gui.IgnoreGuiInset = true;

    if (UserInputService.TouchEnabled) {
      this.touchButton(gui, 'left', '◀', new UDim2(0, 24, 1, -120));
      this.touchButton(gui, 'right', '▶', new UDim2(0, 124, 1, -120));
      this.touchButton(gui, 'gas', 'GAS', new UDim2(1, -114, 1, -120));
      this.touchButton(gui, 'brake', 'BRAKE', new UDim2(1, -214, 1, -120));
      this.touchButton(gui, 'handbrake', 'DRIFT', new UDim2(1, -114, 1, -220));
      this.tapButton(gui, 'ITEM', new UDim2(1, -214, 1, -220), () => (this.firePressed = true));
    }

    // Bottom centre: Roblox's own buttons take the top-left corner. It follows the device last
    // used, so it changes when someone picks up a gamepad; on touch the buttons say it all.
    {
      const hint = new Instance('TextLabel');
      hint.BackgroundTransparency = 1;
      hint.AnchorPoint = new Vector2(0.5, 1);
      hint.Position = new UDim2(0.5, 0, 1, -16);
      hint.Size = new UDim2(0, 480, 0, 24);
      hint.Font = Enum.Font.GothamBold;
      hint.TextSize = 16;
      hint.TextColor3 = new Color3(1, 1, 1);
      hint.TextStrokeTransparency = 0.5;
      hint.Size = new UDim2(0, 640, 0, 24);
      const show = (inputType: Enum.UserInputType) => {
        if (inputType === Enum.UserInputType.Touch) hint.Text = '';
        else if (inputType.Name.sub(1, 7) === 'Gamepad') hint.Text = GAMEPAD_HINT;
        else if (inputType === Enum.UserInputType.Keyboard || inputType.Name.sub(1, 5) === 'Mouse') hint.Text = KEYBOARD_HINT;
      };
      hint.Text = UserInputService.TouchEnabled && !UserInputService.KeyboardEnabled ? '' : KEYBOARD_HINT;
      show(UserInputService.GetLastInputType());
      UserInputService.LastInputTypeChanged.Connect(show);
      hint.Parent = gui;
    }

    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  /** An on-screen button that does something once per tap. */
  private tapButton(gui: ScreenGui, label: string, position: UDim2, onTap: () => void) {
    const button = this.roundButton(gui, label, position);
    button.InputBegan.Connect((input) => {
      if (input.UserInputType === Enum.UserInputType.Touch) onTap();
    });
  }

  private touchButton(gui: ScreenGui, control: Control, label: string, position: UDim2) {
    const button = this.roundButton(gui, label, position);
    button.InputBegan.Connect((input) => {
      if (input.UserInputType === Enum.UserInputType.Touch) this.press(control, 'touch');
    });
    button.InputEnded.Connect((input) => {
      if (input.UserInputType === Enum.UserInputType.Touch) this.release(control, 'touch');
    });
  }

  private roundButton(gui: ScreenGui, label: string, position: UDim2): TextButton {
    const button = new Instance('TextButton');
    button.Position = position;
    button.Size = new UDim2(0, 90, 0, 90);
    button.BackgroundColor3 = new Color3(0, 0, 0);
    button.BackgroundTransparency = 0.55;
    button.Font = Enum.Font.GothamBold;
    button.TextSize = 20;
    button.TextColor3 = new Color3(1, 1, 1);
    button.Text = label;
    button.AutoButtonColor = false;
    new Instance('UICorner', button).CornerRadius = new UDim(0.5, 0);
    button.Parent = gui;
    return button;
  }
}
