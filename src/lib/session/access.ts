// TODO(S-05): the 2*focusPresetSeconds boundary will be removed by roadmap S-05 (explicit abandon).
// Tests pin current 50-min behavior as a regression target until S-05 ships.

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  energy_level: string;
}

type AccessResult = { kind: "redirect"; to: "/dashboard" } | { kind: "allow"; startedAtMs: number };

export function resolveSessionPageAccess({
  row,
  nowMs,
  focusPresetSeconds,
}: {
  row: SessionRow | null;
  nowMs: number;
  focusPresetSeconds: number;
}): AccessResult {
  if (row === null) return { kind: "redirect", to: "/dashboard" };
  if (row.ended_at !== null) return { kind: "redirect", to: "/dashboard" };

  const startedAtMs = new Date(row.started_at).getTime();
  if (nowMs - startedAtMs > 2 * focusPresetSeconds * 1000) {
    return { kind: "redirect", to: "/dashboard" };
  }

  return { kind: "allow", startedAtMs };
}
