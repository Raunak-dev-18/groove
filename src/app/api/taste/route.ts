import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getUserWithProfile, onboardingState, tasteSummaryFromProfile } from "@/lib/taste";

/** Current user's taste profile summary + onboarding progress. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser(req);
    const { createdAt, country, profile } = await getUserWithProfile(session.user.id);
    const [summary] = await Promise.all([tasteSummaryFromProfile(profile)]);
    const ob = onboardingState(createdAt, profile, country);
    return ok({ ...summary, onboarding: ob });
  });
}
