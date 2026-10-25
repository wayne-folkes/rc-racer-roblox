// Calls a data store, trying again a couple of times if it fails. Roblox asks for a short wait between
// tries. The call can yield, so the caller runs it from its own thread (task.spawn) if it must not wait.

/** Tries at a data store call before giving up. */
const TRIES = 3;
const RETRY_WAIT = 1;

/** Calls `f`, trying again a couple of times if the data store fails. */
export function attempt<T>(what: string, f: () => T): T | undefined {
  for (let n = 1; n <= TRIES; n++) {
    const [ok, result] = pcall(f);
    if (ok) return result;
    if (n === TRIES) warn(`[data store] ${what} failed: ${result}`);
    else task.wait(RETRY_WAIT);
  }
  return undefined;
}
