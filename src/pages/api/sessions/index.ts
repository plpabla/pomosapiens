import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseJson } from "@/lib/parse-request";
import { createSessionSchema } from "@/lib/schemas/session";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const parsed = await parseJson(context.request, createSessionSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: context.locals.user.id,
      energy_level: parsed.data.energy_level,
      started_at: new Date().toISOString(),
    })
    .select("id, started_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ id: data.id, started_at: data.started_at }, { status: 201 });
};
