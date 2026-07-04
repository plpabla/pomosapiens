import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServerError } from "@/components/auth/ServerError";

interface Preset {
  slot: 1 | 2 | 3;
  focus_seconds: number;
  break_seconds: number;
}

interface RowState {
  focusMin: string;
  breakMin: string;
  error: string | null;
  submitting: boolean;
}

function toMin(seconds: number): string {
  return String(Math.round(seconds / 60));
}

export default function PresetManager() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);

  useEffect(() => {
    fetch("/api/user-presets")
      .then((r) => r.json())
      .then((d: { presets?: Preset[]; error?: string }) => {
        if (d.error) {
          setLoadError(d.error);
        } else {
          const p = d.presets ?? [];
          setPresets(p);
          setRows(
            p.map((preset) => ({
              focusMin: toMin(preset.focus_seconds),
              breakMin: toMin(preset.break_seconds),
              error: null,
              submitting: false,
            })),
          );
        }
      })
      .catch(() => {
        setLoadError("Failed to load presets");
      });
  }, []);

  function setRow(index: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSave(index: number) {
    const row = rows[index] as RowState | undefined;
    const preset = presets[index] as Preset | undefined;
    if (row === undefined || preset === undefined) return;

    const focusSec = parseInt(row.focusMin, 10) * 60;
    const breakSec = parseInt(row.breakMin, 10) * 60;
    if (Number.isNaN(focusSec) || focusSec < 60 || focusSec > 4 * 60 * 60) {
      setRow(index, { error: "Focus must be between 1 and 240 minutes." });
      return;
    }
    if (Number.isNaN(breakSec) || breakSec < 0 || breakSec > 60 * 60) {
      setRow(index, { error: "Break must be between 0 and 60 minutes." });
      return;
    }

    setRow(index, { submitting: true, error: null });
    try {
      const res = await fetch(`/api/user-presets/${preset.slot}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus_seconds: focusSec, break_seconds: breakSec }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setPresets((prev) =>
        prev.map((p, i) => (i === index ? { ...p, focus_seconds: focusSec, break_seconds: breakSec } : p)),
      );
    } catch (e) {
      setRow(index, { error: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setRow(index, { submitting: false });
    }
  }

  if (loadError) return <ServerError message={loadError} />;

  return (
    <div className="space-y-4">
      {presets.map((preset, i) => {
        const row = rows[i];
        const unchanged = row.focusMin === toMin(preset.focus_seconds) && row.breakMin === toMin(preset.break_seconds);

        return (
          <div key={preset.slot} className="border-charred bg-ember/20 space-y-3 rounded-lg border px-4 py-3">
            <h3 className="text-off-white font-semibold">Preset {preset.slot}</h3>
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor={`focus-${preset.slot}`}>Focus (min)</Label>
                <Input
                  id={`focus-${preset.slot}`}
                  type="number"
                  min={1}
                  max={240}
                  value={row.focusMin}
                  onChange={(e) => {
                    setRow(i, { focusMin: e.target.value });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`break-${preset.slot}`}>Break (min)</Label>
                <Input
                  id={`break-${preset.slot}`}
                  type="number"
                  min={0}
                  max={60}
                  value={row.breakMin}
                  onChange={(e) => {
                    setRow(i, { breakMin: e.target.value });
                  }}
                />
              </div>
              <Button disabled={unchanged || row.submitting} onClick={() => void handleSave(i)}>
                {row.submitting ? "Saving..." : "Save"}
              </Button>
            </div>
            <ServerError message={row.error} />
          </div>
        );
      })}
    </div>
  );
}
