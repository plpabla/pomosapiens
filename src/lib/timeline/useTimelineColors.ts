import { useSyncExternalStore } from "react";
import { validHex } from "@uiw/react-color";
import { createCollectionStore } from "@/lib/local/collectionStore";
import { defaultColorFor } from "@/lib/timeline/color";

interface StoredColor {
  categoryId: string;
  hex: string;
}

const store = createCollectionStore<StoredColor>({ key: "pomosapiens.timeline.colors", version: 1 });

export interface TimelineColors {
  getColor: (categoryId: string) => string;
  setColor: (categoryId: string, hex: string) => void;
}

/** Custom per-category colors persisted via `collectionStore` (versioned, SSR-safe, cross-tab, fail-open),
 * merged over `color.ts`'s deterministic defaults. */
export function useTimelineColors(): TimelineColors {
  const items = useSyncExternalStore(store.subscribe, store.getItems, store.getServerSnapshot);

  return {
    getColor(id: string) {
      const override = items.find((item) => item.categoryId === id);
      return override && validHex(override.hex) ? override.hex : defaultColorFor(id);
    },
    setColor(id: string, hex: string) {
      const next = items.filter((item) => item.categoryId !== id);
      next.push({ categoryId: id, hex });
      store.setItems(next);
    },
  };
}
