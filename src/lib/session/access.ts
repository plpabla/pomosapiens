// S-03 fold-forward: time-based abandon removed. Any non-ended session is in progress.

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: string;
}

type AccessResult = { kind: "redirect"; to: "/dashboard" } | { kind: "allow"; startedAtMs: number };

export function resolveSessionPageAccess({ row }: { row: SessionRow | null }): AccessResult {
  if (row === null) return { kind: "redirect", to: "/dashboard" };
  if (row.ended_at !== null) return { kind: "redirect", to: "/dashboard" };

  const startedAtMs = new Date(row.started_at).getTime();
  return { kind: "allow", startedAtMs };
}
