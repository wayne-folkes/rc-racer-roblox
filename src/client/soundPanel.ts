import { stepVolume } from 'shared/sound';
import type { Sounds } from './sound';

// Top right: a speaker button that mutes and unmutes, and the volume with − and + either side. M
// mutes from the keyboard, as on the web. The race info sits below it (hud.ts).

const Players = game.GetService('Players');
const UserInputService = game.GetService('UserInputService');

const HEIGHT = 36;
const SPEAKER_WIDTH = 44;
const STEP_WIDTH = 32;
const READOUT_WIDTH = 52;

function button(parent: Instance, text: string, width: number, x: number): TextButton {
  const b = new Instance('TextButton');
  b.AutoButtonColor = true;
  b.BackgroundColor3 = new Color3(0.2, 0.22, 0.28);
  b.BackgroundTransparency = 0.2;
  b.Position = new UDim2(0, x, 0, 4);
  b.Size = new UDim2(0, width, 0, HEIGHT - 8);
  b.Font = Enum.Font.GothamBlack;
  b.TextSize = 18;
  b.TextColor3 = new Color3(1, 1, 1);
  b.Text = text;
  new Instance('UICorner', b).CornerRadius = new UDim(0, 8);
  b.Parent = parent;
  return b;
}

export class SoundPanel {
  private readonly speaker: TextButton;
  private readonly readout: TextLabel;
  private readonly down: TextButton;
  private readonly up: TextButton;

  constructor(private readonly sounds: Sounds) {
    const gui = new Instance('ScreenGui');
    gui.Name = 'SoundPanel';
    gui.ResetOnSpawn = false;

    const gap = 4;
    const width = gap + SPEAKER_WIDTH + gap + STEP_WIDTH + READOUT_WIDTH + STEP_WIDTH + gap;
    const frame = new Instance('Frame');
    frame.AnchorPoint = new Vector2(1, 0);
    frame.Position = new UDim2(1, -16, 0, 12);
    frame.Size = new UDim2(0, width, 0, HEIGHT);
    frame.BackgroundColor3 = new Color3(0.08, 0.09, 0.12);
    frame.BackgroundTransparency = 0.3;
    new Instance('UICorner', frame).CornerRadius = new UDim(0, 10);
    frame.Parent = gui;

    let x = gap;
    this.speaker = button(frame, '', SPEAKER_WIDTH, x);
    x += SPEAKER_WIDTH + gap;
    this.down = button(frame, '−', STEP_WIDTH, x);
    x += STEP_WIDTH;
    this.readout = new Instance('TextLabel');
    this.readout.BackgroundTransparency = 1;
    this.readout.Position = new UDim2(0, x, 0, 0);
    this.readout.Size = new UDim2(0, READOUT_WIDTH, 1, 0);
    this.readout.Font = Enum.Font.GothamBold;
    this.readout.TextSize = 16;
    this.readout.TextColor3 = new Color3(1, 1, 1);
    this.readout.Parent = frame;
    x += READOUT_WIDTH;
    this.up = button(frame, '+', STEP_WIDTH, x);

    this.speaker.Activated.Connect(() => this.change(() => sounds.toggleMuted()));
    this.down.Activated.Connect(() => this.step(-1));
    this.up.Activated.Connect(() => this.step(1));
    UserInputService.InputBegan.Connect((input, processed) => {
      if (!processed && input.KeyCode === Enum.KeyCode.M) this.change(() => sounds.toggleMuted());
    });

    this.show();
    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  /** A step up or down also unmutes, so the change can be heard. */
  private step(direction: 1 | -1) {
    this.change(() => {
      this.sounds.setVolume(stepVolume(this.sounds.getVolume(), direction));
      this.sounds.setMuted(false);
    });
    // A blip at the new volume, as the web's settings do.
    this.sounds.play('pickup');
  }

  private change(apply: () => void) {
    apply();
    this.show();
  }

  private show() {
    const silent = this.sounds.isMuted() || this.sounds.getVolume() === 0;
    this.speaker.Text = silent ? '🔇' : '🔊';
    this.readout.Text = this.sounds.isMuted() ? 'Off' : `${math.round(this.sounds.getVolume() * 100)}%`;
  }
}
