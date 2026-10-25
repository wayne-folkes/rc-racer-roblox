// The rules behind the sounds, kept apart from Roblox so tests can run them: how the engine's pitch
// and loudness follow a car, how far-off things get quieter, and the volume setting's steps. The web
// game synthesizes its engine (audio.ts there); here a recorded loop is sped up and slowed down instead,
// following the same two-gear shape.

/** Share of top speed where the engine "changes gear" and its pitch drops back, as on the web. */
const GEAR_CHANGE = 0.5;
/** Fastest a car is counted as going, as a share of top speed: boosts take it past 1. */
const MOST = 1.4;

/** Playback speed of the engine loop at a standstill, and how much each gear adds. */
const IDLE_PITCH = 0.8;
const GEAR_PITCH = 1.0;
/** The second gear starts this much above idle, so the drop at the change is a dip, not a reset. */
const SECOND_GEAR_BASE = 0.25;
const THROTTLE_PITCH = 0.05;

export interface EngineNote {
  /** The loop's playback speed (1 is as recorded). */
  pitch: number;
  /** 0 to 1. */
  volume: number;
}

const clamp = (v: number, lo: number, hi: number) => math.min(hi, math.max(lo, v));

/**
 * The engine's pitch and loudness for a car's speed and throttle. Pitch climbs through two "gears",
 * dropping back at the change, and the engine is louder under throttle, as the web's engineNote.
 */
export function engineNote(speed: number, throttle: number, topSpeed: number): EngineNote {
  const s = clamp(math.abs(speed) / topSpeed, 0, MOST);
  const inGear = s < GEAR_CHANGE ? s / GEAR_CHANGE : (s - GEAR_CHANGE) / (MOST - GEAR_CHANGE);
  const gearBase = s < GEAR_CHANGE ? 0 : SECOND_GEAR_BASE;
  return {
    pitch: IDLE_PITCH + gearBase + GEAR_PITCH * inGear + (throttle > 0 ? THROTTLE_PITCH : 0),
    // The web's gain (0.05 to 0.18) scaled so full throttle at top speed is 1.
    volume: (0.05 + 0.08 * math.max(0, throttle) + 0.05 * math.min(1, s)) / 0.18,
  };
}

/** Quieter the further away something happens, but never silent. */
export function distanceVolume(distance: number, reach = 60): number {
  return clamp(1 - distance / reach, 0.15, 1);
}

/** The volume setting moves in tenths, from silent to full. */
export const VOLUME_STEP = 0.1;
export const DEFAULT_VOLUME = 0.8;

/** The volume one step up (+1) or down (-1), kept on the tenths. */
export function stepVolume(volume: number, direction: 1 | -1): number {
  return clamp(math.round((volume + direction * VOLUME_STEP) * 10) / 10, 0, 1);
}
