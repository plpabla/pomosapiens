import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import ModePicker from "@/components/session/ModePicker";
import EnergyLevelPicker from "@/components/session/EnergyLevelPicker";
import { TopicSelect, MaterialFormatSelect } from "@/components/session/CatalogSelects";
import type { EnergyLevel, MaterialFormat, Mode, Preset, Topic } from "@/lib/types";

interface Props {
  presets: Preset[];
  topics: Topic[];
  formats: MaterialFormat[];
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  energy: EnergyLevel | null;
  onEnergyChange: (value: EnergyLevel) => void;
  topicId: string | null;
  onTopicChange: (value: string | null) => void;
  materialFormatId: string | null;
  onFormatChange: (value: string | null) => void;
  loadError: string | null;
  submitError: string | null;
  submitting: boolean;
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
  topicSlot?: ReactNode;
}

export default function SessionStartForm({
  presets,
  topics,
  formats,
  mode,
  onModeChange,
  energy,
  onEnergyChange,
  topicId,
  onTopicChange,
  materialFormatId,
  onFormatChange,
  loadError,
  submitError,
  submitting,
  onSubmit,
  topicSlot,
}: Props) {
  return (
    <div className="mx-auto max-w-sm pt-16 text-center">
      <h1 className="text-off-white mb-8 text-2xl font-bold">Choose your energy level</h1>
      <form onSubmit={onSubmit}>
        <EnergyLevelPicker value={energy} onChange={onEnergyChange} />

        {loadError && <ServerError message={loadError} />}
        <div className="mb-4 flex flex-col gap-3 text-left">
          <TopicSelect value={topicId} onChange={onTopicChange} topics={topics} />
          {topicSlot}
          <MaterialFormatSelect value={materialFormatId} onChange={onFormatChange} formats={formats} />
        </div>

        <ModePicker presets={presets} value={mode} onChange={onModeChange} />

        <ServerError message={submitError} />
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
