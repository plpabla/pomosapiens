import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/db/database.types";

export const PATCH: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const body = (await context.request.json()) as Database["public"]["Tables"]["sessions"]["Update"];

  const { data, error } = await supabase.from("sessions").update(body).eq("id", id).select("id").maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, data }, { status: 200 });
};
