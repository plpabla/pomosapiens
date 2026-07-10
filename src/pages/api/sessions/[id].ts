// ended_at is client-snapshotted at phase transition and server-validated for plausibility.
// focus_rating and note are the only other writable columns. The row is writable only once (ended_at IS NULL guard).
// PUT edits an already-ended row: it recomputes ended_at from an edited duration_seconds (started_at
// held fixed) and has no plausibility window or write-once guard -- those belong to PATCH only.
// DELETE removes the caller's own session row outright, any status (fully-open abandon flow, no ended_at scoping).
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseJson } from "@/lib/parse-request";
import {
  endSessionSchema,
  editSessionSchema,
  type EndSessionPayload,
  type EditSessionPayload,
} from "@/lib/schemas/session";

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

export const PUT: APIRoute = async (context) => {
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

  const parsed = await parseJson<EditSessionPayload>(context.request, editSessionSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { duration_seconds, energy_level, topic_id, material_format_id, focus_rating, note } = parsed.data;

  const { data: existing, error: selectError } = await supabase
    .from("sessions")
    .select("started_at")
    .eq("id", id)
    .eq("user_id", context.locals.user.id)
    .not("ended_at", "is", null)
    .maybeSingle();

  if (selectError) {
    return Response.json({ error: selectError.message }, { status: 500 });
  }

  if (!existing) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const endedAtIso = new Date(new Date(existing.started_at).getTime() + duration_seconds * 1000).toISOString();

  const { data, error } = await supabase
    .from("sessions")
    .update({
      ended_at: endedAtIso,
      energy_level,
      topic_id,
      material_format_id,
      focus_rating,
      note,
    })
    .eq("id", id)
    .eq("user_id", context.locals.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({ ok: true }, { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
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

  const { data, error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", context.locals.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
