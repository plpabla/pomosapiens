import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetchJson";
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
      fetchJson<{ topics: Topic[] }>("/api/topics", { fallbackError: "Failed to load topics" }),
      fetchJson<{ formats: MaterialFormat[] }>("/api/material-formats", {
        fallbackError: "Failed to load material formats",
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
