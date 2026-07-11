import { useSyncExternalStore } from "react";
import type { Topic } from "@/lib/types";
import { createTopicSchema } from "@/lib/schemas/topic";
import { createCollectionStore } from "@/lib/local/collectionStore";

// Anon mirror of the `topics` table, empty by default. Name-unique creation
// mirrors the server's UNIQUE(owner_id, name) constraint.
export const LOCAL_TOPICS_KEY = "pomosapiens.local.topics";

const store = createCollectionStore<Topic>({ key: LOCAL_TOPICS_KEY, version: 1 });

export function createLocalTopic(name: string): Topic {
  const parsed = createTopicSchema.parse({ name });
  const existing = store.getItems();
  if (existing.some((t) => t.name === parsed.name)) {
    throw new Error("A topic with this name already exists");
  }
  const topic: Topic = { id: crypto.randomUUID(), name: parsed.name, archived_at: null };
  store.setItems([...existing, topic]);
  return topic;
}

export function useLocalTopics(): readonly Topic[] {
  return useSyncExternalStore(store.subscribe, store.getItems, store.getServerSnapshot);
}
