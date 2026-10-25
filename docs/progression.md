# Progression, slice 1: profiles, trophies, Rival wins, the Monster Truck and badges

The first piece of progression: enough to play the whole loop once. Finish a cup, earn a trophy,
unlock the Monster Truck, pick it, race it. Everything after this (more vehicles, XP, cosmetics,
daily challenges, medal times) builds on the profile and the rules here.

## Agreed rules

- **Vehicles are different, not better.** Each is strong somewhere and weak elsewhere, so friends
  in mixed lobbies race on skill. Best times are kept per vehicle.
- **Cup trophies come from the overall cup standings, AI cars included:** gold for 1st, silver for
  2nd, bronze for 3rd. Playing alone earns them the same way as playing with friends.
- **Rival wins:** in a cup with two or more players, the best-placed player gets a Rival win.
  Rival wins unlock cosmetics only, never vehicles, so nobody who plays alone is locked out of a car.
- **Everything is earned.** Selling things is undecided, so cosmetics stay a separate kind of
  unlock that could be sold later. Vehicles are never for sale.
- **Unlocks are worked out from what the player has done, not stored.** The profile keeps counts
  (trophies per cup, Rival wins, cups finished); a table says what each unlock needs. Adding an
  unlock later gives it straight away to everyone who already qualifies, so Rival wins earned now
  count towards cosmetics that don't exist yet.

## What the player sees

1. Between races (vote and lobby), a **vehicle panel** shows a card per vehicle. Each card has a
   small turning 3D view of the vehicle (a `ViewportFrame` holding a `CarModel`), its name and its
   one-line description. A **locked vehicle is a silhouette**: the same view with the frame's
   `ImageColor3` set to black, so its shape shows but not its colours or details. Its name and
   description are replaced by "???" and how to unlock it: "Finish in the top 3 of the Classic Cup".
   Players can see there's something to earn, and only find out exactly what it is by earning it.
2. In the vote, each cup shows the player's best trophy so far: "Classic Cup 🥉".
3. On the results after a cup's last race, every player in the standings has their trophy beside
   their name, and the best-placed player gets a Rival tag when there was more than one player. Each
   player also sees what they earned: "Bronze in the Classic Cup", "Rival win!",
   "Unlocked: Monster Truck". Roblox shows its own pop-up for a new badge.
4. Everyone in the server sees a chat line: "Wayne unlocked the Monster Truck!". The server sends
   an `Unlocked` message to every player, and each device shows it with
   `TextChannel:DisplaySystemMessage` in the general channel.
5. In the next lobby the truck is unlocked and can be picked. The choice is remembered across
   visits. Picking a vehicle mid-race takes effect at the next race.
6. Other players' cars are drawn as the vehicle they're driving. The best-times panel shows the
   board for the vehicle the player has picked.

## Vehicles

`shared/vehicles.ts` is the web game's `client/src/game/vehicles.ts` as it is: `VehicleId`,
`VEHICLE_IDS`, `VEHICLES` (name, blurb, tuning) and `isVehicleId`. The truck is the buggy's tuning
with five numbers changed: 94% top speed, 90% acceleration, 92% turn rate, much more grip on oil
(`slickGrip` 0.35) and half the drag in puddles.

What each unlock needs lives beside it, in `shared/unlocks.ts`:

```ts
export const VEHICLE_UNLOCKS: Record<VehicleId, Requirement> = {
  buggy: { kind: 'start' },
  truck: { kind: 'cup', circuit: 'classic', tier: BRONZE, hint: 'Finish in the top 3 of the Classic Cup' },
};
export function unlockedVehicles(profile: Profile): VehicleId[];
```

### Where the vehicle is used

| Where | Now | Change |
|---|---|---|
| The player's own car (`main.client.ts:218`) | `DEFAULT_TUNING` | The vehicle the server lists for them in the race; outside a race, the one they've picked |
| `CarModel` | Buggy only | Takes a `VehicleId` and builds the web game's truck shape (`SHAPES.truck` in rc-racer's `carModel.ts`: big wheels, tall body, light bar) |
| Other cars (`remoteCars.ts`) | Buggy | Built from `RacerView.vehicle`, rebuilt if it changes between races |
| `Entrant` / `SimRacer` (`raceSim.ts`) | name, userId | Add `vehicle`; AI cars are always the buggy in this slice |
| `standIn` (`raceSim.ts:126`) | AI drives with `DEFAULT_TUNING` | The AI drives with the leaving player's vehicle's tuning |
| `MAX_REPORTED_SPEED` (`main.server.ts:46`) | Buggy top speed × 1.6 | Fastest vehicle's top speed × 1.6, so a faster car added later isn't rejected |

The server only puts a player in a race with a vehicle they've unlocked. As today, it trusts each
device to drive with the right tuning; the speed check still catches teleporting.

## The profile

A new data store, `Profiles` (`Profiles_studio` in Studio, as the records do), with one entry per
player, `player_<userId>`:

```ts
interface Profile {
  v: 1;
  /** The vehicle last picked. */
  vehicle: VehicleId;
  /** Races finished, cup or quick. */
  races: number;
  /** Races finished 1st overall, AI cars included: what the Motorcycle (50) and Horse (100) need. */
  raceWins: number;
  /** Cups finished, any place. */
  cupsFinished: number;
  /** By circuit id ('classic', 'space'; later 'classic-rev' and so on). */
  cups: Record<string, CupRecord>;
  rivalWins: number;
}

interface CupRecord {
  /** Best trophy: 0 none, 1 bronze, 2 silver, 3 gold. */
  best: number;
  finished: number;
  bronze: number;
  silver: number;
  gold: number;
}
```

`shared/profile.ts` holds the pure parts, tested in Node: reading a stored value (anything
malformed falls back to an empty profile, field by field, as `readBests` does), `withCupResult`
(adds a cup's result) and `withVehicle`. `server/profile.ts` holds the data store calls, shaped like
`RecordBook`: `load` when the player joins, `forget` when they leave.

**Saving.** Each save is an `UpdateAsync` that applies a change to whatever is stored: add 1 to the
counts, keep the higher trophy. If the player is in two servers at once, or a load failed, nothing
is lost. The value `UpdateAsync` hands back becomes the player's profile in memory. There are three
kinds of write:

- **When a race ends**, for each player who raced it: `races` and, for 1st place, `raceWins`. Race
  wins are saved from this slice on, so they count towards the Motorcycle and Horse before those
  exist.
- **When a cup ends**, for each player in it who's still in the server: one write per player per cup.
  On a cup's last race this is the same write as the race's.
- **When a race starts**, for a player whose picked vehicle changed since it was last saved: at most
  one write per player per race.

`game.BindToClose` waits for saves still in flight, so a server shutting down at the end of a cup
keeps them.

**If the store can't be reached** (Studio with API access off, or an outage), the player gets the
buggy only, and the vehicle panel says progress can't be saved right now. A cup result that fails to
save is retried as the records' `attempt` does, then given up with a warning.

## Cup awards

`shared/cup.ts` gains `races` on `CupStanding` (races scored, counted in `addRace`) and a pure
function:

```ts
interface CupAward {
  userId: number;
  /** Overall place, AI cars included. */
  place: number;
  /** 3 gold, 2 silver, 1 bronze, 0 none. */
  tier: number;
  rival: boolean;
}
export function cupAwards(standings: CupStanding[], totalRaces: number): CupAward[];
```

- Every player in the final standings gets an award, with their tier from their overall place.
  There's no minimum number of races for a trophy: AI cars score in every race, so a player who
  joined late, with no points from the races they missed, is very unlikely to make the top 3.
- **Rival:** a player counts as a rival if they raced at least half the cup's races (2 of 4). When
  there are two or more rivals, the best-placed of them gets `rival: true`. A friend who drops in
  for the last race doesn't turn a solo cup into a Rival win.
- A player who left before the end is still in the standings (their stand-in kept scoring for
  them) and still counts as a rival, but only players still in the server are given anything.

The server calls `cupAwards` in `finishRace` when `mode.cup.done()`. For each award to a player
still present, it saves the result, finds what's newly unlocked by comparing unlocks before and
after, awards badges, and sends the player their profile with the news.

## Badges

Badges are created by hand in the Creator Dashboard, and their ids go in `shared/badges.ts`. An id of 0 means "not created yet" and is skipped, so the code can ship
before the badges exist. In Studio the server doesn't award badges at all.

| Badge (proposed name) | Earned by |
|---|---|
| Batteries Included | Finishing your first race |
| Chequered Flag | Finishing any cup |
| Big Wheels | A Classic Cup podium (unlocks the Monster Truck) |
| Meadow Monarch | Gold in the Classic Cup |
| Lunar Legend | Gold in the Space Cup |
| Bragging Rights | The first Rival win |

That's six. Roblox lets you create five free per experience per day, and each one after that costs
100 Robux ([Badges](https://create.roblox.com/docs/production/publishing/badges)), so create five
one day and the sixth the next. Badges awarded before they're created are picked up later, because
badges follow the profile (below). The Motorcycle's and Horse's badges ("Wheelie Good", "Actual
Horsepower") come with them, and a Space Cup podium badge with the hover car. Badge art (512×512, shown as
a circle) can be drawn like the icon: an HTML page per badge in `design/`, rendered by
`design/render.sh`.

Badges follow the profile rather than the single cup. After every cup, the server checks each badge
the profile qualifies for that it hasn't already confirmed this session: `UserHasBadgeAsync`, then
`AwardBadge` if needed, each in a `pcall`. A badge that fails to award is tried again after the
player's next cup.

## Best times per vehicle

Best times (`server/records.ts`) were kept per track before this slice. Each
vehicle gets its own, as in the web game, with a record key of `trackId` for the buggy and
`truck_<trackId>` for the truck (an underscore rather than a colon, since the key is also an ordered
data store scope). That key is used both in the player's own bests and as the scope of
the ordered stores. Keeping the buggy's key unprefixed means buggy times saved before this slice
stay where they are. `RecordsMessage` gains `vehicle`, and the server sends a player the records again
when they pick a different vehicle.

## Messages

| Message | Direction | When | Contents |
|---|---|---|---|
| `RaceState` | server → all | As now | `RacerView` gains `vehicle`; `StandingView` gains `trophy` and `rival` for a finished cup; `voteCups` gives each vote option's circuit id, for the medals in the vote menu |
| `Profile` (new) | server → player, reliable | After loading on join, after a cup's awards, after a vehicle pick | `ProfileMessage`, below |
| `ChooseVehicle` (new) | player → server, reliable | The player picks a vehicle | A `VehicleId` |
| `Unlocked` (new) | server → all, reliable | Someone unlocks a vehicle | Their display name and the vehicle's name, for the chat line |
| `Records` | server → player | As now, and after a vehicle pick | Gains `vehicle` |

```ts
interface ProfileMessage {
  /** False if the profile couldn't be loaded: buggy only, nothing saved. */
  available: boolean;
  vehicle: VehicleId;
  /** The vehicles the player can pick. Locked ones get their hint from shared/unlocks.ts. */
  unlocked: VehicleId[];
  /** Best trophy per circuit id, for the vote menu. */
  trophies: Record<string, number>;
  rivalWins: number;
  /** What was just earned, for the results screen; empty except on the send after a cup. */
  news: string[];
}
```

The server ignores a `ChooseVehicle` for an unknown or locked vehicle. A pick made during a race is
saved and applies at the next race start.

## Controls for the vehicle panel

- Click or tap a vehicle. A locked card can't be picked; tapping it just shows its hint.
- Keyboard: `V` steps to the next unlocked vehicle. `R`, `X` and Shift are taken.
- Gamepad: during the vote, the vehicle buttons join the vote menu's gamepad navigation
  (`GuiService.SelectedObject`), so the D-pad moves to them and A picks one. Every face button, both
  bumpers and the D-pad are already used for driving, so in the lobby between a cup's races a
  gamepad player keeps their vehicle; they can change it at the next vote.

## Testing

**In Node (`npm test`)**

- `VEHICLES` matches the web game's `vehicles.ts` exactly, as the other ported modules are checked.
- `cupAwards`: tiers by place with AI cars ahead and behind, a solo cup (no Rival), two players
  (Rival to the higher), a late joiner who raced one race (not a rival), a player who left (counts
  as a rival but isn't present).
- `profile.ts`: malformed stored values, `withCupResult` adding counts and keeping the best tier,
  unlocks before and after a Classic Cup bronze, and an old profile qualifying for a newly added
  unlock.
- `raceSim`: an entrant's vehicle reaches the racer, and a stand-in drives with that vehicle's
  tuning.
- Record keys per vehicle.

**In Studio**

- A Studio-only `CupLaps` attribute on `Workspace` shortens every race to that many laps, so a whole
  cup takes about two minutes. A Studio-only `Autopilot` attribute lets the AI drive the player's
  car, so a cup can be played hands-free. Both are ignored on a live server.
- Multi-client test with 2 players: finish a Classic Cup on the podium and see the trophy, Rival tag
  and unlock on the results. Pick the truck in the lobby, and check the other window draws a truck
  and the truck handles differently on oil.
- Leave and rejoin: the pick and the unlock are remembered (needs Studio API access on).

**On the published (private) place**

- Badges award, and Roblox's pop-up appears. The server skips badges in Studio, so they're only
  checked here.

## Order of work

1. **Commit the best-times work first.** This slice changes its record keys.
2. **Vehicles end to end, everything unlocked:** `vehicles.ts`, the truck model, per-vehicle tuning
   on devices and the server, `RacerView.vehicle`, the vehicle panel and `ChooseVehicle`. Check it in
   Studio with 2 players.
3. **The profile:** the store, load and save, a remembered pick, race counts and wins saved at each
   race's end, and locking the truck. The vehicle cards gain their 3D views, shown as silhouettes
   while locked.
4. **Cup awards:** `races` on standings, `cupAwards`, the save at cup end, and the results-screen news
   and trophies.
5. **Badges:** create the five in the Creator Dashboard, fill in their ids, and check them on the
   published place.
6. **Best times per vehicle.**

Steps 2 to 4 are each worth a separate commit and a Studio check.

## Not in this slice

- **XP and levels**, and the Go-kart that would unlock by level.
- **Cosmetics.** Paint will be the first; Rival wins are counted now so they're earned retroactively.
  Player colours currently mark each car in the standings, so custom paint needs another way to show
  who's who (perhaps a coloured name tag).
- **More vehicles** (Drift car, Hover car, F1, Golden Buggy) and reverse cups.
- **The Motorcycle (50 race wins) and the Horse (100 race wins)**, the silly ones. Race wins are
  counted from this slice, so both unlock straight away for anyone who already has enough. Like the
  other vehicles they're different, not better:
  - *Motorcycle:* the quickest off the line and the sharpest to turn, but little grip. It slides
    wide and oil is brutal. The model leans into corners.
  - *Horse:* the slowest top speed, but hooves don't care about oil or puddles. Its legs gallop
    faster the faster it goes. It's a trophy for the dedicated more than a racer.
  - The locked card is a silhouette, like the truck's, with progress in place of the name:
    "??? · 12 of 50 race wins". A horse-shaped silhouette in a row of cars should make people curious.
- **AI cars driving the truck**, which would show it off to players who haven't unlocked it.
  `AiDriver` already takes a tuning, but the AI's pace and the cup balance would need checking.
- **Daily challenges, medal times, and analytics events** (`AnalyticsService` onboarding funnel:
  first race, first cup, first unlock).

## Open questions

1. **Badge names.** The names above are proposals.
