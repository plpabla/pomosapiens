import React, { useState } from "react";
import type { EnergyLevel, Mode, Preset } from "@/lib/types";
import type { SessionPersistence } from "@/lib/session/persistence";

interface Params {
  energy: EnergyLevel | null;
  topicId: string | null;
  materialFormatId: string | null;
  mode: Mode;
  presets: Preset[];
  persistence: SessionPersistence;
  onStarted: (result: { id: string; startedAtMs: number }) => void;
}

export function useSessionStart({ energy, topicId, materialFormatId, mode, presets, persistence, onStarted }: Params) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!energy || submitting) return;

    setSubmitting(true);
    setError(null);

    // Stage 1 audio prime: warm chime resource on the user-gesture tick before navigation
    const a = new Audio("/audio/chime.mp3");
    a.muted = true;
    void a
      .play()
      .then(() => {
        a.pause();
        a.muted = false;
      })
      .catch(() => {
        // audio priming failure is non-fatal
      });

    const selectedPreset = mode === "count_up" ? null : presets.find((p) => `preset_${p.slot}` === mode);

    try {
      const result = await persistence.createSession({
        energy_level: energy,
        topic_id: topicId ?? null,
        material_format_id: materialFormatId ?? null,
        timer_mode: mode,
        planned_focus_seconds: selectedPreset?.focus_seconds ?? null,
        planned_break_seconds: selectedPreset?.break_seconds ?? null,
      });
      onStarted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return { submitting, error, handleSubmit };
}
