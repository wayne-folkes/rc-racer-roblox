import { newProfile, readProfile, type Profile } from 'shared/profile';
import { attempt } from './attempt';

// Each player's profile in Roblox's data store, one entry per player ("player_<userId>"). It follows
// the same Studio and API-access rules as the best times (records.ts). Every change is an UpdateAsync
// that applies to whatever is stored, so two servers, or a retry, can't undo each other. Every call
// that reaches the data store yields, so the server calls them from their own thread (task.spawn).

const DataStoreService = game.GetService('DataStoreService');
const Players = game.GetService('Players');
const RunService = game.GetService('RunService');

const SUFFIX = RunService.IsStudio() ? '_studio' : '';
/** How long a closing server waits for saves still in flight (s). Roblox allows about 30. */
const CLOSE_WAIT = 25;

export class ProfileBook {
  /** False once the data store can't be reached at all, e.g. in Studio with API access off. */
  available = true;
  private readonly profiles = new Map<number, Profile>();
  /** Players whose profile has been loaded, or saved, since they joined. */
  private readonly loadedIds = new Set<number>();
  private readonly store: DataStore | undefined;
  /** Saves still running, so a closing server can wait for them. */
  private saving = 0;

  constructor() {
    const [ok, store] = pcall(() => DataStoreService.GetDataStore(`Profiles${SUFFIX}`));
    if (ok) this.store = store;
    else this.disable(store);
    game.BindToClose(() => {
      let waited = 0;
      while (this.saving > 0 && waited < CLOSE_WAIT) waited += task.wait();
    });
  }

  private disable(why: unknown) {
    if (this.available) warn(`[profile] progress isn't saved: ${why}`);
    this.available = false;
  }

  /** Loads a player's profile when they join. Yields. */
  load(player: Player): void {
    const store = this.store;
    if (!store || !this.available) return;
    const userId = player.UserId;
    const [ok, value] = pcall(() => store.GetAsync(`player_${userId}`)[0]);
    if (!ok && RunService.IsStudio()) {
      // In Studio this is API access being off; a live server can always reach its stores.
      this.disable(value);
      return;
    }
    // If loading failed, keep an empty profile but don't mark the player loaded: they get the buggy
    // only, and their real profile comes back with the first save that gets through.
    if (!ok) warn(`[profile] loading ${userId} failed: ${value}`);
    // They may have left while the store was read; don't keep a profile for them.
    if (!player.IsDescendantOf(Players)) return;
    this.profiles.set(userId, ok ? readProfile(value) : newProfile());
    if (ok) this.loadedIds.add(userId);
  }

  forget(userId: number): void {
    this.profiles.delete(userId);
    this.loadedIds.delete(userId);
  }

  get(userId: number): Profile | undefined {
    return this.profiles.get(userId);
  }

  loaded(userId: number): boolean {
    return this.loadedIds.has(userId);
  }

  /**
   * Applies `change` to a player's profile: straight away in memory, then to whatever is stored. The
   * stored value that UpdateAsync returns becomes the player's profile. Yields.
   */
  update(userId: number, change: (p: Profile) => Profile): void {
    const store = this.store;
    if (!store || !this.available) return;
    this.profiles.set(userId, change(this.profiles.get(userId) ?? newProfile()));

    this.saving++;
    const saved = attempt(`saving ${userId}'s profile`, () =>
      store.UpdateAsync<unknown, Profile>(`player_${userId}`, (stored) => $tuple(change(readProfile(stored)), [userId]))[0],
    );
    this.saving--;

    // A player who left while the save ran isn't added back.
    if (saved !== undefined && Players.GetPlayerByUserId(userId) !== undefined) {
      this.profiles.set(userId, saved);
      this.loadedIds.add(userId);
    }
  }
}
