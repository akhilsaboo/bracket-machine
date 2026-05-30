// Supabase is optional: the app runs in guest mode (localStorage) until these
// env vars are set, then accounts/saved brackets light up. Anon key is public
// by design (Row Level Security protects data), so NEXT_PUBLIC_ is correct.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
