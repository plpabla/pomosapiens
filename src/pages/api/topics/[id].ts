import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseJson } from "@/lib/parse-request";
import { updateTopicSchema } from "@/lib/schemas/topic";

export const prerender = false;

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
    return Response.json({ error: "Missing topic id" }, { status: 400 });
  }

  const parsed = await parseJson(context.request, updateTopicSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.archived_at !== undefined) update.archived_at = parsed.data.archived_at;

  const { data, error } = await supabase
    .from("topics")
    .update(update)
    .eq("id", id)
    .eq("owner_id", context.locals.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "A topic with that name already exists" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Topic not found" }, { status: 409 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
