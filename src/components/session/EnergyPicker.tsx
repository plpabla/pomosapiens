import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";

type EnergyLevel = "low" | "medium" | "high";

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

export default function EnergyPicker() {
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [formats, setFormats] = useState<MaterialFormat[]>([]);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [materialFormatId, setMaterialFormatId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/topics").then((r) => r.json() as Promise<{ topics: Topic[] }>),
      fetch("/api/material-formats").then((r) => r.json() as Promise<{ formats: MaterialFormat[] }>),
    ])
      .then(([topicsData, formatsData]) => {
        setTopics(topicsData.topics.filter((t) => t.archived_at === null));
        setFormats(formatsData.formats.filter((f) => f.archived_at === null));
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

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          energy_level: energy,
          topic_id: topicId ?? null,
          material_format_id: materialFormatId ?? null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to start session");
      }

      const data = (await res.json()) as { id: string };
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
