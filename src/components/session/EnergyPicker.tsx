import { useEffect, useState } from "react";
import SessionStartForm from "@/components/session/SessionStartForm";
import { useTopicsAndFormats } from "@/lib/session/useCatalog";
import { useLastMode } from "@/lib/session/useLastMode";
import { useSessionStart } from "@/lib/session/useSessionStart";
import { remotePersistence } from "@/lib/session/persistence";
import { DEFAULT_PRESETS } from "@/lib/timer/preset-defaults";
import type { EnergyLevel, Mode, Preset } from "@/lib/types";

function isEnergyLevel(value: string | undefined): value is EnergyLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isMode(value: string | undefined): value is Mode {
  return value === "preset_1" || value === "preset_2" || value === "preset_3" || value === "count_up";
}

interface Props {
  initialEnergy?: string;
  initialTopicId?: string;
  initialFormatId?: string;
  initialMode?: string;
}

export default function EnergyPicker({ initialEnergy, initialTopicId, initialFormatId, initialMode }: Props) {
  const [energy, setEnergy] = useState<EnergyLevel | null>(isEnergyLevel(initialEnergy) ? initialEnergy : "medium");
  const [presets, setPresets] = useState<Preset[]>([...DEFAULT_PRESETS]);
  const [topicId, setTopicId] = useState<string | null>(initialTopicId ?? null);
  const [materialFormatId, setMaterialFormatId] = useState<string | null>(initialFormatId ?? null);
  const [presetsLoadError, setPresetsLoadError] = useState<string | null>(null);

  const { topics, formats, loaded: catalogLoaded, loadError: catalogLoadError } = useTopicsAndFormats();
  const loadError = catalogLoadError ?? presetsLoadError;

  const [lastMode, persistMode] = useLastMode();
  const [modeOverride, setModeOverride] = useState<Mode | null>(isMode(initialMode) ? initialMode : null);
  const mode = modeOverride ?? lastMode;

  function handleModeChange(next: Mode) {
    setModeOverride(next);
    persistMode(next);
  }

  // Stale topic/format ids from the URL (e.g. a deleted topic) silently fall back to "none"
  // once the catalog has resolved -- not before, or a legitimately-still-loading id gets wiped.
  const resolvedTopicId = catalogLoaded && topicId !== null && !topics.some((t) => t.id === topicId) ? null : topicId;
  const resolvedFormatId =
    catalogLoaded && materialFormatId !== null && !formats.some((f) => f.id === materialFormatId)
      ? null
      : materialFormatId;

  useEffect(() => {
    void fetch("/api/user-presets")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load presets");
        return r.json() as Promise<{ presets: Preset[] }>;
      })
      .then((presetsData) => {
        setPresets(presetsData.presets);
      })
      .catch(() => {
        setPresetsLoadError("Could not load topics and formats.");
      });
  }, []);

  const { submitting, error, handleSubmit } = useSessionStart({
    energy,
    topicId: resolvedTopicId,
    materialFormatId: resolvedFormatId,
    mode,
    presets,
    persistence: remotePersistence,
    onStarted: (result) => {
      window.location.assign("/session/" + result.id);
    },
  });

  return (
    <SessionStartForm
      presets={presets}
      topics={topics}
      formats={formats}
      mode={mode}
      onModeChange={handleModeChange}
      energy={energy}
      onEnergyChange={setEnergy}
      topicId={resolvedTopicId}
      onTopicChange={setTopicId}
      materialFormatId={resolvedFormatId}
      onFormatChange={setMaterialFormatId}
      loadError={loadError}
      submitError={error}
      submitting={submitting}
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
    />
  );
}
