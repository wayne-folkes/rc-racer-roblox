import type { RaceStateMessage } from 'shared/protocol';
import { CIRCUIT_IDS } from 'shared/tracks';

// The vote between races: a button per choice (the four cups and two quick races) with the votes so
// far. The cups sit two to a row, the quick races a row each, all below the HUD's countdown banner.
// Click or tap a button, press 1–6, or move to it with a gamepad and press A. The car can still
// be driven around while the vote is on, except with a gamepad, whose buttons work the menu.

const ContextActionService = game.GetService('ContextActionService');
const GuiService = game.GetService('GuiService');
const UserInputService = game.GetService('UserInputService');
const Players = game.GetService('Players');

const NUMBER_KEYS: Enum.KeyCode[] = [
  Enum.KeyCode.One,
  Enum.KeyCode.Two,
  Enum.KeyCode.Three,
  Enum.KeyCode.Four,
  Enum.KeyCode.Five,
  Enum.KeyCode.Six,
];
/** The vote's options start with one per cup (shared/cup.ts), laid out two to a row; the quick races follow. */
const CUPS = CIRCUIT_IDS.size();
const CUP_ROWS = math.ceil(CUPS / 2);
const BUTTON_HEIGHT = 42;
const BUTTON_GAP = 6;
/** The menu starts this far below the HUD banner's centre (hud.ts), clear of the banner and its subtitle. */
const BELOW_BANNER = 76;
const BUTTON_COLOR = new Color3(0.1, 0.11, 0.15);
const PICKED_COLOR = Color3.fromHex('#e6a417');

const isGamepad = (t: Enum.UserInputType) => t.Name.sub(1, 7) === 'Gamepad';

export class VoteMenu {
  private readonly frame: Frame;
  private readonly buttons: TextButton[] = [];
  private pick = -1;
  private shownFor = -1;

  constructor(private readonly send: (pick: number) => void) {
    const gui = new Instance('ScreenGui');
    gui.Name = 'VoteMenu';
    gui.ResetOnSpawn = false;

    this.frame = new Instance('Frame');
    this.frame.AnchorPoint = new Vector2(0.5, 0);
    this.frame.Position = new UDim2(0.5, 0, 0.18, BELOW_BANNER);
    const rows = CUP_ROWS + NUMBER_KEYS.size() - CUPS;
    this.frame.Size = new UDim2(0, 460, 0, rows * (BUTTON_HEIGHT + BUTTON_GAP));
    this.frame.BackgroundTransparency = 1;
    this.frame.Visible = false;
    this.frame.Parent = gui;

    for (let i = 0; i < NUMBER_KEYS.size(); i++) {
      const button = new Instance('TextButton');
      // A cup takes half a row, left or right; a quick race takes a whole row below the cups.
      const cup = i < CUPS;
      const row = cup ? math.floor(i / 2) : CUP_ROWS + i - CUPS;
      const column = cup ? i % 2 : 0;
      button.Size = cup ? new UDim2(0.5, -BUTTON_GAP / 2, 0, BUTTON_HEIGHT) : new UDim2(1, 0, 0, BUTTON_HEIGHT);
      button.Position = new UDim2(column * 0.5, (column * BUTTON_GAP) / 2, 0, row * (BUTTON_HEIGHT + BUTTON_GAP));
      button.BackgroundColor3 = BUTTON_COLOR;
      button.BackgroundTransparency = 0.15;
      button.Font = Enum.Font.GothamBold;
      button.TextSize = 18;
      button.TextColor3 = new Color3(1, 1, 1);
      button.AutoButtonColor = true;
      button.Selectable = true;
      new Instance('UICorner', button).CornerRadius = new UDim(0, 10);
      button.Activated.Connect(() => this.choose(i));
      button.Parent = this.frame;
      this.buttons.push(button);
    }

    ContextActionService.BindAction(
      'vote_keys',
      (_, state, input) => {
        if (!this.frame.Visible || state !== Enum.UserInputState.Begin) return Enum.ContextActionResult.Pass;
        const i = NUMBER_KEYS.indexOf(input.KeyCode);
        if (i >= 0 && i < this.optionCount()) this.choose(i);
        return Enum.ContextActionResult.Sink;
      },
      false,
      ...NUMBER_KEYS,
    );

    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  private optionCount = () => this.buttons.filter((b) => b.Visible).size();

  private choose(i: number) {
    this.pick = i;
    this.send(i);
  }

  update(state: RaceStateMessage | undefined): void {
    const voting = state !== undefined && state.phase === 'vote' && state.voteOptions.size() > 0;
    if (!voting) {
      if (this.frame.Visible) {
        this.frame.Visible = false;
        if (GuiService.SelectedObject && GuiService.SelectedObject.IsDescendantOf(this.frame)) GuiService.SelectedObject = undefined;
      }
      return;
    }

    // A new vote: forget the last pick, and put a gamepad player's selection on the first choice.
    if (this.shownFor !== state.phaseEndsAt) {
      this.shownFor = state.phaseEndsAt;
      this.pick = -1;
      if (isGamepad(UserInputService.GetLastInputType())) GuiService.SelectedObject = this.buttons[0];
    }
    this.frame.Visible = true;
    this.buttons.forEach((button, i) => {
      const label = state.voteOptions[i];
      button.Visible = label !== undefined;
      if (label === undefined) return;
      const votes = state.voteCounts[i] ?? 0;
      const key = UserInputService.TouchEnabled ? '' : `${i + 1}  `;
      button.Text = `${key}${label}${votes > 0 ? `   · ${votes} vote${votes === 1 ? '' : 's'}` : ''}`;
      button.BackgroundColor3 = i === this.pick ? PICKED_COLOR : BUTTON_COLOR;
    });
  }
}
