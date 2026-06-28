import { createClient } from "@supabase/supabase-js";

export interface SessionRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: "low" | "medium" | "high";
  focus_rating: number | null;
  note: string | null;
  topic_id: string | null;
  material_format_id: string | null;
}

// Per-file singleton (each test file gets its own Worker context under @cloudflare/vitest-pool-workers).
// process.env is available via nodejs_compat in the Workers test pool.
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
    .select("id, user_id, started_at, ended_at, energy_level, focus_rating, note, topic_id, material_format_id")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`readSession(${id}): ${error.message}`);
  }
  return data;
}

export async function createTestTopic(userId: string, name: string): Promise<string> {
  const { data, error } = await supabase.from("topics").insert({ owner_id: userId, name }).select("id").single();

  if (error) {
    throw new Error(`createTestTopic: ${error.message}`);
  }
  return data.id as string;
}

export async function createTestMaterialFormat(userId: string, name: string): Promise<string> {
  const { data, error } = await supabase
    .from("material_formats")
    .insert({ owner_id: userId, name })
    .select("id")
    .single();

  if (error) {
    throw new Error(`createTestMaterialFormat: ${error.message}`);
  }
  return data.id as string;
}

export interface TopicRow {
  id: string;
  owner_id: string | null;
  name: string;
  archived_at: string | null;
}

export async function readTopic(id: string): Promise<TopicRow | null> {
  const { data, error } = await supabase
    .from("topics")
    .select("id, owner_id, name, archived_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`readTopic(${id}): ${error.message}`);
  }
  return data;
}
