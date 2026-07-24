import "server-only";
// Cookie-bound Supabase client for Server Components and Server Actions.
// Uses the publishable (anon) key and the request's session cookies, so
// every query runs under Row Level Security as the signed-in user — this
// client can NEVER see data outside a user's own clinic(s). This is
// distinct from web/src/lib/supabase/server.ts (service role, BYPASSES
// RLS) — never substitute one for the other.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { requireEnv } from "./require-env";

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabasePublishableKey = requireEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export async function createSupabaseRscClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that cannot set cookies (no
          // response to attach them to). Session refresh for these
          // requests is instead handled by web/middleware.ts.
        }
      },
    },
  });
}
