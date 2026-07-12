import { formatDuration, tomatoCount } from "@/lib/session/format";

interface Props {
  status: "done" | "in_progress";
  durationSeconds: number | null;
}

export default function DurationLabel({ status, durationSeconds }: Props) {
  const tomatoes = status === "done" && durationSeconds != null ? tomatoCount(durationSeconds) : 0;

  return (
    <span className="text-off-white/55 min-w-0 flex-1 truncate text-sm font-medium">
      {status === "done" && durationSeconds != null ? formatDuration(durationSeconds) : "In progress"}
      {tomatoes > 0 && ` ${"🍅".repeat(tomatoes)}`}
    </span>
  );
}
