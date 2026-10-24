# RC Racer on Roblox: spike notes

The spike from [`rc-racer/docs/roblox-port.md`](../rc-racer/docs/roblox-port.md): one drivable car on
Meadow Loop in Roblox, driven by rc-racer's own handling code, compiled with roblox-ts and built
with Rojo.

## Running it

```bash
mise install    # Rojo 7.7.1, pinned in mise.toml
npm ci          # roblox-ts 3.0.0 and the Roblox types, pinned in package.json
npm run place   # compiles src/ to out/ and builds spike.rbxlx
```

Open `spike.rbxlx` in Roblox Studio and press Play. To edit code live instead, run `npm run watch`
and `npm run serve`, then connect from the Rojo plugin in Studio.

Controls: WASD or arrows to drive, Space to drift, R to reset; on a gamepad RT/A for gas, LT/X to
brake, the stick or d-pad to steer, a bumper to drift, Y to reset; on touch, on-screen buttons.

## Status

| Check | Result |
|---|---|
| `rbxtsc` compiles everything | ✅ no errors; the shared game code compiled on the first try |
| `rojo build -o spike.rbxlx` | ✅ |
| Ported logic matches the web game | ✅ checked in Node against rc-racer's own modules: the 480 Meadow Loop centreline points agree to within 1e-13, and a scripted 30-second drive with 781 wall hits ends in the same place to within 1e-6 |
| Opens in Studio and drives round Meadow Loop | ✅ (2026-10-23) the track builds with no gaps on the bends, the car drives round it, and the camera matches the web game's view |

Controls feel good with keyboard, gamepad and touch (Studio's device emulator, one finger at a time),
and the view works on phone and console screens. Still to check: frame rate (Shift+F5 in Studio),
and touch driving on a real phone, which needs the place published privately.

## What carried over

- **`carPhysics.ts` and `collision.ts`: unchanged** apart from one added line,
  `import { Math } from './jsMath'`.
- **`trackPath.ts`: three kinds of change.** The Three.js import is swapped for our own spline
  (`catmullRom.ts`, about 90 lines, which follows Three.js's centripetal Catmull-Rom and its
  arc-length sampling exactly, so tracks keep their shape); `.length` on arrays becomes `.size()`
  (5 places); `Infinity` and `Math` come from `jsMath.ts`.
- **`jsMath.ts`** is a 20-line shim mapping the JavaScript `Math` calls onto Luau's `math`
  (`hypot` written out by hand). It means ported modules need only an import, not a rewrite of every
  call.

### What roblox-ts did and didn't need

- **No `Math` or `Infinity` globals.** Luau has `math`; the shim covers it.
- **Arrays have `.size()`, not `.length`.** It's a compile error, so nothing slips through. Indexes
  stay 0-based in TypeScript, and the compiler adds the `+ 1`.
- **JavaScript truthiness is kept.** `segLen || 1` still treats 0 as false: roblox-ts emits the
  extra checks.
- **`%` compiles to Luau's floored modulo**, which differs from JavaScript's for negative numbers.
  Every `%` in the game logic already wraps with `+ n` first or works on non-negative values, so
  nothing changes. New code needs the same care.
- **`Object.assign` and `Array.fill`** don't exist. Only `world.ts` uses them (twice and once).
- **Vector maths uses methods** (`a.add(b)`, `v.mul(k)`) instead of operators, in the
  Roblox-facing code only.

## What had to be rewritten

| Part | Web | Spike |
|---|---|---|
| Track | Triangle ribbons (`trackScene.ts`) | One box Part per centreline segment per strip, slightly overlapped so bends have no gaps: road, two striped kerbs, two walls (5 × 480 = 2,400 Parts) plus ground and start line, built by each player's client at startup (`client/buildTrack.ts`). Built on the server, it reached the player Part by Part and the race started with half the track missing; building it locally from the shared centreline is instant and sends nothing over the network. Overlapping boxes of different colours at the same height flicker (z-fighting), so red kerb stripes sit 0.05 studs above the white ones. EditableMesh would give fewer, truer pieces, and is worth trying if Parts look or perform badly. |
| Car | Three.js boxes and cylinders | The buggy's 7 boxes and 4 wheels as anchored Parts, moved each frame with `BulkMoveTo`; front wheels steer (`client/carModel.ts`). |
| Camera | Orthographic 3/4 view | Scriptable camera 300 studs away with a narrow lens (about 7° vertically), giving the same 36-unit view; same follow and look-ahead (`client/followCamera.ts`). |
| Input | Keyboard, Gamepad API and touch code | ContextActionService for keys and gamepad (same layout as the web), plus five on-screen touch buttons (`client/driveInput.ts`). |
| Loop | 120 Hz fixed step with drawing interpolated between steps | The same, on `BindToRenderStep` just after the camera (`client/main.client.ts`). |

Scale is 1 game unit = 1 stud. That's fine with no avatars on screen, but a car is about half an
avatar's height, so multiplayer lobbies with characters may want everything scaled up (one constant
at the render boundary; physics stays in game units).

`CharacterAutoLoads = false` (in `default.project.json`) stops an avatar spawning. There are no
server scripts yet: the client builds the track and does all the driving. Chat uses
TextChatService, but it and the player list are hidden while it's one player.

## The plan's mapping, revisited

| Part of the game | Plan's estimate | What the spike found |
|---|---|---|
| Pure logic (`carPhysics`, `race`, `season`, `racingLine`, `aiDriver`, `items`, `jumps`, `collision`, `world`, `tracks`) | Low–medium | **Low.** Two modules ported with one added line each. Scanning the rest (≈1,900 lines): no Three.js imports, ≈25 `.length` → `.size()` swaps, a `Math.round` to add to the shim, and `Object.assign`/`fill` in `world.ts`. A day or so to port and get compiling. |
| Tracks (`trackPath`) | Medium | **Done.** The spline port is exact. |
| 3D look | Rewrite | Rewrite, as expected. Parts are quick to build with; scenery, ramps, items and weather are the bulk of the work. |
| Camera | Low | **Low**, done. Whether the narrow lens looks right is still to be seen in Studio. |
| Input | Easier than today | **Easier for keys and gamepad.** Touch needed custom buttons, because ContextActionService's own buttons all sit bottom right. |
| Sound | Medium | Not tried. |
| Saving | Low–medium | Not tried. |
| Tests | Medium | **Cheaper than expected.** Shared modules can be tested in Node under vitest with a small shim (Luau `math` plus `Array.prototype.size`), which is how the parity check above ran. Jest-Lua or Lune is only needed for Roblox-facing code. |

## Firmer estimate for the rest (single player)

1. **AI racers and the race** (positions, laps, results, grid): port `race`, `racingLine`,
   `aiDriver`, `racers`, `world`; add more `CarModel`s and a lap/position HUD. Mostly porting:
   **2–3 days.**
2. **Items, boost pads, hazards, ramps**: port `items` and `jumps` (logic), rebuild
   `itemScene`/`rampScene` in Parts with ParticleEmitters: **3–5 days.**
3. **Season, garage, other tracks and themes, scenery**: logic ports; the 8 tracks' scenery and
   weather need rebuilding: **4–6 days.**
4. **Menus and HUD** in ScreenGui: **3–4 days.**
5. **Sound**: record the synthesized sounds to files, upload, wait for moderation: **1–2 days.**
6. **Saving and leaderboards** with DataStoreService: **1–2 days.**

About **3–4 weeks** of focused work for single player, which matches the plan's "less than steps
1–5 of the web game".

## What multiplayer would add

- Run the race on the server: the server owns positions, laps and results, and steps the AI cars.
- Each player's car stays client-side as in this spike (it's what makes it feel instant). Clients
  send their car state at 20–30 Hz; the server checks it (speed limits, staying on the track) and
  relays it, and other cars are drawn interpolated about 100 ms behind.
- Items need server authority: who got hit is decided by the server, with some lag allowance.
- Lobbies and matchmaking, with AI filling empty grid slots; a teleport flow between lobby and race.

That's another **3–5 weeks**, plus playtesting under real latency. The spike's split (shared pure
logic, a thin client loop) is the right shape for it: the same `stepCar` can run on both sides.
