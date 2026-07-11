import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  entityLabel: string;
  onAdd: (name: string) => Promise<unknown>;
}

export function AddEntityDialog({ entityLabel, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = `add-${entityLabel}-name`;

  async function handleAdd() {
    setError(null);
    setSubmitting(true);
    try {
      await onAdd(name);
      setOpen(false);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to add ${entityLabel}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          onClick={() => {
            setName("");
            setError(null);
          }}
        >
          Add {entityLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {entityLabel}</DialogTitle>
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
              if (e.key === "Enter") void handleAdd();
            }}
            maxLength={100}
            autoFocus
          />
          <ServerError message={error} />
        </div>
        <DialogFooter>
          <Button onClick={() => void handleAdd()} disabled={submitting || name.trim().length === 0}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
