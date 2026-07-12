import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { fetchJson } from "@/lib/api/fetchJson";

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DeleteSessionDialog({ sessionId, open, onOpenChange }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await fetchJson(`/api/sessions/${sessionId}`, {
        method: "DELETE",
        fallbackError: "Failed to delete session",
      });

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete session?</DialogTitle>
          <DialogDescription>This permanently removes the session and can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <ServerError message={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={deleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => {
              void handleDelete();
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
