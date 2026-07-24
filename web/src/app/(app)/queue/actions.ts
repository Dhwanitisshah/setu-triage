"use server";

// Server action for advancing a visit's status along the queue. Uses the
// RLS-active rsc client exclusively -- never the service-role client -- so
// a clinic member can only ever move visits belonging to their own clinic
// (see web/src/app/(app)/intake/actions.ts for the same convention).
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseRscClient } from "@/lib/supabase/rsc";
import type { VisitStatus } from "@/types/database";

export type AdvanceStatusResult = { ok: true } | { ok: false; error: string };

const NEXT_STATUS: Record<VisitStatus, VisitStatus | null> = {
  waiting: "in_consult",
  in_consult: "done",
  done: null,
};

export async function advanceVisitStatus(visitId: string): Promise<AdvanceStatusResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const supabase = await createSupabaseRscClient();

  const { data: visit, error: fetchError } = await supabase
    .from("visits")
    .select("id, clinic_id, status")
    .eq("id", visitId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!visit) return { ok: false, error: "Visit not found." };

  const oldStatus = visit.status;
  const nextStatus = NEXT_STATUS[oldStatus];
  if (!nextStatus) {
    return { ok: false, error: `Cannot advance a visit from status "${oldStatus}".` };
  }

  const { error: updateError } = await supabase
    .from("visits")
    .update({ status: nextStatus })
    .eq("id", visitId);

  if (updateError) return { ok: false, error: updateError.message };

  const { error: auditError } = await supabase.from("audit_log").insert({
    clinic_id: visit.clinic_id,
    actor: user.id,
    action: "visit.status_change",
    entity: "visits",
    entity_id: visitId,
    payload: { old_status: oldStatus, new_status: nextStatus },
  });

  if (auditError) {
    // Audit failure is fatal to the whole operation (docs/DATA_MODEL.md
    // audit_log is append-only and meant to be a complete record) -- revert
    // the status change rather than leave an unaudited transition.
    await supabase.from("visits").update({ status: oldStatus }).eq("id", visitId);
    return { ok: false, error: auditError.message };
  }

  revalidatePath("/queue");
  return { ok: true };
}
