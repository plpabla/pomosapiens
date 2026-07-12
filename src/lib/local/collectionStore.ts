// Versioned localStorage collection store, extending the useLastMode.ts pattern
// from scalar to array. Reads fail open (missing key, corrupt JSON, or version
// mismatch yield []); the snapshot is cached between notifications so
// useSyncExternalStore sees referentially stable results.

interface Envelope {
  v: number;
  items: unknown;
}

const EMPTY: readonly never[] = Object.freeze([]);

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === "object" && value !== null && "v" in value && "items" in value;
}

export interface CollectionStore<T> {
  getItems: () => readonly T[];
  setItems: (next: T[]) => void;
  subscribe: (callback: () => void) => () => void;
  getServerSnapshot: () => readonly T[];
}

export function createCollectionStore<T>({ key, version }: { key: string; version: number }): CollectionStore<T> {
  const listeners = new Set<() => void>();
  let cache: readonly T[] | null = null;

  function read(): readonly T[] {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return EMPTY;
      const parsed: unknown = JSON.parse(raw);
      if (!isEnvelope(parsed) || parsed.v !== version || !Array.isArray(parsed.items)) return EMPTY;
      return parsed.items as T[];
    } catch {
      return EMPTY;
    }
  }

  function notify() {
    cache = null;
    listeners.forEach((l) => {
      l();
    });
  }

  // Cross-tab refresh: bound at creation (not on first subscribe) so plain
  // reads like getItems() also see external writes. Guarded because stores are
  // created at module scope and the module is imported during SSR.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === key) notify();
    });
  }

  return {
    getItems() {
      cache ??= read();
      return cache;
    },
    setItems(next: T[]) {
      // Intentionally unguarded (unlike useLastMode.ts's fail-open persistMode): callers
      // (session start/end, topic creation) already surface a thrown write as error UI,
      // and failing open here would silently drop a session with no persisted record.
      localStorage.setItem(key, JSON.stringify({ v: version, items: next }));
      notify();
    },
    subscribe(callback: () => void) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    getServerSnapshot() {
      return EMPTY;
    },
  };
}
