import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetchJson";
import { minutesFromSeconds, secondsFromMinutes } from "@/lib/time";
import type { Preset } from "@/lib/types";

export interface RowState {
  focusMin: string;
  breakMin: string;
  error: string | null;
  submitting: boolean;
}

export function toMin(seconds: number): string {
  return String(minutesFromSeconds(seconds));
}

export function usePresetEditor() {
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

    const focusSec = secondsFromMinutes(parseInt(row.focusMin, 10));
    const breakSec = secondsFromMinutes(parseInt(row.breakMin, 10));
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
      await fetchJson(`/api/user-presets/${preset.slot}`, {
        method: "PUT",
        body: { focus_seconds: focusSec, break_seconds: breakSec },
      });
      setPresets((prev) =>
        prev.map((p, i) => (i === index ? { ...p, focus_seconds: focusSec, break_seconds: breakSec } : p)),
      );
    } catch (e) {
      setRow(index, { error: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setRow(index, { submitting: false });
    }
  }

  return { presets, loadError, rows, setRow, handleSave };
}
