import type { RecordRow } from 'shared/protocol';
import { LEADERBOARD_SIZE, placeInTop, toMs, withBest, type PersonalBests, type RecordKind, type TrackBests } from 'shared/records';
import { attempt } from './attempt';

// Best times in Roblox's data stores. Each player's own bests are one entry ("player_<userId>") in
// a data store; each track and vehicle's top 10 for a kind of time is an ordered data store, scoped
// by its record key (shared/records.ts recordKey), with every player's best in milliseconds, which
// Roblox can hand back sorted. Studio writes to
// stores of its own, so testing doesn't touch the real records. Every call here that reaches a data
// store yields, so the server calls them from their own thread (task.spawn).

const DataStoreService = game.GetService('DataStoreService');
const UserService = game.GetService('UserService');
const RunService = game.GetService('RunService');

const SUFFIX = RunService.IsStudio() ? '_studio' : '';
/** A track's top 10 is read again after this long (s), to pick up other servers' times. */
const BOARD_TTL = 60;

interface Board {
  race: RecordRow[];
  lap: RecordRow[];
  readAt: number;
}

const isTime = (v: unknown): v is number => typeIs(v, 'number') && v > 0 && v === v;

/** What's stored for a player, keeping only well-formed times. */
function readBests(value: unknown): PersonalBests {
  const bests: PersonalBests = {};
  if (!typeIs(value, 'table')) return bests;
  for (const [trackId, times] of value as Map<unknown, unknown>) {
    if (!typeIs(trackId, 'string') || !typeIs(times, 'table')) continue;
    const { race, lap } = times as TrackBests;
    bests[trackId] = { race: isTime(race) ? race : undefined, lap: isTime(lap) ? lap : undefined };
  }
  return bests;
}

export class RecordBook {
  /** False once a data store can't be reached at all, e.g. in Studio with API access off. */
  available = true;
  private readonly bests = new Map<number, PersonalBests>();
  private readonly boards = new Map<string, Board>();
  private readonly names = new Map<number, string>();
  private readonly personal: DataStore | undefined;

  constructor() {
    const [ok, store] = pcall(() => DataStoreService.GetDataStore(`PersonalBests${SUFFIX}`));
    if (ok) this.personal = store;
    else this.disable(store);
  }

  private disable(why: unknown) {
    if (this.available) warn(`[records] best times are off: ${why}`);
    this.available = false;
  }

  /** The ordered store for `kind`, scoped by a `recordKey`. */
  private ordered(kind: RecordKind, key: string): OrderedDataStore {
    return DataStoreService.GetOrderedDataStore(`${kind === 'race' ? 'Race' : 'Lap'}Times${SUFFIX}`, key);
  }

  /** Loads a player's bests when they join. Yields. */
  load(player: Player): void {
    const store = this.personal;
    if (!store || !this.available) return;
    this.names.set(player.UserId, player.DisplayName);
    const [ok, value] = pcall(() => store.GetAsync(`player_${player.UserId}`)[0]);
    if (!ok && RunService.IsStudio()) {
      // In Studio this is API access being off; a live server can always reach its stores.
      this.disable(value);
      return;
    }
    // If loading failed, start empty: saving still keeps the lower of the stored and new times.
    if (!ok) warn(`[records] loading ${player.UserId} failed: ${value}`);
    this.bests.set(player.UserId, ok ? readBests(value) : {});
  }

  forget(userId: number): void {
    this.bests.delete(userId);
  }

  /** A player's best under `key` (a `recordKey`), in seconds, if they have one. */
  best(userId: number, key: string, kind: RecordKind): number | undefined {
    const ms = this.bests.get(userId)?.[key]?.[kind];
    return ms !== undefined ? ms / 1000 : undefined;
  }

  /** The top 10 of each kind under `key` (a `recordKey`), read from the stores if not read lately. Yields. */
  board(key: string): Board {
    const cached = this.boards.get(key);
    if (cached && os.clock() - cached.readAt < BOARD_TTL) return cached;
    const board: Board = { race: this.readTop('race', key), lap: this.readTop('lap', key), readAt: os.clock() };
    this.boards.set(key, board);
    return board;
  }

  private readTop(kind: RecordKind, key: string): RecordRow[] {
    if (!this.available) return [];
    const page = attempt(`reading the ${kind} top 10 on ${key}`, () =>
      this.ordered(kind, key).GetSortedAsync(true, LEADERBOARD_SIZE).GetCurrentPage(),
    );
    if (!page) return [];
    const rows: RecordRow[] = [];
    for (const { key, value } of page) {
      const userId = tonumber(key);
      if (userId !== undefined && isTime(value)) rows.push({ name: '', userId, time: value / 1000 });
    }
    this.nameRows(rows);
    return rows;
  }

  /** Fills in display names, asking Roblox only for the ones not seen before. */
  private nameRows(rows: RecordRow[]) {
    const unknown = rows.filter((r) => !this.names.has(r.userId)).map((r) => r.userId);
    if (unknown.size() > 0) {
      const infos = attempt('looking up names', () => UserService.GetUserInfosByUserIdsAsync(unknown));
      for (const info of infos ?? []) this.names.set(info.Id, info.DisplayName);
    }
    for (const r of rows) r.name = this.names.get(r.userId) ?? 'Racer';
  }

  /**
   * A player set `seconds` for `kind` under `key` (a `recordKey`). Saves it if it's their best, and
   * puts it on the top 10 if it's good enough. Returns whether it was a new personal best. Yields.
   */
  submit(player: Player, key: string, kind: RecordKind, seconds: number): boolean {
    const store = this.personal;
    const bests = this.bests.get(player.UserId);
    if (!store || !this.available || !bests) return false;
    const ms = toMs(seconds);
    const old = bests[key]?.[kind];
    if (old !== undefined && old <= ms) return false;
    this.bests.set(player.UserId, withBest(bests, key, kind, ms));

    // Both writes keep whichever time is lower, in case another server saved a faster one meanwhile.
    attempt(`saving ${player.UserId}'s best`, () =>
      store.UpdateAsync<unknown, PersonalBests>(`player_${player.UserId}`, (stored) =>
        $tuple(withBest(readBests(stored), key, kind, ms), [player.UserId]),
      ),
    );
    attempt(`saving ${player.UserId}'s ${kind} on ${key}`, () =>
      this.ordered(kind, key).UpdateAsync(tostring(player.UserId), (stored) =>
        isTime(stored) && stored <= ms ? undefined : ms,
      ),
    );

    const board = this.boards.get(key);
    if (board) {
      this.names.set(player.UserId, player.DisplayName);
      board[kind] = placeInTop(board[kind], { name: player.DisplayName, userId: player.UserId, time: ms / 1000 });
    }
    return true;
  }
}
