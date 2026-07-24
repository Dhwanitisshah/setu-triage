import { redirect } from "next/navigation";
import { IntakeForm } from "@/components/intake-form";
import { getCurrentUser, getUserClinics } from "@/lib/auth";
import { createSupabaseRscClient } from "@/lib/supabase/rsc";

export default async function IntakePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const clinics = await getUserClinics();
  if (clinics.length === 0) {
    return (
      <div className="p-8 text-sm">
        Your account is not a member of any clinic. Contact an admin.
      </div>
    );
  }
  const clinicId = clinics[0].clinicId;

  const supabase = await createSupabaseRscClient();
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, full_name, age")
    .eq("clinic_id", clinicId)
    .order("full_name", { ascending: true });

  if (error) throw error;

  return <IntakeForm existingPatients={patients ?? []} />;
}
