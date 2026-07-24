// Split out of actions.ts: a "use server" file may only export async
// functions (Next.js requires every export to become a server action
// reference) -- a plain object export like initialIntakeActionState breaks
// as soon as a client component imports anything from that file.
import type { TriageAssessment } from "@/lib/triage/types";

export type IntakeActionState =
  | { status: "idle" }
  | {
      status: "error";
      formError: string | null;
      fieldErrors: Record<string, string[]>;
    }
  | {
      status: "success";
      visitId: string;
      assessment: TriageAssessment;
    };

export const initialIntakeActionState: IntakeActionState = { status: "idle" };
