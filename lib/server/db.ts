import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only database client. Uses the secret key, so it bypasses row-level security:
// every caller must already have authenticated the request (site key, signature, cron secret...).
let client: SupabaseClient | null = null;

export function adminDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
