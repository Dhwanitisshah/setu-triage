// Smoke test: run with `npm run smoke` from web/.
// For every table: insert a row, read it back, assert the values match,
// then delete it. Also checks that v_queue returns rows. Never prints key
// values (ids, tokens, hashes) — only PASS/FAIL status per table.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import type { Database } from "../web/src/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
  );
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SMOKE_CLINIC_NAME = "Setu Smoke Test Clinic";

let anyFailed = false;

async function safe(op: PromiseLike<unknown>): Promise<void> {
  try {
    await op;
  } catch {
    // best-effort cleanup; ignore errors here
  }
}

function pass(table: string): void {
  console.log(`PASS ${table}`);
}

function fail(table: string, reason: string): void {
  anyFailed = true;
  console.log(`FAIL ${table}: ${reason}`);
}

async function main(): Promise<void> {
  let clinicId: string | undefined;
  let patientId: string | undefined;
  let visitId: string | undefined;
  let authUserId: string | undefined;

  try {
    // ---- setup: fixtures shared across table tests ----
    const { data: clinic, error: clinicErr } = await supabase
      .from("clinics")
      .insert({ name: SMOKE_CLINIC_NAME })
      .select("id, name, created_at")
      .single();
    if (clinicErr || !clinic) {
      fail("clinics", clinicErr?.message ?? "insert returned no row");
    } else if (clinic.name !== SMOKE_CLINIC_NAME) {
      fail("clinics", "read-back value did not match inserted value");
    } else {
      pass("clinics");
    }
    clinicId = clinic?.id;

    if (!clinicId) {
      throw new Error("cannot continue smoke test without a clinic fixture");
    }

    const consentGivenAt = new Date().toISOString();
    const { data: patient, error: patientErr } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinicId,
        full_name: "Smoke Test Patient",
        age: 40,
        sex: "other",
        consent_given_at: consentGivenAt,
      })
      .select("id, full_name, age, sex")
      .single();
    if (patientErr || !patient) {
      fail("patients", patientErr?.message ?? "insert returned no row");
    } else if (
      patient.full_name !== "Smoke Test Patient" ||
      patient.age !== 40 ||
      patient.sex !== "other"
    ) {
      fail("patients", "read-back value did not match inserted value");
    } else {
      pass("patients");
    }
    patientId = patient?.id;

    if (!patientId) {
      throw new Error("cannot continue smoke test without a patient fixture");
    }

    const { data: visit, error: visitErr } = await supabase
      .from("visits")
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        chief_complaint: "Smoke test complaint",
        status: "waiting",
      })
      .select("id, chief_complaint, status")
      .single();
    if (visitErr || !visit) {
      fail("visits", visitErr?.message ?? "insert returned no row");
    } else if (
      visit.chief_complaint !== "Smoke test complaint" ||
      visit.status !== "waiting"
    ) {
      fail("visits", "read-back value did not match inserted value");
    } else {
      pass("visits");
    }
    visitId = visit?.id;

    if (!visitId) {
      throw new Error("cannot continue smoke test without a visit fixture");
    }

    // ---- vitals ----
    const { data: vitalsRow, error: vitalsErr } = await supabase
      .from("vitals")
      .insert({
        clinic_id: clinicId,
        visit_id: visitId,
        respiratory_rate: 18,
        spo2: 97,
        temperature_c: 37.1,
        systolic_bp: 120,
        pulse: 80,
        consciousness: "alert",
      })
      .select("id, respiratory_rate, spo2, temperature_c, systolic_bp, pulse, consciousness")
      .single();
    if (vitalsErr || !vitalsRow) {
      fail("vitals", vitalsErr?.message ?? "insert returned no row");
    } else if (
      vitalsRow.respiratory_rate !== 18 ||
      vitalsRow.spo2 !== 97 ||
      Number(vitalsRow.temperature_c) !== 37.1 ||
      vitalsRow.systolic_bp !== 120 ||
      vitalsRow.pulse !== 80 ||
      vitalsRow.consciousness !== "alert"
    ) {
      fail("vitals", "read-back value did not match inserted value");
    } else {
      pass("vitals");
    }
    if (vitalsRow) {
      const { error: delErr } = await supabase
        .from("vitals")
        .delete()
        .eq("id", vitalsRow.id);
      if (delErr) fail("vitals (cleanup)", delErr.message);
    }

    // ---- triage_results ----
    const { data: triageRow, error: triageErr } = await supabase
      .from("triage_results")
      .insert({
        clinic_id: clinicId,
        visit_id: visitId,
        band: "yellow",
        decided_by: "manual",
        news2_score: 4,
        rationale: "Smoke test rationale",
      })
      .select("id, band, decided_by, news2_score, rationale")
      .single();
    if (triageErr || !triageRow) {
      fail("triage_results", triageErr?.message ?? "insert returned no row");
    } else if (
      triageRow.band !== "yellow" ||
      triageRow.decided_by !== "manual" ||
      triageRow.news2_score !== 4 ||
      triageRow.rationale !== "Smoke test rationale"
    ) {
      fail("triage_results", "read-back value did not match inserted value");
    } else {
      pass("triage_results");
    }
    if (triageRow) {
      const { error: delErr } = await supabase
        .from("triage_results")
        .delete()
        .eq("id", triageRow.id);
      if (delErr) fail("triage_results (cleanup)", delErr.message);
    }

    // ---- share_links ----
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: shareLinkRow, error: shareLinkErr } = await supabase
      .from("share_links")
      .insert({
        clinic_id: clinicId,
        visit_id: visitId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, token_hash, expires_at")
      .single();
    if (shareLinkErr || !shareLinkRow) {
      fail("share_links", shareLinkErr?.message ?? "insert returned no row");
    } else if (
      shareLinkRow.token_hash !== tokenHash ||
      new Date(shareLinkRow.expires_at).getTime() !== new Date(expiresAt).getTime()
    ) {
      fail("share_links", "read-back value did not match inserted value");
    } else {
      pass("share_links");
    }
    if (shareLinkRow) {
      const { error: delErr } = await supabase
        .from("share_links")
        .delete()
        .eq("id", shareLinkRow.id);
      if (delErr) fail("share_links (cleanup)", delErr.message);
    }

    // ---- audit_log ----
    const { data: auditRow, error: auditErr } = await supabase
      .from("audit_log")
      .insert({
        clinic_id: clinicId,
        actor: "smoke-test",
        action: "smoke.test",
        entity: "visit",
        entity_id: visitId,
        payload: { source: "smoke" },
      })
      .select("id, actor, action, entity, payload")
      .single();
    if (auditErr || !auditRow) {
      fail("audit_log", auditErr?.message ?? "insert returned no row");
    } else if (
      auditRow.actor !== "smoke-test" ||
      auditRow.action !== "smoke.test" ||
      auditRow.entity !== "visit" ||
      (auditRow.payload as { source?: string }).source !== "smoke"
    ) {
      fail("audit_log", "read-back value did not match inserted value");
    } else {
      pass("audit_log");
    }
    if (auditRow) {
      const { error: delErr } = await supabase
        .from("audit_log")
        .delete()
        .eq("id", auditRow.id);
      if (delErr) fail("audit_log (cleanup)", delErr.message);
    }

    // ---- clinic_members (requires a real auth.users row) ----
    const { data: authUser, error: authUserErr } =
      await supabase.auth.admin.createUser({
        email: `smoke-test-${Date.now()}@example.invalid`,
        email_confirm: true,
      });
    if (authUserErr || !authUser?.user) {
      fail("clinic_members", authUserErr?.message ?? "could not create test auth user");
    } else {
      authUserId = authUser.user.id;
      const { data: memberRow, error: memberErr } = await supabase
        .from("clinic_members")
        .insert({
          user_id: authUserId,
          clinic_id: clinicId,
          role: "operator",
        })
        .select("user_id, clinic_id, role")
        .single();
      if (memberErr || !memberRow) {
        fail("clinic_members", memberErr?.message ?? "insert returned no row");
      } else if (
        memberRow.user_id !== authUserId ||
        memberRow.clinic_id !== clinicId ||
        memberRow.role !== "operator"
      ) {
        fail("clinic_members", "read-back value did not match inserted value");
      } else {
        pass("clinic_members");
      }
      if (memberRow) {
        const { error: delErr } = await supabase
          .from("clinic_members")
          .delete()
          .eq("user_id", authUserId)
          .eq("clinic_id", clinicId);
        if (delErr) fail("clinic_members (cleanup)", delErr.message);
      }
    }

    // ---- v_queue ----
    const { data: queueRows, error: queueErr } = await supabase
      .from("v_queue")
      .select("visit_id, clinic_id, full_name, band")
      .eq("clinic_id", clinicId);
    if (queueErr) {
      fail("v_queue", queueErr.message);
    } else if (!queueRows || queueRows.length === 0) {
      fail("v_queue", "expected at least one queued row, got none");
    } else {
      pass("v_queue");
    }
  } catch (err) {
    anyFailed = true;
    console.log(`FAIL setup: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // ---- cleanup: remove every fixture row regardless of outcome ----
    if (authUserId) {
      await safe(supabase.auth.admin.deleteUser(authUserId));
    }
    if (visitId) {
      await safe(supabase.from("vitals").delete().eq("visit_id", visitId));
      await safe(supabase.from("triage_results").delete().eq("visit_id", visitId));
      await safe(supabase.from("share_links").delete().eq("visit_id", visitId));
      await safe(supabase.from("visits").delete().eq("id", visitId));
    }
    if (patientId) {
      await safe(supabase.from("patients").delete().eq("id", patientId));
    }
    if (clinicId) {
      await safe(supabase.from("audit_log").delete().eq("clinic_id", clinicId));
      await safe(supabase.from("clinic_members").delete().eq("clinic_id", clinicId));
      await safe(supabase.from("clinics").delete().eq("id", clinicId));
    }
  }

  console.log(anyFailed ? "SUMMARY: FAIL" : "SUMMARY: PASS");
  if (anyFailed) process.exit(1);
}

main();
