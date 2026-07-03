import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the SERVICE-ROLE key.
 * This bypasses RLS, so it must NEVER be imported into client components.
 * All data access in the app goes through this client (server-only).
 */
let cached: SupabaseClient | null = null;

export function createSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.supabase_project_url;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.secret_key;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
