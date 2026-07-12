import DurationLabel from "@/components/session/DurationLabel";
import RatingBadge from "@/components/session/RatingBadge";

interface Props {
  status: "done" | "in_progress";
  durationSeconds: number | null;
  focusRating: number | null;
}

export default function SessionSummaryRow({ status, durationSeconds, focusRating }: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <DurationLabel status={status} durationSeconds={durationSeconds} />
      <RatingBadge status={status} focusRating={focusRating} />
    </div>
  );
}
