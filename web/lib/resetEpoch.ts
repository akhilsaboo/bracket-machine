// ── Launch reset switch ──────────────────────────────────────────────────────
// Bump RESET_EPOCH (e.g. "1" → "2") and deploy to force EVERY browser that has
// already opened the app to start completely fresh: all local state is wiped and
// the welcome tour shows again as the first thing. Use this right before sending
// the app out so previously-visited browsers don't skip onboarding.
//
// Behaviour:
//   • First time a browser ever sees an epoch → we just stamp it (NO wipe), so
//     introducing this mechanism doesn't disrupt anyone.
//   • Browser's stamped epoch differs from RESET_EPOCH → full local wipe + restamp.
//
// Note: this clears LOCAL/guest state only. A signed-in user's brackets live in
// Supabase and will re-sync after the wipe (the tour still re-shows). It does not
// delete any server data.

export const RESET_EPOCH = "2";

const EPOCH_KEY = "wc2026-epoch";
const PREFIX = "wc2026-";

export function applyResetEpoch(): void {
  if (typeof window === "undefined") return;
  try {
    const current = localStorage.getItem(EPOCH_KEY);
    if (current === RESET_EPOCH) return; // already up to date

    if (current === null) {
      // First introduction on this browser — stamp it, don't disrupt anything.
      localStorage.setItem(EPOCH_KEY, RESET_EPOCH);
      return;
    }

    // Explicit bump → wipe every app key for a clean start, then restamp.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== EPOCH_KEY) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    // Also clear sessionStorage (e.g. cached AI insights: wc2026-insight:*).
    const sRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) sRemove.push(k);
    }
    sRemove.forEach((k) => sessionStorage.removeItem(k));
    localStorage.setItem(EPOCH_KEY, RESET_EPOCH);
  } catch {
    // ignore private-mode / quota errors
  }
}
