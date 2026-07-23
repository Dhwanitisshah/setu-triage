import { getCurrentUser, getUserClinics } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export default async function AppHome() {
  const user = await getCurrentUser();
  const clinics = await getUserClinics();

  return (
    <div className="flex min-h-screen flex-col gap-4 p-8">
      <p className="text-sm">
        Signed in as <span className="font-medium">{user?.email}</span>
      </p>

      {clinics.map((clinic) => (
        <p key={clinic.clinicId} className="text-sm">
          {clinic.name} — <span className="font-medium">{clinic.role}</span>
        </p>
      ))}

      <div>
        <SignOutButton />
      </div>
    </div>
  );
}
