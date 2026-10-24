import type { RaceStateMessage } from 'shared/protocol';

// The vote between races: a button per choice (the two cups and two quick races) with the votes so
// far. Click or tap a button, press 1–4, or move to it with a gamepad and press A. The car can still
// be driven around while the vote is on, except with a gamepad, whose buttons work the menu.

const ContextActionService = game.GetService('ContextActionService');
const GuiService = game.GetService('GuiService');
const UserInputService = game.GetService('UserInputService');
const Players = game.GetService('Players');

const NUMBER_KEYS: Enum.KeyCode[] = [Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four];
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
    this.frame.Position = new UDim2(0.5, 0, 0.28, 0);
    this.frame.Size = new UDim2(0, 420, 0, 4 * 58);
    this.frame.BackgroundTransparency = 1;
    this.frame.Visible = false;
    const list = new Instance('UIListLayout', this.frame);
    list.Padding = new UDim(0, 8);
    list.SortOrder = Enum.SortOrder.LayoutOrder;
    this.frame.Parent = gui;

    for (let i = 0; i < NUMBER_KEYS.size(); i++) {
      const button = new Instance('TextButton');
      button.LayoutOrder = i;
      button.Size = new UDim2(1, 0, 0, 50);
      button.BackgroundColor3 = BUTTON_COLOR;
      button.BackgroundTransparency = 0.15;
      button.Font = Enum.Font.GothamBold;
      button.TextSize = 20;
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
