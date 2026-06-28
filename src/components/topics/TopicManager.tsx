import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ServerError } from "@/components/auth/ServerError";

interface Topic {
  id: string;
  name: string;
  archived_at: string | null;
}

async function apiFetch(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function TopicManager() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d: { topics?: Topic[]; error?: string }) => {
        if (d.error) {
          setLoadError(d.error);
        } else {
          setTopics(d.topics ?? []);
        }
      })
      .catch(() => {
        setLoadError("Failed to load topics");
      });
  }, []);

  const active = topics.filter((t) => t.archived_at === null);
  const archived = topics.filter((t) => t.archived_at !== null);

  async function handleAdd() {
    setAddError(null);
    setAddSubmitting(true);
    try {
      const data = (await apiFetch("/api/topics", "POST", { name: addName })) as {
        id: string;
        name: string;
        archived_at: null;
      };
      setTopics((prev) => [...prev, { id: data.id, name: data.name, archived_at: null }]);
      setAddOpen(false);
      setAddName("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add topic");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleRename() {
    if (!renameId) return;
    setRenameError(null);
    setRenameSubmitting(true);
    const prev = topics;
    setTopics((ts) => ts.map((t) => (t.id === renameId ? { ...t, name: renameName } : t)));
    try {
      await apiFetch(`/api/topics/${renameId}`, "PATCH", { name: renameName });
      setRenameId(null);
      setRenameName("");
    } catch (e) {
      setTopics(prev);
      setRenameError(e instanceof Error ? e.message : "Failed to rename topic");
    } finally {
      setRenameSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    setActionError(null);
    const prev = topics;
    const archivedAt = new Date().toISOString();
    setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, archived_at: archivedAt } : t)));
    try {
      await apiFetch(`/api/topics/${id}`, "PATCH", { archived_at: archivedAt });
    } catch (e) {
      setTopics(prev);
      setActionError(e instanceof Error ? e.message : "Failed to archive topic");
    }
  }

  async function handleUnarchive(id: string) {
    setActionError(null);
    const prev = topics;
    setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, archived_at: null } : t)));
    try {
      await apiFetch(`/api/topics/${id}`, "PATCH", { archived_at: null });
    } catch (e) {
      setTopics(prev);
      setActionError(e instanceof Error ? e.message : "Failed to unarchive topic");
    }
  }

  if (loadError) {
    return <ServerError message={loadError} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-off-white text-xl font-semibold">Topics</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setAddName("");
                setAddError(null);
              }}
            >
              Add topic
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add topic</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="add-topic-name">Name</Label>
              <Input
                id="add-topic-name"
                value={addName}
                onChange={(e) => {
                  setAddName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                maxLength={100}
                autoFocus
              />
              <ServerError message={addError} />
            </div>
            <DialogFooter>
              <Button onClick={() => void handleAdd()} disabled={addSubmitting || addName.trim().length === 0}>
                {addSubmitting ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            <li
              key={topic.id}
              className="border-charred bg-ember/20 flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <span className="text-off-white">{topic.name}</span>
              <div className="flex gap-2">
                <Dialog
                  open={renameId === topic.id}
                  onOpenChange={(open) => {
                    if (open) {
                      setRenameId(topic.id);
                      setRenameName(topic.name);
                      setRenameError(null);
                    } else setRenameId(null);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Rename
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Rename topic</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="rename-topic-name">Name</Label>
                      <Input
                        id="rename-topic-name"
                        value={renameName}
                        onChange={(e) => {
                          setRenameName(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename();
                        }}
                        maxLength={100}
                        autoFocus
                      />
                      <ServerError message={renameError} />
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => void handleRename()}
                        disabled={renameSubmitting || renameName.trim().length === 0}
                      >
                        {renameSubmitting ? "Saving..." : "Save"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" size="sm" onClick={() => void handleArchive(topic.id)}>
                  Archive
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <button
            className="text-ash hover:text-off-white text-sm transition-colors"
            onClick={() => {
              setShowArchived((v) => !v);
            }}
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="space-y-2">
              {archived.map((topic) => (
                <li
                  key={topic.id}
                  className="border-charred bg-ember/10 flex items-center justify-between rounded-lg border px-4 py-3 opacity-60"
                >
                  <span className="text-ash line-through">{topic.name}</span>
                  <Button variant="outline" size="sm" onClick={() => void handleUnarchive(topic.id)}>
                    Unarchive
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Rename dialog is rendered outside the list to avoid stale closure issues */}
      <Dialog
        open={renameId !== null && !active.find((t) => t.id === renameId)}
        onOpenChange={() => {
          setRenameId(null);
        }}
      >
        <DialogContent>{/* placeholder; per-row dialogs above handle it */}</DialogContent>
      </Dialog>
    </div>
  );
}
