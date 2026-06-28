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
export async function insertTopic(args: { userId: string; name: string }): Promise<{ id: string }> {
  const supabase = buildServiceRoleClient();

  const { data, error } = await supabase
    .from("topics")
    .insert({
      owner_id: args.userId,
      name: args.name,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`insertTopic: ${error.message}`);
  }
  return { id: data.id as string };
}
