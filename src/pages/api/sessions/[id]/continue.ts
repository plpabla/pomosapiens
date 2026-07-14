import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
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
    .update({ timer_mode: "count_up", planned_focus_seconds: null })
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
