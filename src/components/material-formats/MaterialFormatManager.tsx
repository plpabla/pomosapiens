import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ServerError } from "@/components/auth/ServerError";

interface MaterialFormat {
  id: string;
  name: string;
  owner_id: string | null;
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

export function MaterialFormatManager() {
  const [formats, setFormats] = useState<MaterialFormat[]>([]);
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
    fetch("/api/material-formats")
      .then((r) => r.json())
      .then((d: { formats?: MaterialFormat[]; error?: string }) => {
        if (d.error) {
          setLoadError(d.error);
        } else {
          setFormats(d.formats ?? []);
        }
      })
      .catch(() => {
        setLoadError("Failed to load formats");
      });
  }, []);

  const seeded = formats.filter((f) => f.owner_id === null);
  const owned = formats.filter((f) => f.owner_id !== null && f.archived_at === null);
  const archived = formats.filter((f) => f.owner_id !== null && f.archived_at !== null);

  async function handleAdd() {
    setAddError(null);
    setAddSubmitting(true);
    try {
      const data = (await apiFetch("/api/material-formats", "POST", { name: addName })) as {
        id: string;
        name: string;
        owner_id: string;
        archived_at: null;
      };
      setFormats((prev) => [...prev, { id: data.id, name: data.name, owner_id: data.owner_id, archived_at: null }]);
      setAddOpen(false);
      setAddName("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add format");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleRename() {
    if (!renameId) return;
    setRenameError(null);
    setRenameSubmitting(true);
    const prev = formats;
    setFormats((fs) => fs.map((f) => (f.id === renameId ? { ...f, name: renameName.trim() } : f)));
    try {
      await apiFetch(`/api/material-formats/${renameId}`, "PATCH", { name: renameName });
      setRenameId(null);
      setRenameName("");
    } catch (e) {
      setFormats(prev);
      setRenameError(e instanceof Error ? e.message : "Failed to rename format");
    } finally {
      setRenameSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    setActionError(null);
    const prev = formats;
    const archivedAt = new Date().toISOString();
    setFormats((fs) => fs.map((f) => (f.id === id ? { ...f, archived_at: archivedAt } : f)));
    try {
      await apiFetch(`/api/material-formats/${id}`, "PATCH", { archived_at: archivedAt });
    } catch (e) {
      setFormats(prev);
      setActionError(e instanceof Error ? e.message : "Failed to archive format");
    }
  }

  async function handleUnarchive(id: string) {
    setActionError(null);
    const prev = formats;
    setFormats((fs) => fs.map((f) => (f.id === id ? { ...f, archived_at: null } : f)));
    try {
      await apiFetch(`/api/material-formats/${id}`, "PATCH", { archived_at: null });
    } catch (e) {
      setFormats(prev);
      setActionError(e instanceof Error ? e.message : "Failed to unarchive format");
    }
  }

  if (loadError) {
    return <ServerError message={loadError} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-off-white text-xl font-semibold">Formats</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setAddName("");
                setAddError(null);
              }}
            >
              Add format
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add format</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="add-format-name">Name</Label>
              <Input
                id="add-format-name"
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

      <div className="space-y-4">
        <div>
          <h3 className="text-ash mb-2 text-sm font-medium tracking-wide uppercase">Built-in</h3>
          <ul className="space-y-2">
            {seeded.map((fmt) => (
              <li
                key={fmt.id}
                className="border-charred bg-ember/20 flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <span className="text-off-white">{fmt.name}</span>
                <span className="text-ash rounded bg-white/10 px-2 py-0.5 text-xs">Built-in</span>
              </li>
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
                <li
                  key={fmt.id}
                  className="border-charred bg-ember/20 flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <span className="text-off-white">{fmt.name}</span>
                  <div className="flex gap-2">
                    <Dialog
                      open={renameId === fmt.id}
                      onOpenChange={(open) => {
                        if (open) {
                          setRenameId(fmt.id);
                          setRenameName(fmt.name);
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
                          <DialogTitle>Rename format</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor="rename-format-name">Name</Label>
                          <Input
                            id="rename-format-name"
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
                    <Button variant="outline" size="sm" onClick={() => void handleArchive(fmt.id)}>
                      Archive
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
              {archived.map((fmt) => (
                <li
                  key={fmt.id}
                  className="border-charred bg-ember/10 flex items-center justify-between rounded-lg border px-4 py-3 opacity-60"
                >
                  <span className="text-ash line-through">{fmt.name}</span>
                  <Button variant="outline" size="sm" onClick={() => void handleUnarchive(fmt.id)}>
                    Unarchive
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
