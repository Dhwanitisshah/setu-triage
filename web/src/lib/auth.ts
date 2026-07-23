import "server-only";
// Server-side auth helpers for Server Components. Always go through the
// RLS-active rsc client — never the service-role client — so these
// helpers only ever see what the signed-in user is actually allowed to see.
import { createSupabaseRscClient } from "@/lib/supabase/rsc";
import type { ClinicRole } from "@/types/database";

export interface CurrentUser {
  id: string;
  email: string | null;
}

export interface UserClinic {
  clinicId: string;
  name: string;
  role: ClinicRole;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseRscClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return { id: user.id, email: user.email ?? null };
}

export async function getUserClinics(): Promise<UserClinic[]> {
  const supabase = await createSupabaseRscClient();

  const { data: memberships, error: membershipsErr } = await supabase
    .from("clinic_members")
    .select("clinic_id, role");
  if (membershipsErr) throw membershipsErr;
  if (!memberships || memberships.length === 0) return [];

  const clinicIds = memberships.map((m) => m.clinic_id);
  const { data: clinics, error: clinicsErr } = await supabase
    .from("clinics")
    .select("id, name")
    .in("id", clinicIds);
  if (clinicsErr) throw clinicsErr;

  const nameById = new Map((clinics ?? []).map((c) => [c.id, c.name]));

  return memberships.map((m) => ({
    clinicId: m.clinic_id,
    name: nameById.get(m.clinic_id) ?? "Unknown clinic",
    role: m.role,
  }));
}
