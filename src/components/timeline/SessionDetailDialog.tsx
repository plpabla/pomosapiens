import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDuration, isRated } from "@/lib/session/format";
import { categoryName } from "@/lib/timeline/color";
import { formatFullDate } from "@/lib/timeline/dateRange";
import { cn } from "@/lib/utils";
import type { SessionListItem } from "@/lib/types";

interface SessionDetailDialogProps {
  session: SessionListItem | null;
  onOpenChange: (open: boolean) => void;
}

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SessionDetailDialog({ session, onOpenChange }: SessionDetailDialogProps) {
  if (session === null) {
    return <Dialog open={false} onOpenChange={onOpenChange} />;
  }

  const start = new Date(session.started_at);
  const end = session.ended_at !== null ? new Date(session.ended_at) : null;
  const timeRange =
    end !== null
      ? `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
      : `${timeFormatter.format(start)} – ongoing`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {categoryName("topic", session)} · {categoryName("format", session)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ash">Date</span>
            <span className="text-off-white">{formatFullDate(start)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-ash">Time</span>
            <span className="text-off-white">{timeRange}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-ash">Duration</span>
            <span className="text-off-white">
              {session.duration_seconds !== null ? formatDuration(session.duration_seconds) : "In progress"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-ash">Focus</span>
            {isRated(session) ? (
              <span className="flex items-center gap-1">
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn("size-4", n <= session.focus_rating ? "text-spark" : "text-charred")}
                      fill="currentColor"
                    />
                  ))}
                </span>
                <span className="text-off-white">{session.focus_rating} / 5</span>
              </span>
            ) : (
              <span className="text-off-white">Not rated</span>
            )}
          </div>

          <div className="flex justify-between">
            <span className="text-ash">Energy</span>
            <span className="text-off-white">{capitalize(session.energy_level)}</span>
          </div>

          {session.note !== null && session.note !== "" && (
            <div className="flex flex-col gap-1">
              <span className="text-ash">Notes</span>
              <p className="text-off-white leading-relaxed">{session.note}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
