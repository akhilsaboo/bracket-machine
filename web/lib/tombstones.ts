// Local record of brackets the user has deleted, so the sign-in sync never
// silently resurrects them (the bug: a deleted bracket reappears after a refresh
// because it's re-imported from the server). Forward-only by design — it starts
// empty, so brackets from *past* failed deletes are left exactly as they are.
const KEY = "wc2026-deleted-brackets";

export function getTombstones(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function addTombstone(id: string): void {
  if (typeof window === "undefined") return;
  const s = getTombstones();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore quota / private-mode errors */
  }
}
