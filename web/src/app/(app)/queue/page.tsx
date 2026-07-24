import { redirect } from "next/navigation";
import { QueueList } from "@/components/queue-list";
import { getCurrentUser, getUserClinics } from "@/lib/auth";
import { createSupabaseRscClient } from "@/lib/supabase/rsc";

export default async function QueuePage() {
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

  // v_queue is already scoped to the caller's clinic(s) by RLS on its
  // underlying tables (security_invoker, see
  // supabase/migrations/0003_queue_security_invoker.sql) -- no additional
  // clinic_id filter is needed or safe to skip here.
  const supabase = await createSupabaseRscClient();
  const { data: rows, error } = await supabase.from("v_queue").select("*");

  if (error) throw error;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-4 pt-4 text-lg font-semibold sm:px-8 sm:pt-8">Queue</h1>
      <QueueList initialRows={rows ?? []} />
    </div>
  );
}
