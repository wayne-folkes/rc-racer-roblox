import type { RecordRow } from 'shared/protocol';
import { LEADERBOARD_SIZE, placeInTop, toMs, withBest, type PersonalBests, type RecordKind, type TrackBests } from 'shared/records';

// Best times in Roblox's data stores. Each player's own bests are one entry ("player_<userId>") in
// a data store; each track's top 10 for a kind of time is an ordered data store, scoped by track id,
// with every player's best in milliseconds, which Roblox can hand back sorted. Studio writes to
// stores of its own, so testing doesn't touch the real records. Every call here that reaches a data
// store yields, so the server calls them from their own thread (task.spawn).

const DataStoreService = game.GetService('DataStoreService');
const UserService = game.GetService('UserService');
const RunService = game.GetService('RunService');

const SUFFIX = RunService.IsStudio() ? '_studio' : '';
/** A track's top 10 is read again after this long (s), to pick up other servers' times. */
const BOARD_TTL = 60;
/** Tries at a data store call before giving up; Roblox asks for a short wait between tries. */
const TRIES = 3;
const RETRY_WAIT = 1;

interface Board {
  race: RecordRow[];
  lap: RecordRow[];
  readAt: number;
}

/** Calls `f`, trying again a couple of times if the data store fails. */
function attempt<T>(what: string, f: () => T): T | undefined {
  for (let n = 1; n <= TRIES; n++) {
    const [ok, result] = pcall(f);
    if (ok) return result;
    if (n === TRIES) warn(`[records] ${what} failed: ${result}`);
    else task.wait(RETRY_WAIT);
  }
  return undefined;
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

  private ordered(kind: RecordKind, trackId: string): OrderedDataStore {
    return DataStoreService.GetOrderedDataStore(`${kind === 'race' ? 'Race' : 'Lap'}Times${SUFFIX}`, trackId);
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

  /** A player's best on a track, in seconds, if they have one. */
  best(userId: number, trackId: string, kind: RecordKind): number | undefined {
    const ms = this.bests.get(userId)?.[trackId]?.[kind];
    return ms !== undefined ? ms / 1000 : undefined;
  }

  /** A track's top 10 of each kind, read from the stores if not read lately. Yields. */
  board(trackId: string): Board {
    const cached = this.boards.get(trackId);
    if (cached && os.clock() - cached.readAt < BOARD_TTL) return cached;
    const board: Board = { race: this.readTop('race', trackId), lap: this.readTop('lap', trackId), readAt: os.clock() };
    this.boards.set(trackId, board);
    return board;
  }

  private readTop(kind: RecordKind, trackId: string): RecordRow[] {
    if (!this.available) return [];
    const page = attempt(`reading the ${kind} top 10 on ${trackId}`, () =>
      this.ordered(kind, trackId).GetSortedAsync(true, LEADERBOARD_SIZE).GetCurrentPage(),
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
   * A player set `seconds` for `kind` on a track. Saves it if it's their best, and puts it on the top
   * 10 if it's good enough. Returns whether it was a new personal best. Yields.
   */
  submit(player: Player, trackId: string, kind: RecordKind, seconds: number): boolean {
    const store = this.personal;
    const bests = this.bests.get(player.UserId);
    if (!store || !this.available || !bests) return false;
    const ms = toMs(seconds);
    const old = bests[trackId]?.[kind];
    if (old !== undefined && old <= ms) return false;
    this.bests.set(player.UserId, withBest(bests, trackId, kind, ms));

    // Both writes keep whichever time is lower, in case another server saved a faster one meanwhile.
    attempt(`saving ${player.UserId}'s best`, () =>
      store.UpdateAsync<unknown, PersonalBests>(`player_${player.UserId}`, (stored) =>
        $tuple(withBest(readBests(stored), trackId, kind, ms), [player.UserId]),
      ),
    );
    attempt(`saving ${player.UserId}'s ${kind} on ${trackId}`, () =>
      this.ordered(kind, trackId).UpdateAsync(tostring(player.UserId), (stored) =>
        isTime(stored) && stored <= ms ? undefined : ms,
      ),
    );

    const board = this.boards.get(trackId);
    if (board) {
      this.names.set(player.UserId, player.DisplayName);
      board[kind] = placeInTop(board[kind], { name: player.DisplayName, userId: player.UserId, time: ms / 1000 });
    }
    return true;
  }
}
