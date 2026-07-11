import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  entityLabel: string;
  currentName: string;
  onRename: (name: string) => Promise<void>;
}

export function RenameDialog({ entityLabel, currentName, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = `rename-${entityLabel}-name`;

  async function handleRename() {
    setError(null);
    setSubmitting(true);
    try {
      await onRename(name);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to rename ${entityLabel}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(currentName);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {entityLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Name</Label>
          <Input
            id={inputId}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename();
            }}
            maxLength={100}
            autoFocus
          />
          <ServerError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={() => void handleRename()} disabled={submitting || name.trim().length === 0}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
