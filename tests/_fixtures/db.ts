import { createClient } from "@supabase/supabase-js";

export interface SessionRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: "low" | "medium" | "high";
  focus_rating: number | null;
  note: string | null;
}

// Module-level singleton -- process.env is available via nodejs_compat in the Workers test pool.
function buildServiceRoleClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for integration tests");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const supabase = buildServiceRoleClient();

export async function readSession(id: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, user_id, started_at, ended_at, energy_level, focus_rating, note")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`readSession(${id}): ${error.message}`);
  }
  return data;
}
