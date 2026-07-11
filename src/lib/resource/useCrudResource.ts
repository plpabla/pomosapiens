import { useState, useEffect } from "react";
import { fetchJson } from "@/lib/api/fetchJson";

interface CrudItem {
  id: string;
  name: string;
  archived_at: string | null;
}

interface UseCrudResourceOptions {
  endpoint: string;
  listKey: string;
  entityNoun: string;
}

export function useCrudResource<T extends CrudItem>({ endpoint, listKey, entityNoun }: UseCrudResourceOptions) {
  const [items, setItems] = useState<T[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetch(endpoint)
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => {
        const error = d.error as string | undefined;
        if (error) {
          setLoadError(error);
        } else {
          setItems((d[listKey] as T[] | undefined) ?? []);
        }
      })
      .catch(() => {
        setLoadError(`Failed to load ${entityNoun}s`);
      });
  }, [endpoint, listKey, entityNoun]);

  async function add(name: string): Promise<T> {
    const data = await fetchJson<T>(endpoint, { method: "POST", body: { name } });
    setItems((prev) => [...prev, data]);
    return data;
  }

  async function rename(id: string, name: string): Promise<void> {
    const prev = items;
    setItems((its) => its.map((it) => (it.id === id ? { ...it, name: name.trim() } : it)));
    try {
      await fetchJson(`${endpoint}/${id}`, { method: "PATCH", body: { name } });
    } catch (e) {
      setItems(prev);
      throw e;
    }
  }

  async function archive(id: string): Promise<void> {
    setActionError(null);
    const prev = items;
    const archivedAt = new Date().toISOString();
    setItems((its) => its.map((it) => (it.id === id ? { ...it, archived_at: archivedAt } : it)));
    try {
      await fetchJson(`${endpoint}/${id}`, { method: "PATCH", body: { archived_at: archivedAt } });
    } catch (e) {
      setItems(prev);
      setActionError(e instanceof Error ? e.message : `Failed to archive ${entityNoun}`);
    }
  }

  async function unarchive(id: string): Promise<void> {
    setActionError(null);
    const prev = items;
    setItems((its) => its.map((it) => (it.id === id ? { ...it, archived_at: null } : it)));
    try {
      await fetchJson(`${endpoint}/${id}`, { method: "PATCH", body: { archived_at: null } });
    } catch (e) {
      setItems(prev);
      setActionError(e instanceof Error ? e.message : `Failed to unarchive ${entityNoun}`);
    }
  }

  return { items, loadError, actionError, add, rename, archive, unarchive };
}
