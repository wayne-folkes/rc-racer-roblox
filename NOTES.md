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

To race with more than one player, use Studio's multi-client test (Clients and Servers, with 2 or
more players): Studio opens a server window and one window per player.

Controls: WASD or arrows to drive, Space to drift, R to reset; on a gamepad RT/A for gas, LT/X to
brake, the stick or d-pad to steer, a bumper to drift, Y to reset; on touch, on-screen buttons.

## Status

| Check | Result |
|---|---|
| `rbxtsc` compiles everything | ✅ no errors |
| `rojo build -o spike.rbxlx` | ✅ |
| Ported logic matches the web game | ✅ checked in Node against rc-racer's own modules: the 480 Meadow Loop centreline points agree to within 1e-13, and a scripted 30-second drive with 781 wall hits ends in the same place to within 1e-6 |
| Ported race and AI match the web game | ✅ in Node: the racing line agrees to within 1e-12, and four AI cars racing for 60 seconds end within 3e-13 of the web game's AI, with the same standings |
| Multiplayer race sim | ✅ in Node: full races with simulated players' devices reporting at 20 Hz finish, standings follow finish times, players fill the back of the grid in join order, and a player who leaves is driven home by an AI |
| Multiplayer in Studio | ✅ (2026-10-23) a 2-player test races the AI and bumps feel right, after drawing other cars where they really are rather than easing behind them |
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
- **No `null`; use `undefined`.** And a Luau array can't hold `undefined` (tables have no holes), so
  `Race.finishTimes` uses `NOT_FINISHED = -1` instead of `null`.
- **No getters or setters.** `race.controlsLocked` and friends became methods
  (`race.controlsLocked()`).
- **`sort` takes a comparator returning a boolean** ("a goes before b"), like Luau's `table.sort`,
  not a number. It's a type error, so it's caught, but the Node test shim has to translate it.
- **`next` and `error` are reserved** (Luau globals), so they can't be variable names.
- **One compile error stops all output**, not just that file's.

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

`CharacterAutoLoads = false` (in `default.project.json`) stops an avatar spawning. Chat uses
TextChatService; the player list is hidden because the HUD shows the standings.

## Multiplayer races

Friends in the same server race each other, with AI cars filling the grid.

- **Grid:** 6 cars. Players take slots from the back in the order they joined, as the web game's
  player starts at the back; AI cars (`shared/grid.ts`) fill the rest from pole. A seventh player
  watches until a slot is free.
- **Flow** (`server/main.server.ts`): the first player in starts a 20-second lobby timer, and
  everyone in the server when it runs out races. Then 3-2-1, three laps, results for 10 seconds,
  and a 10-second lobby before the next race. Once the first player finishes, the rest have 30
  seconds. Between races you can drive anywhere; anyone who joins mid-race watches the leader.
- **Who runs what:** the server runs the race (`shared/raceSim.ts`: AI driving, laps, positions,
  results) at 120 Hz. Each player's device drives that player's car, so it answers the controls
  instantly, and reports it 20 times a second. The server sends every car's position 20 times a
  second and the race state 4 times a second (`shared/protocol.ts`).
- **Other cars** (`client/remoteCars.ts`) are drawn where their latest report puts them *now*,
  carried on by their velocity, and eased smoothly so corrections don't jump. Bumps use the same
  positions, so a car is hit where it's seen.
- **Bumps:** each device moves only its own car, and the server moves only AI cars. When a player
  bumps an AI car, the server pushes the AI car and the player's device pushes the player's car; two
  players' devices each push their own. With lag a bump can feel a little one-sided, which is
  normal for Roblox racers.
- **Rubber-banding:** AI cars pace themselves against whichever player is furthest ahead.
- **Leaving:** a player who quits mid-race has their car driven home by an AI.
- **Cheating:** the server ignores a report that moves a car faster than 1.6× top speed (plus room
  for a reset). That stops teleporting; a modified client could still drive a little too fast, and
  tighter checks (lap times, staying on the track) are for later.

## The plan's mapping, revisited

| Part of the game | Plan's estimate | What the spike found |
|---|---|---|
| Pure logic (`carPhysics`, `race`, `season`, `racingLine`, `aiDriver`, `items`, `jumps`, `collision`, `world`, `tracks`) | Low–medium | **Low.** `carPhysics`, `collision`, `race`, `racingLine` and `aiDriver` are ported; the race needed the `null`, getter and `sort` changes above. `world.ts` was rewritten for several players as `raceSim.ts`. |
| Tracks (`trackPath`) | Medium | **Done.** The spline port is exact. |
| 3D look | Rewrite | Rewrite, as expected. Parts are quick to build with; scenery, ramps, items and weather are the bulk of the work. |
| Camera | Low | **Low**, done. Whether the narrow lens looks right is still to be seen in Studio. |
| Input | Easier than today | **Easier for keys and gamepad.** Touch needed custom buttons, because ContextActionService's own buttons all sit bottom right. |
| Sound | Medium | Not tried. |
| Saving | Low–medium | Not tried. |
| Tests | Medium | **Cheaper than expected.** Shared modules can be tested in Node under vitest with a small shim (Luau `math`, `Array.prototype.size`, and boolean `sort` comparators), which is how the parity checks ran. Jest-Lua or Lune is only needed for Roblox-facing code. |

## What's left

1. ~~**AI racers and the race**~~: done, with multiplayer (above).
2. **Items, boost pads, hazards, ramps**: port `items` and `jumps`, run them on the server (it
   decides who a missile hits, allowing for lag), rebuild `itemScene`/`rampScene` in Parts with
   ParticleEmitters: **4–6 days.**
3. **Season, garage, other tracks and themes, scenery**: logic ports; the 8 tracks' scenery and
   weather need rebuilding; a vote or rotation for the next track: **4–6 days.**
4. **Menus** in ScreenGui (title, garage, settings): **3–4 days.**
5. **Sound**: record the synthesized sounds to files, upload, wait for moderation: **1–2 days.**
6. **Saving and leaderboards** with DataStoreService: **1–2 days.**
7. **Multiplayer polish**: private servers for friend groups, tighter cheat checks, playtesting
   under real lag (Studio's network simulator): **3–5 days.**

About **4–5 weeks** from here.
