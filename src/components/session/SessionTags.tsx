import { modeLabel } from "@/lib/session/format";
import type { SessionListItem } from "@/lib/types";

interface Props {
  session: Pick<SessionListItem, "timer_mode" | "topic" | "material_format">;
}

export default function SessionTags({ session }: Props) {
  const label = modeLabel(session.timer_mode);

  if (label === null && session.topic === null && session.material_format === null) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {label !== null && <span className="bg-charred text-off-white/80 rounded px-2 py-0.5 text-xs">{label}</span>}
      {session.topic !== null && (
        <span
          className="bg-charred text-off-white/80 max-w-[10rem] truncate rounded px-2 py-0.5 text-xs"
          title={session.topic.name}
        >
          {session.topic.name}
        </span>
      )}
      {session.material_format !== null && (
        <span
          className="bg-charred text-off-white/80 max-w-[10rem] truncate rounded px-2 py-0.5 text-xs"
          title={session.material_format.name}
        >
          {session.material_format.name}
        </span>
      )}
    </div>
  );
}
