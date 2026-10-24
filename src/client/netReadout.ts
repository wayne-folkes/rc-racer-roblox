import type { RaceStateMessage } from 'shared/protocol';

// A few lines of network numbers in the top-left corner, shown only to the experience's owner (and in
// Studio), to find out why other cars stall on a phone. They show which version of the place the
// server runs, the frame rate, ping, how many snapshots arrive a second, and the longest gaps between
// them over the last few seconds: by when the server sent them, and by when they arrived. A long
// gap in both, while the server's frames stay short, means snapshots were lost on the way. A long gap
// in arrival only means they were held up and came in a bunch. Long server frames mean the server
// itself stalled. Each stall is also printed, so the Developer Console (/console in chat) has a log.

const Players = game.GetService('Players');
const RunService = game.GetService('RunService');

/** How far back (s) the longest gaps are taken from. */
const WINDOW = 10;
/** A gap between snapshots arriving longer than this (s) is counted and printed as a stall. */
const STALL = 0.4;

interface Arrival {
  /** os.clock() when it arrived. */
  at: number;
  /** Gaps (s) since the previous snapshot: by the server's send times, and by arrival. */
  sentGap: number;
  arrivedGap: number;
}

export class NetReadout {
  private readonly label: TextLabel;
  private readonly arrivals: Arrival[] = [];
  private lastSent = 0;
  private lastArrived = 0;
  private stalls = 0;
  private frames = 0;
  private frameTime = 0;
  private fps = 0;

  /** A readout if this player owns the experience or it's running in Studio; otherwise undefined. */
  static forOwner(): NetReadout | undefined {
    const me = Players.LocalPlayer;
    const owner = game.CreatorType === Enum.CreatorType.User && game.CreatorId === me.UserId;
    return owner || RunService.IsStudio() ? new NetReadout() : undefined;
  }

  private constructor() {
    const gui = new Instance('ScreenGui');
    gui.Name = 'NetReadout';
    gui.ResetOnSpawn = false;
    this.label = new Instance('TextLabel');
    this.label.BackgroundTransparency = 0.5;
    this.label.BackgroundColor3 = new Color3(0, 0, 0);
    this.label.Position = new UDim2(0, 12, 0, 64);
    this.label.AutomaticSize = Enum.AutomaticSize.XY;
    this.label.Font = Enum.Font.Code;
    this.label.TextSize = 13;
    this.label.TextColor3 = new Color3(1, 1, 1);
    this.label.TextXAlignment = Enum.TextXAlignment.Left;
    this.label.Text = '';
    this.label.Parent = gui;
    gui.Parent = Players.LocalPlayer.WaitForChild('PlayerGui');
  }

  /** A snapshot arrived, sent at server time `sentAt`. */
  onSnapshot(sentAt: number): void {
    const at = os.clock();
    if (this.lastArrived > 0 && sentAt > this.lastSent) {
      const arrival = { at, sentGap: sentAt - this.lastSent, arrivedGap: at - this.lastArrived };
      this.arrivals.push(arrival);
      if (arrival.arrivedGap > STALL) {
        this.stalls += 1;
        print(
          `[net] no snapshots for ${'%.2f'.format(arrival.arrivedGap)} s (server sent them ${'%.2f'.format(arrival.sentGap)} s apart)`,
        );
      }
    }
    if (sentAt > this.lastSent) this.lastSent = sentAt;
    this.lastArrived = at;
  }

  update(dt: number, state: RaceStateMessage | undefined): void {
    this.frames += 1;
    this.frameTime += dt;
    if (this.frameTime < 0.5) return;
    this.fps = this.frames / this.frameTime;
    this.frames = 0;
    this.frameTime = 0;

    const now = os.clock();
    while (this.arrivals.size() > 0 && now - this.arrivals[0].at > WINDOW) this.arrivals.remove(0);
    let sentGap = 0;
    let arrivedGap = 0;
    let lastSecond = 0;
    for (const a of this.arrivals) {
      sentGap = math.max(sentGap, a.sentGap);
      arrivedGap = math.max(arrivedGap, a.arrivedGap);
      if (now - a.at <= 1) lastSecond += 1;
    }
    // Waiting for the next snapshot right now counts too.
    if (this.lastArrived > 0) arrivedGap = math.max(arrivedGap, now - this.lastArrived);

    const ping = Players.LocalPlayer.GetNetworkPing() * 1000;
    const serverFrame = state ? state.serverWorstFrame : 0;
    this.label.Text = [
      `place v${game.PlaceVersion} · ${math.round(this.fps)} fps · ping ${math.round(ping)} ms`,
      `snapshots ${lastSecond}/s · longest gap ${'%.2f'.format(sentGap)} s sent, ${'%.2f'.format(arrivedGap)} s arrived`,
      `server's longest frame ${'%.2f'.format(serverFrame)} s · stalls ${this.stalls}`,
    ].join('\n');
  }
}
