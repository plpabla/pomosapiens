import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${context.url.origin}/api/auth/callback`,
    },
  });

  if (error || !data.url) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error?.message ?? "OAuth failed")}`);
  }

  return context.redirect(data.url);
};
