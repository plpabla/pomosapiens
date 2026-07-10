export async function fetchJson<T>(
  url: string,
  init?: { method?: string; body?: unknown; fallbackError?: string },
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method,
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? init?.fallbackError ?? "Request failed");
  }

  return (await res.json()) as T;
}
