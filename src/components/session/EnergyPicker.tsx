import { useEffect, useState } from "react";
import SessionStartForm from "@/components/session/SessionStartForm";
import { useTopicsAndFormats } from "@/lib/session/useCatalog";
import { useLastMode } from "@/lib/session/useLastMode";
import { useSessionStart } from "@/lib/session/useSessionStart";
import { remotePersistence } from "@/lib/session/persistence";
import { DEFAULT_PRESETS } from "@/lib/timer/preset-defaults";
import type { EnergyLevel, Preset } from "@/lib/types";

export default function EnergyPicker() {
  const [energy, setEnergy] = useState<EnergyLevel | null>("medium");
  const [presets, setPresets] = useState<Preset[]>([...DEFAULT_PRESETS]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [materialFormatId, setMaterialFormatId] = useState<string | null>(null);
  const [presetsLoadError, setPresetsLoadError] = useState<string | null>(null);

  const { topics, formats, loadError: catalogLoadError } = useTopicsAndFormats();
  const loadError = catalogLoadError ?? presetsLoadError;

  const [mode, persistMode] = useLastMode();

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
    topicId,
    materialFormatId,
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
      onModeChange={persistMode}
      energy={energy}
      onEnergyChange={setEnergy}
      topicId={topicId}
      onTopicChange={setTopicId}
      materialFormatId={materialFormatId}
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
