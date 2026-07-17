import { blockPosition, pomodoroDots } from "@/lib/timeline/layout";
import { categoryId, categoryName, defaultColorFor } from "@/lib/timeline/color";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";
import type { SessionListItem } from "@/lib/types";

interface SessionBlockProps {
  session: SessionListItem;
  scale: Scale;
  hoursRange: HoursRange;
}

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const DOT_SHADOW = "0 0 0 1.5px rgba(0,0,0,0.35), 0 0 0 2.5px rgba(255,255,255,0.4)";

export default function SessionBlock({ session, scale, hoursRange }: SessionBlockProps) {
  const { left, width } = blockPosition(session, hoursRange);

  const mainColor = defaultColorFor(categoryId("topic", session));
  const dotColor = defaultColorFor(categoryId("format", session));

  const start = new Date(session.started_at);
  const end = session.ended_at !== null ? new Date(session.ended_at) : null;
  const timeRange =
    end !== null
      ? `${timeFormatter.format(start)}–${timeFormatter.format(end)}`
      : `${timeFormatter.format(start)}–ongoing`;

  const focusLabel = session.focus_rating !== null ? `Focus ${String(session.focus_rating)}/5` : "Focus: not rated";
  const energyLabel = `Energy: ${capitalize(session.energy_level)}`;

  const tooltip = [
    `${categoryName("topic", session)} · ${categoryName("format", session)}`,
    timeRange,
    focusLabel,
    energyLabel,
  ].join(" · ");

  const dots = pomodoroDots(session.duration_seconds);
  const showDots = scale !== "month" && width > 4;

  return (
    <div
      className="absolute top-1.5 bottom-1.5 rounded-md"
      style={{ left: `${String(left)}%`, width: `${String(width)}%`, backgroundColor: mainColor }}
      title={tooltip}
    >
      {showDots && (
        <div className="absolute top-1 left-1.5 flex gap-[3px]">
          {dots.half ? (
            <span
              className="h-[9px] w-[9px] rounded-full"
              style={{
                background: `conic-gradient(${dotColor} 0deg 180deg, rgba(0,0,0,0.35) 180deg 360deg)`,
                boxShadow: DOT_SHADOW,
              }}
            />
          ) : (
            Array.from({ length: dots.full }, (_, index) => (
              <span
                key={index}
                className="h-[9px] w-[9px] rounded-full"
                style={{ backgroundColor: dotColor, boxShadow: DOT_SHADOW }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
