// Day or night for the track being raced. The City Cup races at night: the clock turns to midnight for the
// moon and stars, and a blue ambient light and raised exposure keep the cars and kerbs easy to see while
// the scenery's neon and lamps stand out. The web game does the same with its moonlight (main.ts).

const Lighting = game.GetService('Lighting');

interface Look {
  clock: number;
  ambient: Color3;
  outdoor: Color3;
  exposure: number;
}

/** The place's own daylight (default.project.json), read before any track changes it. */
const DAY: Look = {
  clock: Lighting.ClockTime,
  ambient: Lighting.Ambient,
  outdoor: Lighting.OutdoorAmbient,
  exposure: Lighting.ExposureCompensation,
};
const NIGHT: Look = {
  clock: 0,
  ambient: Color3.fromRGB(120, 128, 165),
  outdoor: Color3.fromRGB(150, 160, 200),
  exposure: 0.8,
};

export function setLighting(night: boolean): void {
  const look = night ? NIGHT : DAY;
  Lighting.ClockTime = look.clock;
  Lighting.Ambient = look.ambient;
  Lighting.OutdoorAmbient = look.outdoor;
  Lighting.ExposureCompensation = look.exposure;
}
