"use client";

// Shared display-name state. The leaderboards read profiles.display_name straight
// from the DB; this context keeps the *client* surfaces (account menu, the one-time
// name prompt, the header) in sync and gives a nicer default than the email prefix.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";

interface ProfileContextValue {
  /** Best name to show: a custom name if set, else the Google name, else email prefix. */
  displayName: string;
  /** The raw value stored in profiles.display_name (may be the email-prefix default). */
  storedName: string | null;
  /** True once we've loaded the profile (or there's no user). */
  ready: boolean;
  /** Persist a new display name. Returns an error message, or null on success. */
  updateDisplayName: (name: string) => Promise<string | null>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);
export const MAX_NAME_LEN = 40;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [storedName, setStoredName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !user) {
      setStoredName(null);
      setReady(true); // no user → nothing to load
      return;
    }
    let on = true;
    setReady(false);
    sb.from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!on) return;
        setStoredName((data?.display_name as string | undefined) ?? null);
        setReady(true);
      });
    return () => {
      on = false;
    };
  }, [user]);

  const updateDisplayName = useCallback(
    async (name: string): Promise<string | null> => {
      const sb = getSupabaseBrowser();
      if (!sb || !user) return "You need to be signed in.";
      const clean = name.trim().slice(0, MAX_NAME_LEN);
      if (!clean) return "Name can't be empty.";
      const { error } = await sb.from("profiles").update({ display_name: clean }).eq("id", user.id);
      if (error) return error.message;
      setStoredName(clean);
      return null;
    },
    [user],
  );

  // Prefer a custom name; if the stored value is still the auto-default (email
  // prefix) or empty, fall back to the Google name for display.
  const emailPrefix = user?.email?.split("@")[0] ?? "";
  const fullName = ((user?.user_metadata?.full_name as string | undefined) ?? "").trim();
  const stored = (storedName ?? "").trim();
  const isAutoDefault = stored === "" || stored === emailPrefix;
  const displayName = (isAutoDefault ? fullName || stored || emailPrefix : stored) || "You";

  return (
    <ProfileContext.Provider value={{ displayName, storedName, ready, updateDisplayName }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
