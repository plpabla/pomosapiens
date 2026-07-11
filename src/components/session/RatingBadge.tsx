interface Props {
  status: "done" | "in_progress";
  focusRating: number | null;
}

export default function RatingBadge({ status, focusRating }: Props) {
  return (
    <span className="text-off-white/80 text-sm">
      {status === "done" ? (focusRating != null ? `★ ${focusRating} / 5` : "Skipped") : ""}
    </span>
  );
}
