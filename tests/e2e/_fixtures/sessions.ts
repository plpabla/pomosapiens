import { createClient } from "@supabase/supabase-js";

function buildServiceRoleClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for e2e tests");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Bypasses RLS (intentional -- setting up SSR fixtures, not testing the API).
export async function insertSession(args: {
  userId: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  energyLevel?: "low" | "medium" | "high";
  focusRating?: number | null;
}): Promise<{ id: string }> {
  const supabase = buildServiceRoleClient();
  const startedAtStr = args.startedAt instanceof Date ? args.startedAt.toISOString() : args.startedAt;
  const endedAtStr =
    args.endedAt != null ? (args.endedAt instanceof Date ? args.endedAt.toISOString() : args.endedAt) : null;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: args.userId,
      started_at: startedAtStr,
      ended_at: endedAtStr,
      energy_level: args.energyLevel ?? "medium",
      focus_rating: args.focusRating ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`insertSession: ${error.message}`);
  }
  return { id: data.id as string };
}
