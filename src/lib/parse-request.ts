import type { ZodType } from "zod";

export type ParseResult<T> = { data: T; error: null } | { data: null; error: string };

function formatIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const first = error.issues[0];
  const field = first.path.join(".") || "input";
  return `${field}: ${first.message}`;
}

export async function parseFormData<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  const form = await request.formData();
  const raw = Object.fromEntries(form.entries());
  const result = schema.safeParse(raw);

  if (!result.success) {
    return { data: null, error: formatIssue(result.error) };
  }

  return { data: result.data, error: null };
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, error: "Invalid JSON body" };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { data: null, error: formatIssue(result.error) };
  }

  return { data: result.data, error: null };
}
