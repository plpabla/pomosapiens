import { useEffect, useState } from "react";
import type { Topic, MaterialFormat } from "@/lib/types";

export function useTopicsAndFormats(options?: { enabled?: boolean }): {
  topics: Topic[];
  formats: MaterialFormat[];
  loadError: string | null;
} {
  const enabled = options?.enabled ?? true;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [formats, setFormats] = useState<MaterialFormat[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    void Promise.all([
      fetch("/api/topics").then((r) => {
        if (!r.ok) throw new Error("Failed to load topics");
        return r.json() as Promise<{ topics: Topic[] }>;
      }),
      fetch("/api/material-formats").then((r) => {
        if (!r.ok) throw new Error("Failed to load material formats");
        return r.json() as Promise<{ formats: MaterialFormat[] }>;
      }),
    ])
      .then(([topicsData, formatsData]) => {
        setTopics(topicsData.topics.filter((t) => t.archived_at === null));
        setFormats(formatsData.formats.filter((f) => f.archived_at === null));
        setLoadError(null);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError("Could not load topics and formats.");
      });
  }, [enabled, loaded]);

  return { topics, formats, loadError };
}
