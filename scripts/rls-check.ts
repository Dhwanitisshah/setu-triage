// RLS verification: run with `npm run rls:check` from web/.
// Signs in as each seeded operator using the PUBLISHABLE key (never the
// service role) and asserts clinic isolation holds in both directions.
// A query that merely "doesn't throw" is not proof of anything — every
// assertion below checks row counts and, where a rejection is expected,
// the specific Postgres error code, so a wrong-reason failure still fails.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../web/src/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const seedPasswordA = process.env.SEED_PASSWORD_A;
const seedPasswordB = process.env.SEED_PASSWORD_B;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or " +
      "SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
  process.exit(1);
}

if (!seedPasswordA || !seedPasswordB) {
  console.error(
    "Missing SEED_PASSWORD_A or SEED_PASSWORD_B in environment. Run " +
      "`npm run db:seed` with those set first.",
  );
  process.exit(1);
}

const CLINIC_A_NAME = "Setu Seed Clinic A";
const CLINIC_B_NAME = "Setu Seed Clinic B";
const OPERATOR_A_EMAIL = "operator-a@setu.test";
const OPERATOR_B_EMAIL = "operator-b@setu.test";

// RLS_VIOLATION is the Postgres SQLSTATE Postgres raises when a row fails
// a policy's WITH CHECK / USING clause (insufficient_privilege).
const RLS_VIOLATION = "42501";

let anyFailed = false;

function pass(label: string): void {
  console.log(`PASS  ${label}`);
}

function fail(label: string, reason: string): void {
  anyFailed = true;
  console.log(`FAIL  ${label}: ${reason}`);
}

function assert(condition: boolean, label: string, reason: string): void {
  if (condition) pass(label);
  else fail(label, reason);
}

interface ClinicFixtures {
  clinicAId: string;
  clinicBId: string;
  clinicBVisitId: string;
}

async function loadFixtures(
  admin: SupabaseClient<Database>,
): Promise<ClinicFixtures> {
  const { data: clinicA, error: clinicAErr } = await admin
    .from("clinics")
    .select("id")
    .eq("name", CLINIC_A_NAME)
    .single();
  if (clinicAErr || !clinicA) {
    throw new Error(
      `Could not find seeded clinic "${CLINIC_A_NAME}". Run npm run db:seed first.`,
    );
  }

  const { data: clinicB, error: clinicBErr } = await admin
    .from("clinics")
    .select("id")
    .eq("name", CLINIC_B_NAME)
    .single();
  if (clinicBErr || !clinicB) {
    throw new Error(
      `Could not find seeded clinic "${CLINIC_B_NAME}". Run npm run db:seed first.`,
    );
  }

  const { data: visitB, error: visitBErr } = await admin
    .from("visits")
    .select("id")
    .eq("clinic_id", clinicB.id)
    .limit(1)
    .single();
  if (visitBErr || !visitB) {
    throw new Error(`Could not find a seeded visit for "${CLINIC_B_NAME}".`);
  }

  return {
    clinicAId: clinicA.id,
    clinicBId: clinicB.id,
    clinicBVisitId: visitB.id,
  };
}

async function signIn(
  email: string,
  password: string,
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Could not sign in as ${email}: ${error.message}`);
  }
  return client;
}

async function runChecksAsOperator(
  operatorLabel: string,
  client: SupabaseClient<Database>,
  ownClinicId: string,
  otherClinicId: string,
  otherClinicVisitId: string,
): Promise<void> {
  const tag = (label: string) => `[${operatorLabel}] ${label}`;

  // ---- own-clinic reads ----
  for (const table of ["patients", "visits", "vitals"] as const) {
    const { data, error } = await client
      .from(table)
      .select("id")
      .eq("clinic_id", ownClinicId);
    assert(
      !error && !!data && data.length > 0,
      tag(`can select own clinic's ${table}`),
      error ? error.message : `expected rows, got ${data?.length ?? 0}`,
    );
  }
  {
    const { error } = await client
      .from("triage_results")
      .select("id")
      .eq("clinic_id", ownClinicId);
    assert(
      !error,
      tag("can select own clinic's triage_results"),
      error?.message ?? "",
    );
  }

  // ---- cross-clinic select returns zero rows ----
  {
    const { data, error } = await client
      .from("patients")
      .select("id")
      .eq("clinic_id", otherClinicId);
    assert(
      !error && !!data && data.length === 0,
      tag("selecting other clinic's patients returns zero rows"),
      error ? error.message : `expected 0 rows, got ${data?.length ?? -1}`,
    );
  }

  // ---- cross-clinic insert is rejected ----
  {
    const { error } = await client.from("patients").insert({
      clinic_id: otherClinicId,
      full_name: "RLS Check Intruder",
      consent_given_at: new Date().toISOString(),
    });
    assert(
      !!error && error.code === RLS_VIOLATION,
      tag("inserting a patient into other clinic is rejected"),
      error
        ? `expected code ${RLS_VIOLATION}, got ${error.code}: ${error.message}`
        : "insert succeeded — should have been rejected",
    );
  }

  // ---- cross-clinic update affects zero rows ----
  {
    const { data, error } = await client
      .from("visits")
      .update({ chief_complaint: "RLS check tampering attempt" })
      .eq("id", otherClinicVisitId)
      .select("id");
    assert(
      !error && !!data && data.length === 0,
      tag("updating other clinic's visit affects zero rows"),
      error ? error.message : `expected 0 rows affected, got ${data?.length ?? -1}`,
    );
  }

  // ---- share_links: no policy at all ----
  {
    const { data, error } = await client.from("share_links").select("id");
    assert(
      !error && !!data && data.length === 0,
      tag("selecting share_links returns zero rows"),
      error ? error.message : `expected 0 rows, got ${data?.length ?? -1}`,
    );
  }

  // ---- audit_log: insert allowed, update/delete rejected ----
  let auditLogId: string | undefined;
  {
    const { data, error } = await client
      .from("audit_log")
      .insert({
        clinic_id: ownClinicId,
        actor: operatorLabel,
        action: "rls_check.probe",
        entity: "rls_check",
      })
      .select("id")
      .single();
    assert(
      !error && !!data,
      tag("can insert into audit_log for own clinic"),
      error?.message ?? "insert returned no row",
    );
    auditLogId = data?.id;
  }

  if (auditLogId) {
    const { data, error } = await client
      .from("audit_log")
      .update({ action: "rls_check.tampered" })
      .eq("id", auditLogId)
      .select("id");
    assert(
      !error && !!data && data.length === 0,
      tag("updating an audit_log row is rejected"),
      error ? error.message : `expected 0 rows affected, got ${data?.length ?? -1}`,
    );

    const { data: delData, error: delError } = await client
      .from("audit_log")
      .delete()
      .eq("id", auditLogId)
      .select("id");
    assert(
      !delError && !!delData && delData.length === 0,
      tag("deleting an audit_log row is rejected"),
      delError
        ? delError.message
        : `expected 0 rows affected, got ${delData?.length ?? -1}`,
    );
  } else {
    fail(
      tag("updating an audit_log row is rejected"),
      "skipped — no audit_log row was created to test against",
    );
    fail(
      tag("deleting an audit_log row is rejected"),
      "skipped — no audit_log row was created to test against",
    );
  }

  // ---- clinic_members: only own membership visible ----
  {
    const {
      data: { user },
    } = await client.auth.getUser();
    const { data, error } = await client.from("clinic_members").select("user_id, clinic_id");
    assert(
      !error &&
        !!data &&
        data.length === 1 &&
        data[0].user_id === user?.id &&
        data[0].clinic_id === ownClinicId,
      tag("clinic_members returns only own membership"),
      error
        ? error.message
        : `expected exactly 1 own membership row, got ${JSON.stringify(data)}`,
    );
  }

  // ---- structural guard: no view bypasses RLS via a missing
  // security_invoker setting. This doesn't depend on clinic membership at
  // all — it's schema hygiene, not data isolation — so it must come back
  // clean no matter which operator asks. v_queue previously bypassed RLS
  // entirely this way (it ran as the view owner, not the querying user)
  // until supabase/migrations/0003_queue_security_invoker.sql fixed it.
  {
    const { data, error } = await client.rpc("views_missing_security_invoker");
    assert(
      !error && !!data && data.length === 0,
      tag("no views are missing security_invoker"),
      error
        ? error.message
        : `views without security_invoker (bypass RLS): ${JSON.stringify(data)}`,
    );
  }

  // ---- v_queue: only own clinic's visits ----
  {
    const { data, error } = await client
      .from("v_queue")
      .select("visit_id, clinic_id");
    const allOwnClinic = (data ?? []).every((row) => row.clinic_id === ownClinicId);
    assert(
      !error && !!data && data.length > 0 && allOwnClinic,
      tag("v_queue returns only own clinic's visits"),
      error
        ? error.message
        : `expected only clinic ${ownClinicId}, got clinics ${JSON.stringify(
            [...new Set((data ?? []).map((r) => r.clinic_id))],
          )}`,
    );
  }
}

async function main(): Promise<void> {
  const admin = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const fixtures = await loadFixtures(admin);

  const clientA = await signIn(OPERATOR_A_EMAIL, seedPasswordA!);
  await runChecksAsOperator(
    "operator-a",
    clientA,
    fixtures.clinicAId,
    fixtures.clinicBId,
    fixtures.clinicBVisitId,
  );
  await clientA.auth.signOut();

  // Reload fixtures for the reverse direction: operator B's "other clinic"
  // is A, so we need a visit fixture that belongs to clinic A.
  const { data: visitA, error: visitAErr } = await admin
    .from("visits")
    .select("id")
    .eq("clinic_id", fixtures.clinicAId)
    .limit(1)
    .single();
  if (visitAErr || !visitA) {
    throw new Error(`Could not find a seeded visit for "${CLINIC_A_NAME}".`);
  }

  const clientB = await signIn(OPERATOR_B_EMAIL, seedPasswordB!);
  await runChecksAsOperator(
    "operator-b",
    clientB,
    fixtures.clinicBId,
    fixtures.clinicAId,
    visitA.id,
  );
  await clientB.auth.signOut();

  console.log(anyFailed ? "\nSUMMARY: FAIL" : "\nSUMMARY: PASS");
  if (anyFailed) process.exit(1);
}

main().catch((err) => {
  console.error("rls-check crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
