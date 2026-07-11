import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { useCrudResource } from "@/lib/resource/useCrudResource";
import { CatalogRow } from "@/components/resource/CatalogRow";
import { AddEntityDialog } from "@/components/resource/AddEntityDialog";
import { RenameDialog } from "@/components/resource/RenameDialog";
import { ArchivedSection } from "@/components/resource/ArchivedSection";
import type { MaterialFormat } from "@/lib/types";

export function MaterialFormatManager() {
  const {
    items: formats,
    loadError,
    actionError,
    add,
    rename,
    archive,
    unarchive,
  } = useCrudResource<MaterialFormat>({
    endpoint: "/api/material-formats",
    listKey: "formats",
    entityNoun: "format",
  });

  const seeded = formats.filter((f) => f.owner_id === null);
  const owned = formats.filter((f) => f.owner_id !== null && f.archived_at === null);
  const archived = formats.filter((f) => f.owner_id !== null && f.archived_at !== null);

  if (loadError) {
    return <ServerError message={loadError} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-off-white text-xl font-semibold">Formats</h2>
        <AddEntityDialog entityLabel="format" onAdd={add} />
      </div>

      <ServerError message={actionError} />

      <div className="space-y-4">
        <div>
          <h3 className="text-ash mb-2 text-sm font-medium tracking-wide uppercase">Built-in</h3>
          <ul className="space-y-2">
            {seeded.map((fmt) => (
              <CatalogRow key={fmt.id} name={fmt.name}>
                <span className="text-ash rounded bg-white/10 px-2 py-0.5 text-xs">Built-in</span>
              </CatalogRow>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-ash mb-2 text-sm font-medium tracking-wide uppercase">Yours</h3>
          {owned.length === 0 ? (
            <p className="text-ash text-sm">
              Most users stick with the built-ins. Add a custom format if none of them fit.
            </p>
          ) : (
            <ul className="space-y-2">
              {owned.map((fmt) => (
                <CatalogRow key={fmt.id} name={fmt.name}>
                  <div className="flex gap-2">
                    <RenameDialog
                      entityLabel="format"
                      currentName={fmt.name}
                      onRename={(name) => rename(fmt.id, name)}
                    />
                    <Button variant="outline" size="sm" onClick={() => void archive(fmt.id)}>
                      Archive
                    </Button>
                  </div>
                </CatalogRow>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ArchivedSection items={archived} onUnarchive={unarchive} />
    </div>
  );
}
