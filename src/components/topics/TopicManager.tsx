import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { useCrudResource } from "@/lib/resource/useCrudResource";
import { CatalogRow } from "@/components/resource/CatalogRow";
import { AddEntityDialog } from "@/components/resource/AddEntityDialog";
import { RenameDialog } from "@/components/resource/RenameDialog";
import { ArchivedSection } from "@/components/resource/ArchivedSection";
import type { Topic } from "@/lib/types";

export function TopicManager() {
  const {
    items: topics,
    loadError,
    actionError,
    add,
    rename,
    archive,
    unarchive,
  } = useCrudResource<Topic>({ endpoint: "/api/topics", listKey: "topics", entityNoun: "topic" });

  const active = topics.filter((t) => t.archived_at === null);
  const archived = topics.filter((t) => t.archived_at !== null);

  if (loadError) {
    return <ServerError message={loadError} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-off-white text-xl font-semibold">Topics</h2>
        <AddEntityDialog entityLabel="topic" onAdd={add} />
      </div>

      <ServerError message={actionError} />

      {active.length === 0 && archived.length === 0 ? (
        <div className="text-ash py-12 text-center">
          <p className="mb-1 text-lg font-medium">No topics yet</p>
          <p className="text-sm">Add your first topic to start categorizing your sessions.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((topic) => (
            <CatalogRow key={topic.id} name={topic.name}>
              <div className="flex gap-2">
                <RenameDialog
                  entityLabel="topic"
                  currentName={topic.name}
                  onRename={(name) => rename(topic.id, name)}
                />
                <Button variant="outline" size="sm" onClick={() => void archive(topic.id)}>
                  Archive
                </Button>
              </div>
            </CatalogRow>
          ))}
        </ul>
      )}

      <ArchivedSection items={archived} onUnarchive={unarchive} />
    </div>
  );
}
