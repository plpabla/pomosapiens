import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { DEFAULT_PRESETS } from "@/lib/timer/preset-defaults";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("user_presets")
    .select("slot, focus_seconds, break_seconds")
    .order("slot");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data as { slot: 1 | 2 | 3; focus_seconds: number; break_seconds: number }[];

  const presets = DEFAULT_PRESETS.map((def) => {
    const row = rows.find((r) => r.slot === def.slot);
    return row ?? def;
  });

  return Response.json({ presets }, { status: 200 });
};
