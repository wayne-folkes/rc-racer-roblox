# RC Racer on Roblox: spike notes

The spike from [`rc-racer/docs/roblox-port.md`](../rc-racer/docs/roblox-port.md): one drivable car on
Meadow Loop in Roblox, driven by rc-racer's own handling code, compiled with roblox-ts and built
with Rojo.

## Running it

```bash
mise install    # Rojo 7.7.1, pinned in mise.toml
npm ci          # roblox-ts 3.0.0 and the Roblox types, pinned in package.json
npm run place   # compiles src/ to out/ and builds spike.rbxlx
npm test        # checks the ported game code against rc-racer's own, in Node
```

`npm test` needs rc-racer checked out beside this folder (`../rc-racer`) with its client's
dependencies installed, because it imports the web game's modules to compare against.
`test/setup.ts` gives Node the bits of Luau and roblox-ts the shared code expects.

Open `spike.rbxlx` in Roblox Studio and press Play. To edit code live instead, run `npm run watch`
and `npm run serve`, then connect from the Rojo plugin in Studio.

To race with more than one player, use Studio's multi-client test (Clients and Servers, with 2 or
more players): Studio opens a server window and one window per player.

Controls: WASD or arrows to drive, Space to drift, R to reset; on a gamepad RT/A for gas, LT/X to
brake, the stick or d-pad to steer, a bumper to drift, Y to reset; on touch, on-screen buttons.

## Icon and thumbnail

`design/icon.png` (512×512) and `design/thumbnail.png` (1920×1080) are the experience's icon and
thumbnail, drawn from rc-racer's link-preview art without its website link, since Roblox doesn't
allow links off the platform. Edit `design/icon.html` or `design/thumbnail.html` and run
`design/render.sh` (headless Chrome) to redraw them, then upload them in the Creator Dashboard.

## Status

| Check | Result |
|---|---|
| `rbxtsc` compiles everything | ✅ no errors |
| `rojo build -o spike.rbxlx` | ✅ |
| Ported logic matches the web game | ✅ checked in Node against rc-racer's own modules: the 480 Meadow Loop centreline points agree to within 1e-13, and a scripted 30-second drive with 781 wall hits ends in the same place to within 1e-6 |
| Ported race and AI match the web game | ✅ in Node: the racing line agrees to within 1e-12, and four AI cars racing for 60 seconds end within 3e-13 of the web game's AI, with the same standings |
| Multiplayer race sim | ✅ in Node: full races with simulated players' devices reporting at 20 Hz finish, standings follow finish times, players fill the back of the grid in join order, and a player who leaves is driven home by an AI |
| Ported items and ramps match the web game | ✅ in Node: the hazard dice give exactly the web game's numbers, item boxes, boost pads and ramps land within 2e-13, and a 60-second AI race with items ends within 3e-13 with the same pickups, missiles, bombs, hits and jumps |
| Items in a multiplayer race | ✅ in Node: in a 2-player race, AI and players pick up items, fire missiles and drop bombs, and hits land on AI and players alike (15 pickups, 6 missiles, 9 bombs, 11 hits, 5 on players) |
| Items in Studio | Partly: item boxes, boost pads, puddles and oil seen (2026-10-23); firing, hits and jumps not yet confirmed |
| All tracks match the web game | ✅ in Node: all 32 (16 tracks, both ways) have the web's control points, layouts and themes exactly, and their splines agree to within 7e-13 |
| Every track races | ✅ in Node: a full 3-lap race with items finishes on all 32 with no AI car stuck (73 s on Meadow Loop to 137 s on Olympus Rally reversed) |
| Cups and votes | ✅ in Node: vote options, counting, random tie-breaks, and cup points and standings |
| Scenery and meteors match the web game | ✅ in Node: scenery plans keep clear of the road on all 32 tracks (and matched the web's placement exactly in one-off comparisons, the second covering the Toybox and City cups' 2,348 objects); meteor timings, landings and crater limits follow the web's |
| Cups, votes, other tracks, scenery and weather in Studio | ⏳ not yet checked |
| Multiplayer in Studio | ✅ (2026-10-23) a 2-player test races the AI and bumps feel right, after drawing other cars where they really are rather than easing behind them |
| Other cars on a real phone | ✅ (2026-10-24) smooth on the published place, after carrying cars round the track through the phone's 0.68 s gaps in snapshots on home wifi |
| Best times | ✅ in Node: bests only improve, the top 10 keeps one line per player and goes to whoever set a tie first. ✅ in Studio (2026-10-24): times save to and load from the data stores, a rejoining player gets their bests and the top 10, and a 3-lap race saved its race time and best lap on finishing |
| Multiplayer on real phones | ✅ (2026-10-24) three iPhones raced a Space Cup together over 5G on a train and it played well: 60 fps, 37 ms ping, snapshots at 20/s with the longest arrival gap 0.13 s. Home wifi was worse than 5G (69 ms ping, gaps up to 0.68 s) |
| Opens in Studio and drives round Meadow Loop | ✅ (2026-10-23) the track builds with no gaps on the bends, the car drives round it, and the camera matches the web game's view |
| Vehicles in Studio | Partly (2026-10-24, one player): the panel shows during the vote above the controls hint, with each car turning in its card. A new profile sees the truck as a silhouette with "???" and its hint, and can't pick it. With a Classic Cup bronze in `Profiles_studio` the truck unlocks; picking it (V) saves it when the race starts, and a restart remembers it. The truck drives, picks up items and reports at 20/s. Still to check: races and wins saving at a race's end, another player seeing the truck, a stand-in driving one, and the panel on a phone |

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
- **No `Math.imul`.** `jsMath.ts` builds it from 16-bit halves so it's exact in Luau; bitwise
  operators compile to Luau's `bit32` library.

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
- **Cups and quick races** (`shared/cup.ts`, `server/main.server.ts`): between races, players vote
  for the Classic, Space, Toybox or City Cup, or a quick race on one of two random tracks (any of the 16,
  either way round); most votes wins, and a tie or no votes is settled at random. A cup is four
  races scored 15-12-10-8-6-4 for 1st to 6th, AI cars included, as in Mario Kart; level points go
  to the best single finish. The first vote lasts 20 seconds, later ones 15; between a cup's races
  there's a 10-second lobby. Each race is 3-2-1, three laps, then results (with the cup standings)
  for 10 seconds, 15 after a cup's last race. Once the first player finishes, the rest have 30
  seconds. Between races you can drive anywhere; anyone who joins mid-race watches the leader and
  joins a cup with no points. Vote by clicking or tapping, with 1–6, or with a gamepad's D-pad and A.
- **Tracks** (`shared/tracks.ts`, `shared/spaceTracks.ts`, `shared/toyboxTracks.ts`,
  `shared/cityTracks.ts`): all 16 of the web's tracks, each either way round, ported with their item
  layouts and themes. The Toybox and City cups (2026-10-24) were designed in the web game first and
  copied across unchanged. The City Cup races at night (`client/lighting.ts`: midnight clock, dim
  blue ambient), so its neon and lamps stand out. Every device builds the track the
  server names, and rebuilds when it changes.
- **Vehicles** (`shared/vehicles.ts`, `shared/unlocks.ts`, `client/carModel.ts`, `client/vehiclePanel.ts`):
  the buggy and the web game's Monster Truck. The truck is locked until a Classic Cup podium, worked
  out from the saved profile (`shared/unlocks.ts`). Players pick one between races, from a panel of
  3D cards (click or tap, V, or a gamepad's D-pad during the vote); a locked vehicle shows as a black
  silhouette with "???" and how to unlock it. The pick is remembered, and the server puts each player
  in the race with their pick if they've unlocked it. Truck times aren't saved yet (see
  `docs/progression.md`).
- **Who runs what:** the server runs the race (`shared/raceSim.ts`: AI driving, laps, positions,
  results) at 120 Hz. Each player's device drives that player's car, so it answers the controls
  instantly, and reports it 20 times a second. The server sends every car's position 20 times a
  second and the race state 4 times a second (`shared/protocol.ts`).
- **Other cars** (`client/remoteCars.ts`) are drawn where their latest report puts them *now*,
  carried on round the track for the time since (`shared/carry.ts`), and eased smoothly so
  corrections don't jump. Bumps use the same positions, so a car is hit where it's seen. Each report
  says when it was sent, so the server carries players' cars on for the trip too, and drops a report
  that arrives after a newer one. On a phone over wifi, snapshots were seen to stop for up to 0.68 s
  and then arrive in a bunch, with none lost; carrying cars on round the track (up to 1 s) rather
  than in a straight line keeps them moving through that without running into the walls.
- **Network readout** (`client/netReadout.ts`): the experience's owner, and anyone in Studio, sees
  the place version, frame rate, ping, snapshots a second, the longest gaps between snapshots (by
  when they were sent and when they arrived) and the server's longest frame. Stalls over 0.4 s are
  printed, so they show in the Developer Console (`/console` in chat).
- **Best times** (`shared/records.ts`, `server/records.ts`, `client/recordsPanel.ts`): each player's
  best race and best lap on every track, each way round, and a top 10 of each per track, kept in
  Roblox data stores. A player's times are saved as they cross the line (their best lap is kept if
  time runs out first); only an improvement is written, and every write keeps the lower of the
  stored and new times, so two servers can't undo each other. Times quicker than the whole distance
  at the server's speed limit (1.6× top speed) are dropped. The top 10 is re-read at most once a
  minute. Studio uses its own stores (names ending `_studio`) and needs Game Settings → Security →
  Enable Studio Access to API Services; without it, best times turn off with one warning. Players
  see the records panel in the lobby and countdown, the lap record and their best lap (`REC · PB`)
  while racing, and "New best…" when they finish.
- **Profiles** (`shared/profile.ts`, `server/profile.ts`): one `Profiles` data store entry per player
  (`player_<userId>`), holding the vehicle picked, race and race-win counts, and each cup's trophies.
  It's loaded when a player joins and saved when a race ends (`races`, and `raceWins` for a win) and
  when a vehicle pick changes; each save is an `UpdateAsync` that applies the change to whatever is
  stored, so two servers can't undo each other. Studio uses `Profiles_studio` and needs API access
  on, as the best times do; without it, the player gets the buggy only, with a note in the panel.
- **Bumps:** each device moves only its own car, and the server moves only AI cars. When a player
  bumps an AI car, the server pushes the AI car and the player's device pushes the player's car; two
  players' devices each push their own. With lag a bump can feel a little one-sided, which is
  normal for Roblox racers.
- **Rubber-banding:** AI cars pace themselves against whichever player is furthest ahead.
- **Leaving:** a player who quits mid-race has their car driven home by an AI.
- **Items** (`shared/items.ts`, `shared/jumps.ts`, ported from the web game): each piece is
  decided by whoever owns what it touches.
  - *The server* decides everything between cars: who takes an item box, what each racer holds,
    where missiles fly and bombs sit, and who gets hit. A hit on a player goes to that player's
    device, which spins out its own car. AI cars get everything on the server, including the web
    game's tactics for firing and bombing.
  - *Each device* handles what only touches its own car: boost pads, oil, puddles and ramps, so they
    react instantly like the handling does (`shared/handling.ts` applies them for both the AI and
    players' cars). Hazards are rolled at random each race; the server sends the seed and every
    device rolls the same layout.
  - Fire is X or Shift, B on a gamepad, or the ITEM button on touch. Missiles fly in the snapshots;
    held items, bombs and which boxes are respawning are in the race state, which is also sent the
    moment an item event happens.
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
| Sound | Medium | **Low**, with stock sounds. Roblox can't synthesize, so `client/sound.ts` plays free Creator Store sounds (Roblox's own, and the Pro Sound Effects and APM libraries Roblox licenses), needing no upload or moderation. The engine is one recorded loop, sped up along the web's two-gear curve (`shared/sound.ts`). |
| Saving | Low–medium | Not tried. |
| Tests | Medium | **Cheaper than expected.** Shared modules can be tested in Node under vitest with a small shim (Luau `math`, `Array.prototype.size`, and boolean `sort` comparators), which is how the parity checks ran. Jest-Lua or Lune is only needed for Roblox-facing code. |

## What's left

1. ~~**AI racers and the race**~~: done, with multiplayer (above).
2. ~~**Items, boost pads, hazards, ramps**~~: done (above). Still plain next to the web game:
   cars don't tilt on ramps, there's no boost flame or dust, and explosions are Roblox's stock
   effect. Item boxes, missiles and bombs follow the web's models (`client/itemModels.ts`), with a
   rounded missile nose because Roblox has no cone Part; boost pads are the web's chasing
   chevron arrows, each a ">" of two bars; oil and puddles are the web's seeded blobs, each a fan
   of triangles built from pairs of WedgeParts (Roblox has no polygon Part).
3. ~~**Other tracks, cups, voting, scenery, weather**~~: done. Each theme's scenery
   (`client/scenery.ts`: trees, cacti, pines, craters, mesas, volcanoes, ice and cracks; toys, pantry,
   sandcastles and workshop for the Toybox Cup; skyscrapers, rooftops, containers and street lights for
   the City Cup; plus water, lava, milk and oil ponds) lands exactly where the web's does (checked in Node against the web's own
   placement on all 32 tracks), built from Parts: cones are stacks of three cylinders, rocks are
   squashed spheres, at most 1,200 Parts a track. Weather (`client/weather.ts`: snow, dust,
   embers, glitter and rain as ParticleEmitters following the camera, rain stretched into streaks, tumbleweeds as rolling Parts) and
   the Space Cup's meteors (`client/meteors.ts`: streak, flash, shockwave, rocks and a crater, at
   most 12 craters kept) follow the web's timings and seeded randomness; they're purely for looks.
   Water ponds use the puddles' look rather than the web's plain pond colour. The web's
   single-player season (prize money, upgrades, the garage) isn't ported: it would need saving
   (step 6) to work across sessions.
4. **Menus** in ScreenGui (title, garage, settings): **3–4 days.**
5. ~~**Sound**~~: done with stock Creator Store sounds: engine (ours and the nearest car's), countdown and GO, items,
   boosts, oil, puddles, jumps, laps, final lap and finish, plus a mute button, volume steps and M to mute.
   Still to do: save the sound setting in the profile (it lasts a session), and, if wanted, swap in recordings
   of the web's own synthesized sounds for its retro feel (upload and moderation, about a day).
6. **Saving and leaderboards** with DataStoreService: **1–2 days.**
7. **Multiplayer polish**: private servers for friend groups, tighter cheat checks, playtesting
   under real lag (Studio's network simulator): **3–5 days.**

About **4–5 weeks** from here.
