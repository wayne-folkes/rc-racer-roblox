import { DEFAULT_VOLUME, type EngineNote } from 'shared/sound';

// Sound effects and engine loops. The web game synthesizes its sounds live; Roblox can't, so these are
// free sounds from the Creator Store: Roblox's own, and the Pro Sound Effects and APM libraries that
// Roblox licenses for every experience, so none of them needed uploading or moderation. Everything
// plays flat (not from a spot in the world); distant things are just played quieter.
//
// Every sound goes through one SoundGroup, whose volume is the player's setting (0 when muted). The
// setting lasts for the session: it isn't saved yet.

const SoundService = game.GetService('SoundService');
const ContentProvider = game.GetService('ContentProvider');

export type SoundName =
  | 'beep'
  | 'go'
  | 'pickup'
  | 'fire'
  | 'drop'
  | 'explode'
  | 'boost'
  | 'splash'
  | 'skid'
  | 'lap'
  | 'finalLap'
  | 'finish'
  | 'jump'
  | 'land';

export type EngineId = 'player' | 'rival';

interface Effect {
  /** Creator Store asset id. */
  id: number;
  volume: number;
  /** Playback speed, to retune a sound: 1 is as recorded. */
  pitch?: number;
}

const COUNTDOWN_BEEP = 9119141141; // Pro Sound Effects: single high-pitch beep tone

const EFFECTS: Record<SoundName, Effect> = {
  beep: { id: COUNTDOWN_BEEP, volume: 0.5 },
  // GO is the countdown's beep, higher, as on the web.
  go: { id: COUNTDOWN_BEEP, volume: 0.6, pitch: 1.5 },
  pickup: { id: 17208319162, volume: 0.6 }, // Roblox GUI - Pickup
  fire: { id: 12222065, volume: 0.5 }, // Roblox: Launching rocket
  drop: { id: 9113480917, volume: 0.6 }, // Pro Sound Effects: body fall thud
  explode: { id: 9114086657, volume: 0.6 }, // Pro Sound Effects: dirt explosion, sharp bang
  boost: { id: 9120715547, volume: 0.5 }, // Pro Sound Effects: fast whoosh by
  splash: { id: 9119481909, volume: 0.5 }, // Pro Sound Effects: splash, thunking impact
  skid: { id: 9120079044, volume: 0.5 }, // Pro Sound Effects: tire swerve
  lap: { id: 9126073001, volume: 0.6 }, // Pro Sound Effects: synth sparkle bell ding
  finalLap: { id: 17208361335, volume: 0.6 }, // Roblox GUI - Notification High
  finish: { id: 1844584698, volume: 0.5 }, // APM Music: Winner
  jump: { id: 9126229255, volume: 0.3 }, // Pro Sound Effects: fast airy whoosh by
  land: { id: 9118616114, volume: 0.5 }, // Pro Sound Effects: hard muted thud into dirt
};

/** Roblox Resources' loopable car engine. */
const ENGINE_ID = 80317022777602;
/** The loop's volume when an engine's note is at its loudest. */
const ENGINE_VOLUME = 0.35;
/** How quickly an engine's pitch and volume follow its car (s), as on the web. */
const ENGINE_SMOOTHING = 0.06;
/** Longer than any effect (s): a played copy is removed by then, ended or not. */
const CLEANUP_AFTER = 15;

function makeSound(id: number, parent: Instance, group: SoundGroup): Sound {
  const s = new Instance('Sound');
  s.SoundId = `rbxassetid://${id}`;
  s.SoundGroup = group;
  s.Parent = parent;
  return s;
}

export class Sounds {
  private readonly group: SoundGroup;
  private readonly effects = new Map<SoundName, Sound>();
  private readonly engines = new Map<EngineId, Sound>();
  private volumeSetting = DEFAULT_VOLUME;
  private mutedSetting = false;

  constructor() {
    this.group = new Instance('SoundGroup');
    this.group.Name = 'RaceSounds';
    this.group.Parent = SoundService;

    for (const [name, effect] of pairs(EFFECTS)) {
      const s = makeSound(effect.id, this.group, this.group);
      s.Name = name;
      s.Volume = effect.volume;
      s.PlaybackSpeed = effect.pitch ?? 1;
      this.effects.set(name, s);
    }
    for (const id of ['player', 'rival'] as EngineId[]) {
      const s = makeSound(ENGINE_ID, this.group, this.group);
      s.Name = `Engine_${id}`;
      s.Looped = true;
      s.Volume = 0;
      s.Play();
      this.engines.set(id, s);
    }
    // Fetch them all now, so the first beep of the first countdown isn't late.
    const all: Instance[] = [];
    this.group.GetChildren().forEach((s) => all.push(s));
    task.spawn(() => ContentProvider.PreloadAsync(all));
    this.apply();
  }

  isMuted(): boolean {
    return this.mutedSetting;
  }

  /** The volume setting, 0 to 1, whether or not muted. */
  getVolume(): number {
    return this.volumeSetting;
  }

  setMuted(muted: boolean): void {
    this.mutedSetting = muted;
    this.apply();
  }

  toggleMuted(): void {
    this.setMuted(!this.mutedSetting);
  }

  setVolume(volume: number): void {
    this.volumeSetting = math.clamp(volume, 0, 1);
    this.apply();
  }

  /** Plays an effect; `volume` scales it, e.g. for distance. Several of one sound can overlap. */
  play(name: SoundName, volume = 1): void {
    if (this.mutedSetting || this.volumeSetting === 0) return;
    const template = this.effects.get(name);
    if (!template) return;
    const s = template.Clone();
    s.Volume = template.Volume * volume;
    s.Parent = this.group;
    s.Ended.Once(() => s.Destroy());
    // A sound that never loads never ends.
    task.delay(CLEANUP_AFTER, () => s.Destroy());
    s.Play();
  }

  /** Moves an engine loop toward a note; call every frame. */
  engine(id: EngineId, note: EngineNote, dt: number): void {
    const s = this.engines.get(id);
    if (!s) return;
    const follow = 1 - math.exp(-dt / ENGINE_SMOOTHING);
    s.PlaybackSpeed += (note.pitch - s.PlaybackSpeed) * follow;
    s.Volume += (note.volume * ENGINE_VOLUME - s.Volume) * follow;
  }

  /** Fades an engine out, as `engine` would toward silence. */
  quietEngine(id: EngineId, dt: number): void {
    const s = this.engines.get(id);
    if (s) this.engine(id, { pitch: s.PlaybackSpeed, volume: 0 }, dt);
  }

  private apply() {
    this.group.Volume = this.mutedSetting ? 0 : this.volumeSetting;
  }
}
