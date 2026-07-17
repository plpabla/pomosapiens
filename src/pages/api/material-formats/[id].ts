import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseJson } from "@/lib/parse-request";
import { updateMaterialFormatSchema } from "@/lib/schemas/material-format";
import type { TablesUpdate } from "@/db/database.types";

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
    return Response.json({ error: "Missing material format id" }, { status: 400 });
  }

  const parsed = await parseJson(context.request, updateMaterialFormatSchema);
  if (!parsed.data) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const update: TablesUpdate<"material_formats"> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.archived_at !== undefined) update.archived_at = parsed.data.archived_at;

  const { data, error } = await supabase
    .from("material_formats")
    .update(update)
    .eq("id", id)
    .eq("owner_id", context.locals.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "A format with that name already exists" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Material format not found" }, { status: 409 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
