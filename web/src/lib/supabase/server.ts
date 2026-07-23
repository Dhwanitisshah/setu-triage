import "server-only";
// Service-role Supabase client. This key BYPASSES Row Level Security
// entirely — every query sees every clinic's data. Use it only for
// trusted server-side operations that must cross clinic boundaries
// (share-link token validation, seed/admin scripts). Never use it to
// serve a signed-in user's own requests — for that, use
// web/src/lib/supabase/rsc.ts, which is cookie-bound to the user's
// session and RLS-active.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

if (typeof window !== "undefined") {
  throw new Error(
    "web/src/lib/supabase/server.ts must never be imported into client-side code",
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
}

export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
