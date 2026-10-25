import type { RaceStateMessage } from 'shared/protocol';
import { formatTime } from 'shared/race';

// The race on screen: what's being raced and where, the vote and lobby timers, 3-2-1, lap, position
// and time while racing, and the results with the cup standings.

const Players = game.GetService('Players');

/** How long GO! stays up after the start. */
const GO_SECONDS = 1;

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

function label(parent: Instance, size: number, position: UDim2, anchor: Vector2, xAlign: Enum.TextXAlignment = Enum.TextXAlignment.Center) {
  const l = new Instance('TextLabel');
  l.BackgroundTransparency = 1;
  l.AnchorPoint = anchor;
  l.Position = position;
  l.Size = new UDim2(0, 600, 0, size + 8);
  l.Font = Enum.Font.GothamBlack;
  l.TextSize = size;
  l.TextColor3 = new Color3(1, 1, 1);
  l.TextStrokeTransparency = 0.3;
  l.TextXAlignment = xAlign;
  l.Text = '';
  l.Parent = parent;
  return l;
}

export class Hud {
  private readonly banner: TextLabel;
  private readonly subtitle: TextLabel;
  private readonly info: TextLabel;
  /** The lap record and our best lap, under the info while racing. */
  private readonly chase: TextLabel;
  /** What's being raced, and on which track, along the top. */
  private readonly heading: TextLabel;
  private readonly results: Frame;
  private readonly resultLines: TextLabel;
  private readonly cupLines: TextLabel;

  constructor() {
    const gui = new Instance('ScreenGui');
    gui.Name = 'RaceHud';
    gui.ResetOnSpawn = false;

    this.heading = label(gui, 18, new UDim2(0.5, 0, 0, 14), new Vector2(0.5, 0));
    this.heading.Font = Enum.Font.GothamBold;
    this.banner = label(gui, 64, new UDim2(0.5, 0, 0.18, 0), new Vector2(0.5, 0.5));
    this.subtitle = label(gui, 20, new UDim2(0.5, 0, 0.18, 48), new Vector2(0.5, 0.5));
    this.info = label(gui, 22, new UDim2(1, -20, 0, 16), new Vector2(1, 0), Enum.TextXAlignment.Right);
    this.info.Size = new UDim2(0, 300, 0, 120);
    this.info.TextYAlignment = Enum.TextYAlignment.Top;
    this.chase = label(gui, 16, new UDim2(1, -20, 0, 140), new Vector2(1, 0), Enum.TextXAlignment.Right);
    this.chase.Size = new UDim2(0, 300, 0, 24);
    this.chase.Font = Enum.Font.GothamBold;

    this.results = new Instance('Frame');
    this.results.AnchorPoint = new Vector2(0.5, 0.5);
    this.results.Position = new UDim2(0.5, 0, 0.55, 0);
    this.results.Size = new UDim2(0, 380, 0, 250);
    this.results.AutomaticSize = Enum.AutomaticSize.X;
    this.results.BackgroundColor3 = new Color3(0.08, 0.09, 0.12);
    this.results.BackgroundTransparency = 0.2;
    this.results.Visible = false;
    new Instance('UICorner', this.results).CornerRadius = new UDim(0, 12);
    this.resultLines = label(this.results, 20, new UDim2(0, 24, 0, 20), new Vector2(0, 0), Enum.TextXAlignment.Left);
    this.resultLines.Size = new UDim2(1, -48, 1, -40);
    this.resultLines.TextYAlignment = Enum.TextYAlignment.Top;
    this.resultLines.Font = Enum.Font.GothamBold;
    this.resultLines.LineHeight = 1.25;
    this.resultLines.Size = new UDim2(0, 330, 1, -40);
    this.cupLines = label(this.results, 20, new UDim2(0, 380, 0, 20), new Vector2(0, 0), Enum.TextXAlignment.Left);
    this.cupLines.Size = new UDim2(0, 300, 1, -40);
    this.cupLines.TextYAlignment = Enum.TextYAlignment.Top;
    this.cupLines.Font = Enum.Font.GothamBold;
    this.cupLines.LineHeight = 1.25;
    this.results.Parent = gui;

    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  /**
   * @param chase The lap record and our best lap, shown while racing.
   * @param newBest What we just beat on this track, shown once we've finished.
   */
  update(
    state: RaceStateMessage | undefined,
    myIndex: number,
    serverNow: number,
    trackName: string,
    chase: string,
    newBest: string,
  ): void {
    let banner = '';
    let subtitle = '';
    let info = '';
    let chaseLine = '';
    let showResults = false;
    const secondsLeft = state ? math.max(0, math.ceil(state.phaseEndsAt - serverNow)) : 0;
    const inRace = myIndex >= 0;
    const others = state ? state.playerCount - 1 : 0;
    const company =
      others > 0 ? `${others} other player${others === 1 ? '' : 's'} here` : 'Invite friends to race';

    this.heading.Text =
      state === undefined || state.phase === 'waiting'
        ? ''
        : state.phase === 'vote'
          ? state.modeLabel
          : `${state.modeLabel} · ${trackName}`;

    if (state?.phase === 'vote') {
      banner = `Vote · ${secondsLeft}`;
      subtitle = `${company} · drive around while you wait`;
    } else if (state?.phase === 'lobby') {
      banner = `Next race in ${secondsLeft}`;
      subtitle = `${company} · drive around while you wait`;
    } else if (state?.phase === 'countdown') {
      banner = inRace ? `${secondsLeft}` : 'Race starting';
      subtitle = inRace ? '' : "You're in the next race";
    } else if (state && (state.phase === 'racing' || state.phase === 'results')) {
      const clock = serverNow - state.goAt;
      if (inRace) {
        const finish = state.finishTimes[myIndex];
        const position = state.standings.indexOf(myIndex) + 1;
        const lap = math.min(state.totalLaps, state.laps[myIndex] + 1);
        info = `LAP ${lap}/${state.totalLaps}\n${ordinal(position)} of ${state.racers.size()}\n${formatTime(
          finish >= 0 ? finish : clock,
        )}`;
        const held = state.items[myIndex];
        if (held !== undefined && held !== '' && finish < 0) info += `\n${held.upper()} READY`;
        if (finish < 0) chaseLine = chase;
        if (state.phase === 'racing' && clock < GO_SECONDS) banner = 'GO!';
        else if (finish >= 0) {
          banner = `${ordinal(position)}!`;
          if (state.phase === 'racing') {
            subtitle = newBest !== '' ? `${newBest} · Waiting for the others` : 'Waiting for the others to finish';
          }
        } else if (state.laps[myIndex] === state.totalLaps - 1) subtitle = 'Final lap';
      } else {
        subtitle = "Race in progress · you're in the next one";
      }
      if (state.phase === 'results') {
        showResults = true;
        const cupWinner = state.cup[0];
        banner = state.cupFinal && cupWinner ? `${cupWinner.name} wins the cup!` : 'Results';
        subtitle = state.cupFinal ? 'Final standings' : `Next in ${secondsLeft}`;
        if (newBest !== '') subtitle = `${newBest} · ${subtitle}`;
        this.cupLines.Visible = state.cup.size() > 0;
        this.cupLines.Text =
          'CUP\n' +
          state.cup
            .map((r, place) => {
              const you = r.userId !== 0 && r.userId === Players.LocalPlayer.UserId ? '  ← you' : '';
              return `${place + 1}. ${r.name}  ${r.points}${r.lastPoints > 0 ? ` (+${r.lastPoints})` : ''}${you}`;
            })
            .join('\n');
        this.resultLines.Text =
          'RACE\n' +
          state.standings
          .map((i, place) => {
            const r = state.racers[i];
            const t = state.finishTimes[i];
            const you = i === myIndex ? '  ← you' : '';
            return `${place + 1}. ${r.name}  ${t >= 0 ? formatTime(t) : '—'}${you}`;
          })
          .join('\n');
      }
    }

    this.banner.Text = banner;
    this.subtitle.Text = subtitle;
    this.info.Text = info;
    this.chase.Text = chaseLine;
    this.results.Visible = showResults;
  }
}
