import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CatalogRow } from "@/components/resource/CatalogRow";

interface Item {
  id: string;
  name: string;
}

interface Props<T extends Item> {
  items: T[];
  onUnarchive: (id: string) => Promise<void>;
}

export function ArchivedSection<T extends Item>({ items, onUnarchive }: Props<T>) {
  const [showArchived, setShowArchived] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        className="text-ash hover:text-off-white text-sm transition-colors"
        onClick={() => {
          setShowArchived((v) => !v);
        }}
      >
        {showArchived ? "Hide" : "Show"} archived ({items.length})
      </button>
      {showArchived && (
        <ul className="space-y-2">
          {items.map((item) => (
            <CatalogRow key={item.id} name={item.name} archived>
              <Button variant="outline" size="sm" onClick={() => void onUnarchive(item.id)}>
                Unarchive
              </Button>
            </CatalogRow>
          ))}
        </ul>
      )}
    </div>
  );
}
