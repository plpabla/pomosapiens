import React, { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServerError } from "@/components/auth/ServerError";
import ModePicker from "@/components/session/ModePicker";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/api/fetchJson";

type EnergyLevel = "low" | "medium" | "high";
type Mode = "preset_1" | "preset_2" | "preset_3" | "count_up";

const LAST_MODE_KEY = "pomosapiens.last_mode";

// useSyncExternalStore store for last-used mode.
// Reading from localStorage with useSyncExternalStore + getServerSnapshot avoids the
// SSR/client hydration mismatch that a useState lazy-initializer would cause
// (server has no window, so it always sees "preset_1"; naive client reads can diverge).
const modeListeners = new Set<() => void>();
function subscribeMode(callback: () => void) {
  modeListeners.add(callback);
  return () => {
    modeListeners.delete(callback);
  };
}
function getModeSnapshot(): Mode {
  try {
    return (localStorage.getItem(LAST_MODE_KEY) as Mode | null) ?? "preset_1";
  } catch {
    return "preset_1";
  }
}
function getModeServerSnapshot(): Mode {
  return "preset_1";
}
function persistMode(mode: Mode) {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    // fail open: localStorage unavailable (private mode, partitioned storage, etc.)
  }
  modeListeners.forEach((l) => {
    l();
  });
}

const LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const NONE = "__none__";

interface Topic {
  id: string;
  name: string;
  archived_at: string | null;
}

interface MaterialFormat {
  id: string;
  name: string;
  owner_id: string | null;
  archived_at: string | null;
}

interface Preset {
  slot: 1 | 2 | 3;
  focus_seconds: number;
  break_seconds: number;
}

const DEFAULT_PRESETS: Preset[] = [
  { slot: 1, focus_seconds: 25 * 60, break_seconds: 5 * 60 },
  { slot: 2, focus_seconds: 45 * 60, break_seconds: 10 * 60 },
  { slot: 3, focus_seconds: 90 * 60, break_seconds: 15 * 60 },
];

export default function EnergyPicker() {
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [formats, setFormats] = useState<MaterialFormat[]>([]);
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [materialFormatId, setMaterialFormatId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const mode = useSyncExternalStore(subscribeMode, getModeSnapshot, getModeServerSnapshot);

  useEffect(() => {
    void Promise.all([
      fetch("/api/topics").then((r) => {
        if (!r.ok) throw new Error("Failed to load topics");
        return r.json() as Promise<{ topics: Topic[] }>;
      }),
      fetch("/api/material-formats").then((r) => {
        if (!r.ok) throw new Error("Failed to load material formats");
        return r.json() as Promise<{ formats: MaterialFormat[] }>;
      }),
      fetch("/api/user-presets").then((r) => {
        if (!r.ok) throw new Error("Failed to load presets");
        return r.json() as Promise<{ presets: Preset[] }>;
      }),
    ])
      .then(([topicsData, formatsData, presetsData]) => {
        setTopics(topicsData.topics.filter((t) => t.archived_at === null));
        setFormats(formatsData.formats.filter((f) => f.archived_at === null));
        setPresets(presetsData.presets);
      })
      .catch(() => {
        setLoadError("Could not load topics and formats.");
      });
  }, []);

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
      const data = await fetchJson<{ id: string }>("/api/sessions", {
        method: "POST",
        body: {
          energy_level: energy,
          topic_id: topicId ?? null,
          material_format_id: materialFormatId ?? null,
          timer_mode: mode,
          planned_focus_seconds: selectedPreset?.focus_seconds ?? null,
          planned_break_seconds: selectedPreset?.break_seconds ?? null,
        },
        fallbackError: "Failed to start session",
      });
      window.location.assign("/session/" + data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const triggerClass = "w-full border-charred bg-ember text-off-white hover:bg-ember focus:ring-0";

  return (
    <div className="mx-auto max-w-sm pt-16 text-center">
      <h1 className="text-off-white mb-8 text-2xl font-bold">Choose your energy level</h1>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <ModePicker presets={presets} value={mode} onChange={persistMode} />

        <div className="mb-6 flex justify-center gap-4">
          {LEVELS.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              aria-pressed={energy === value}
              onClick={() => {
                setEnergy(value);
              }}
              className={cn(
                "border px-6",
                energy === value ? "bg-blaze text-off-white border-blaze" : "bg-ember text-off-white border-charred",
              )}
            >
              {label}
            </Button>
          ))}
        </div>

        {loadError && <ServerError message={loadError} />}
        <div className="mb-4 flex flex-col gap-3 text-left">
          <Select
            value={topicId ?? NONE}
            onValueChange={(v) => {
              setTopicId(v === NONE ? null : v);
            }}
          >
            <SelectTrigger aria-label="Topic" className={triggerClass}>
              <SelectValue placeholder="No topic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No topic</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={materialFormatId ?? NONE}
            onValueChange={(v) => {
              setMaterialFormatId(v === NONE ? null : v);
            }}
          >
            <SelectTrigger aria-label="Material format" className={triggerClass}>
              <SelectValue placeholder="No format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No format</SelectItem>
              {formats.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
