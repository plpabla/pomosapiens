import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ServerError } from "@/components/auth/ServerError";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/api/fetchJson";
import { minutesFromSeconds, secondsFromMinutes } from "@/lib/time";
import { ENERGY_LEVELS, triggerClass, TopicSelect, MaterialFormatSelect } from "@/components/session/CatalogSelects";
import { useTopicsAndFormats } from "@/lib/session/useCatalog";
import type { EnergyLevel } from "@/lib/types";

interface Props {
  id: string;
  startedAt: string;
  durationSeconds: number;
  energyLevel: EnergyLevel;
  topicId: string | null;
  materialFormatId: string | null;
  focusRating: number | null;
  note: string | null;
}

export default function EditSessionDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const { topics, formats, loadError } = useTopicsAndFormats({ enabled: open });

  const [minutes, setMinutes] = useState(String(minutesFromSeconds(props.durationSeconds)));
  const [durationDirty, setDurationDirty] = useState(false);
  const [energy, setEnergy] = useState<EnergyLevel>(props.energyLevel);
  const [topicId, setTopicId] = useState<string | null>(props.topicId);
  const [materialFormatId, setMaterialFormatId] = useState<string | null>(props.materialFormatId);
  const [rating, setRating] = useState<number | null>(props.focusRating);
  const [note, setNote] = useState(props.note ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const durationSeconds = durationDirty ? secondsFromMinutes(Number(minutes)) : props.durationSeconds;
    const trimmedNote = note.trim();

    try {
      await fetchJson(`/api/sessions/${props.id}`, {
        method: "PUT",
        body: {
          duration_seconds: durationSeconds,
          energy_level: energy,
          topic_id: topicId,
          material_format_id: materialFormatId,
          focus_rating: rating,
          note: trimmedNote === "" ? null : trimmedNote,
        },
        fallbackError: "Failed to save changes",
      });

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) return;
    setMinutes(String(minutesFromSeconds(props.durationSeconds)));
    setDurationDirty(false);
    setEnergy(props.energyLevel);
    setTopicId(props.topicId);
    setMaterialFormatId(props.materialFormatId);
    setRating(props.focusRating);
    setNote(props.note ?? "");
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit session</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-duration-${props.id}`}>Duration (minutes)</Label>
            <Input
              id={`edit-duration-${props.id}`}
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                setDurationDirty(true);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-energy-${props.id}`}>Energy level</Label>
            <Select
              value={energy}
              onValueChange={(v) => {
                setEnergy(v as EnergyLevel);
              }}
            >
              <SelectTrigger id={`edit-energy-${props.id}`} aria-label="Energy level" className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENERGY_LEVELS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-topic-${props.id}`}>Topic</Label>
            <TopicSelect id={`edit-topic-${props.id}`} value={topicId} onChange={setTopicId} topics={topics} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-format-${props.id}`}>Material format</Label>
            <MaterialFormatSelect
              id={`edit-format-${props.id}`}
              value={materialFormatId}
              onChange={setMaterialFormatId}
              formats={formats}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Focus rating</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={rating === n}
                  onClick={() => {
                    setRating(n);
                  }}
                  className={cn("w-10", rating === n && "bg-blaze text-off-white border-blaze")}
                >
                  {n}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={rating === null}
                onClick={() => {
                  setRating(null);
                }}
              >
                Skip
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-note-${props.id}`}>Note</Label>
            <Textarea
              id={`edit-note-${props.id}`}
              value={note}
              maxLength={500}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </div>

          {loadError && <ServerError message={loadError} />}
          <ServerError message={error} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => {
              void handleSave();
            }}
          >
            {submitting ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
