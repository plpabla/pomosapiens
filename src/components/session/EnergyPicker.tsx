import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import ModePicker from "@/components/session/ModePicker";
import EnergyLevelPicker from "@/components/session/EnergyLevelPicker";
import { TopicSelect, MaterialFormatSelect } from "@/components/session/CatalogSelects";
import { useTopicsAndFormats } from "@/lib/session/useCatalog";
import { useLastMode } from "@/lib/session/useLastMode";
import { useSessionStart } from "@/lib/session/useSessionStart";
import type { EnergyLevel, Preset } from "@/lib/types";

const DEFAULT_PRESETS: Preset[] = [
  { slot: 1, focus_seconds: 25 * 60, break_seconds: 5 * 60 },
  { slot: 2, focus_seconds: 45 * 60, break_seconds: 10 * 60 },
  { slot: 3, focus_seconds: 90 * 60, break_seconds: 15 * 60 },
];

export default function EnergyPicker() {
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
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

  const { submitting, error, handleSubmit } = useSessionStart({ energy, topicId, materialFormatId, mode, presets });

  return (
    <div className="mx-auto max-w-sm pt-16 text-center">
      <h1 className="text-off-white mb-8 text-2xl font-bold">Choose your energy level</h1>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <ModePicker presets={presets} value={mode} onChange={persistMode} />

        <EnergyLevelPicker value={energy} onChange={setEnergy} />

        {loadError && <ServerError message={loadError} />}
        <div className="mb-4 flex flex-col gap-3 text-left">
          <TopicSelect value={topicId} onChange={setTopicId} topics={topics} />
          <MaterialFormatSelect value={materialFormatId} onChange={setMaterialFormatId} formats={formats} />
        </div>

        <ServerError message={error} />
        <Button
          type="submit"
          disabled={energy === null || submitting}
          className="bg-blaze hover:bg-spark text-off-white mt-4 w-full"
        >
          {submitting ? "Starting..." : "Start"}
        </Button>
      </form>
    </div>
  );
}
