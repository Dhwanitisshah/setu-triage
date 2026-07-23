// Browser-side Supabase client for Client Components. Uses the publishable
// (anon) key and the signed-in user's session cookie, so every query runs
// under Row Level Security — this client can NEVER see data outside a
// user's own clinic(s).
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requireEnv } from "./require-env";

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabasePublishableKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
