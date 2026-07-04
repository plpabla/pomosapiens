import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseJson } from "@/lib/parse-request";
import { putUserPresetSchema } from "@/lib/schemas/user-preset";

export const prerender = false;

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slotParam = context.params.slot;
  if (slotParam !== "1" && slotParam !== "2" && slotParam !== "3") {
    return Response.json({ error: "slot must be 1, 2, or 3" }, { status: 400 });
  }
  const slot = Number(slotParam) as 1 | 2 | 3;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const parsed = await parseJson(context.request, putUserPresetSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_presets")
    .upsert(
      {
        user_id: context.locals.user.id,
        slot,
        focus_seconds: parsed.data.focus_seconds,
        break_seconds: parsed.data.break_seconds,
      },
      { onConflict: "user_id,slot" },
    )
    .select("slot, focus_seconds, break_seconds")
    .single();

  if (error) {
    if (error.code === "23514") {
      return Response.json({ error: "Value out of allowed range" }, { status: 400 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 200 });
};
