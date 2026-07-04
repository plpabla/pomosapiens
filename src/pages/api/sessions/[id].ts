// ended_at is client-snapshotted at phase transition and server-validated for plausibility.
// focus_rating and note are the only other writable columns. The row is writable only once (ended_at IS NULL guard).
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseJson } from "@/lib/parse-request";
import { endSessionSchema, type EndSessionPayload } from "@/lib/schemas/session";

export const prerender = false;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5_000;

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const parsed = await parseJson<EndSessionPayload>(context.request, endSessionSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { focus_rating, ended_at: endedAtIso, note } = parsed.data;
  const endedAtMs = new Date(endedAtIso).getTime();
  const nowMs = Date.now();

  if (endedAtMs > nowMs + CLOCK_SKEW_MS || endedAtMs < nowMs - TWO_HOURS_MS) {
    return Response.json({ error: "ended_at is outside the plausible range" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .update({ ended_at: endedAtIso, focus_rating, note })
    .eq("id", id)
    .eq("user_id", context.locals.user.id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Session already ended or not found" }, { status: 409 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
