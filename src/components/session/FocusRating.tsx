import React, { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";

interface FocusRatingProps {
  onSubmit: (rating: number | null, note: string | null) => Promise<void>;
  error: string | null;
  canTakeBreak: boolean;
  onStartNewSession: () => void;
  onTakeBreak: () => void;
  onGoToDashboard: () => void;
}

export default function FocusRating({
  onSubmit,
  error,
  canTakeBreak,
  onStartNewSession,
  onTakeBreak,
  onGoToDashboard,
}: FocusRatingProps) {
  const [screen, setScreen] = useState<"rating" | "saved">("rating");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [justPicked, setJustPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRate(n: number) {
    setJustPicked(n);
    setSubmitting(true);
    const submitPromise = onSubmit(n, note.trim() === "" ? null : note.trim());
    await new Promise((resolve) => setTimeout(resolve, 260)); // let the pop animation play out
    try {
      await submitPromise;
      setRating(n);
      setScreen("saved");
    } catch {
      // error surfaced via `error` prop; remain on the rating screen
    } finally {
      setSubmitting(false);
      setJustPicked(null);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    try {
      await onSubmit(null, note.trim() === "" ? null : note.trim());
      setRating(null);
      setScreen("saved");
    } catch {
      // error surfaced via `error` prop; remain on the rating screen
    } finally {
      setSubmitting(false);
    }
  }

  if (screen === "saved") {
    const hasNote = note.trim() !== "";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 p-4 text-center">
        <div className="bg-blaze flex size-16 items-center justify-center rounded-full">
          <Check className="text-off-white size-8" strokeWidth={2.5} />
        </div>

        <div>
          <h2 className="text-off-white mb-1.5 text-2xl font-bold">Session saved</h2>
          <p className="text-ash text-sm">
            {rating != null ? "Nice work — logged for this session." : "No rating given, but you're all set."}
          </p>
        </div>

        {rating != null && (
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className={cn("size-2.5 rounded-full", n <= rating ? "bg-blaze" : "bg-charred")} />
            ))}
            <span className="text-off-white ml-2 text-sm font-bold">{rating} / 5 focus</span>
          </div>
        )}

        {hasNote && (
          <div className="bg-ember border-charred w-full max-w-sm rounded-md border p-4 text-left">
            <div className="text-ash mb-1.5 text-xs font-semibold tracking-wide uppercase">Your note</div>
            <div className="text-off-white text-sm leading-relaxed">{note}</div>
          </div>
        )}

        <div className="flex w-full max-w-sm flex-col gap-2.5">
          <Button
            variant="outline"
            onClick={onStartNewSession}
            className="border-charred text-ash hover:text-off-white"
          >
            Start a new session
          </Button>
          {canTakeBreak && (
            <Button variant="outline" onClick={onTakeBreak} className="border-charred text-ash hover:text-off-white">
              Take a break
            </Button>
          )}
          <Button variant="outline" onClick={onGoToDashboard} className="border-charred text-ash hover:text-off-white">
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
      <h2 className="text-off-white text-2xl font-bold">How was your focus?</h2>
      <div className="flex w-full max-w-sm flex-col gap-2 text-left">
        <Label htmlFor="session-note" className="text-ash">
          Add a note (optional)
        </Label>
        <Textarea
          id="session-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
          placeholder="What helped or hurt your focus this session?"
          maxLength={500}
          disabled={submitting}
        />
      </div>
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            disabled={submitting}
            onClick={() => void handleRate(n)}
            className={cn(
              "bg-ember border-charred text-off-white hover:bg-blaze h-14 w-14 text-xl font-bold",
              justPicked === n && "animate-rf-pop",
            )}
          >
            {n}
          </Button>
        ))}
      </div>
      <ServerError message={error} />
      <Button
        variant="ghost"
        disabled={submitting}
        onClick={() => void handleSkip()}
        className="text-ash hover:text-off-white"
      >
        {submitting ? "Saving..." : "Skip"}
      </Button>
    </div>
  );
}
