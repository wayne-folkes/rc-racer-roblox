import type { RaceStateMessage, RecordRow, RecordsMessage } from 'shared/protocol';
import { formatTime } from 'shared/race';
import { NO_TIME } from 'shared/records';
import { DEFAULT_VEHICLE, VEHICLES } from 'shared/vehicles';

// The track's best times, on the left of the screen before a race (in the lobby and the countdown):
// the top 10 for a whole race and for a lap, and the player's own bests. While racing, one line under
// the lap and position gives the lap record and the player's best lap to chase.

const Players = game.GetService('Players');

function column(parent: Instance, x: number): TextLabel {
  const l = new Instance('TextLabel');
  l.BackgroundTransparency = 1;
  l.Position = new UDim2(0, x, 0, 30);
  l.Size = new UDim2(0, 190, 0, 200);
  l.Font = Enum.Font.GothamBold;
  l.TextSize = 14;
  l.TextColor3 = new Color3(1, 1, 1);
  l.TextXAlignment = Enum.TextXAlignment.Left;
  l.TextYAlignment = Enum.TextYAlignment.Top;
  l.LineHeight = 1.15;
  l.Parent = parent;
  return l;
}

const lines = (title: string, rows: RecordRow[]) => {
  if (rows.size() === 0) return `${title}\nNo times yet`;
  const me = Players.LocalPlayer.UserId;
  return `${title}\n${rows
    .map((r, place) => `${place + 1}. ${formatTime(r.time)}  ${r.name}${r.userId === me ? ' ←' : ''}`)
    .join('\n')}`;
};

export class RecordsPanel {
  private records: RecordsMessage | undefined;
  private readonly frame: Frame;
  private readonly title: TextLabel;
  private readonly race: TextLabel;
  private readonly lap: TextLabel;
  private readonly mine: TextLabel;
  /** Shrinks the panel on short screens (a phone on its side) so it clears the touch buttons. */
  private readonly scale: UIScale;

  constructor() {
    const gui = new Instance('ScreenGui');
    gui.Name = 'Records';
    gui.ResetOnSpawn = false;
    this.frame = new Instance('Frame');
    this.frame.AnchorPoint = new Vector2(0, 0.5);
    this.frame.Position = new UDim2(0, 16, 0.45, 0);
    this.frame.Size = new UDim2(0, 400, 0, 270);
    this.frame.BackgroundColor3 = new Color3(0.08, 0.09, 0.12);
    this.frame.BackgroundTransparency = 0.25;
    this.frame.Visible = false;
    new Instance('UICorner', this.frame).CornerRadius = new UDim(0, 12);
    this.scale = new Instance('UIScale', this.frame);
    this.title = column(this.frame, 16);
    this.title.Position = new UDim2(0, 16, 0, 8);
    this.title.Size = new UDim2(1, -32, 0, 20);
    this.title.TextSize = 16;
    this.title.Font = Enum.Font.GothamBlack;
    this.race = column(this.frame, 16);
    this.lap = column(this.frame, 206);
    this.mine = column(this.frame, 16);
    this.mine.Position = new UDim2(0, 16, 1, -30);
    this.mine.Size = new UDim2(1, -32, 0, 20);
    this.frame.Parent = gui;
    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  set(message: RecordsMessage): void {
    this.records = message;
  }

  /** The records for `trackId`, if they're the ones we have. */
  private forTrack(trackId: string): RecordsMessage | undefined {
    return this.records?.trackId === trackId && this.records.available ? this.records : undefined;
  }

  update(state: RaceStateMessage | undefined, trackName: string): void {
    const r = state ? this.forTrack(state.trackId) : undefined;
    const before = state?.phase === 'lobby' || state?.phase === 'countdown';
    this.frame.Visible = r !== undefined && before;
    if (!r || !before) return;
    const height = game.Workspace.CurrentCamera?.ViewportSize.Y ?? 720;
    this.scale.Scale = math.clamp(height / 600, 0.6, 1);
    // The buggy's boards keep the plain title; any other vehicle's name goes after it.
    const vehicle = r.vehicle !== DEFAULT_VEHICLE ? ` · ${VEHICLES[r.vehicle].name.upper()}` : '';
    this.title.Text = `${trackName.upper()} RECORDS${vehicle}`;
    this.race.Text = lines('RACE', r.race);
    this.lap.Text = lines('LAP', r.lap);
    const yours: string[] = [];
    if (r.myRace !== NO_TIME) yours.push(`race ${formatTime(r.myRace)}`);
    if (r.myLap !== NO_TIME) yours.push(`lap ${formatTime(r.myLap)}`);
    this.mine.Text = yours.size() > 0 ? `Your best: ${yours.join(' · ')}` : 'Your best: no times yet';
  }

  /** One line for the race HUD: the lap record and our best lap. Empty without records. */
  chaseLine(trackId: string): string {
    const r = this.forTrack(trackId);
    if (!r) return '';
    const parts: string[] = [];
    if (r.lap.size() > 0) parts.push(`REC ${formatTime(r.lap[0].time)}`);
    if (r.myLap !== NO_TIME) parts.push(`PB ${formatTime(r.myLap)}`);
    return parts.join(' · ');
  }

  /** What we just beat on this track, for the results: empty if nothing. */
  newBestLine(trackId: string): string {
    const r = this.forTrack(trackId);
    if (!r) return '';
    if (r.newRace && r.newLap) return `New best race ${formatTime(r.myRace)} and lap ${formatTime(r.myLap)}!`;
    if (r.newRace) return `New best race time ${formatTime(r.myRace)}!`;
    if (r.newLap) return `New best lap ${formatTime(r.myLap)}!`;
    return '';
  }
}
