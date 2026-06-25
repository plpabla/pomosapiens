import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const smokeUserId = process.env.SMOKE_USER_ID;

if (!url || !key || !smokeUserId) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SMOKE_USER_ID must be set");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// (1) Delete any pre-existing rows for the smoke user (idempotency)
const { error: preDeleteError } = await supabase.from("sessions").delete().eq("user_id", smokeUserId);
if (preDeleteError) {
  console.error("pre-INSERT cleanup failed:", preDeleteError.message);
  process.exit(1);
}

// (2) INSERT one minimal row, capture the server-generated id
const { data: insertData, error: insertError } = await supabase
  .from("sessions")
  .insert({ user_id: smokeUserId, energy_level: "medium", started_at: new Date().toISOString() })
  .select("id")
  .single();

if (insertError) {
  console.error("INSERT failed:", insertError.message);
  process.exit(1);
}
if (!insertData) {
  console.error("INSERT failed: no data returned");
  process.exit(1);
}

const { id } = insertData;

// (3) SELECT and assert round-trip
const { data: readData, error: readError } = await supabase
  .from("sessions")
  .select("id, user_id, energy_level")
  .eq("id", id)
  .single();

if (readError) {
  console.error("SELECT failed:", readError.message);
  process.exit(1);
}
if (!readData) {
  console.error("SELECT failed: no data returned");
  process.exit(1);
}

if (readData.user_id !== smokeUserId || readData.energy_level !== "medium") {
  console.error("round-trip assertion failed:", JSON.stringify(readData));
  process.exit(1);
}

// (4) DELETE the exact row by id
const { error: postDeleteError } = await supabase.from("sessions").delete().eq("id", id);
if (postDeleteError) {
  console.error("post-SELECT cleanup failed:", postDeleteError.message);
  process.exit(1);
}

console.log("smoke OK");
