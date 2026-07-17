import { isRated } from "@/lib/session/format";
import { blockPosition, pomodoroDots } from "@/lib/timeline/layout";
import { categoryId, categoryName, defaultColorFor, type ColorAxis } from "@/lib/timeline/color";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";
import { cn } from "@/lib/utils";
import type { EnergyLevel, SessionListItem } from "@/lib/types";

interface SessionBlockProps {
  session: SessionListItem;
  scale: Scale;
  hoursRange: HoursRange;
  colorBy: ColorAxis;
  focusOn: boolean;
  energyOn: boolean;
  dotsOn: boolean;
  onSelect: (session: SessionListItem) => void;
}

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const DOT_SHADOW = "0 0 0 1.5px rgba(0,0,0,0.35), 0 0 0 2.5px rgba(255,255,255,0.4)";
const ENERGY_SCORE: Record<EnergyLevel, number> = { low: 1, medium: 2, high: 3 };
const ENERGY_BADGE: Record<EnergyLevel, string> = { low: "L", medium: "M", high: "H" };
const MIN_SHADE_OPACITY = 0.35;

/** Linear opacity ramp from `MIN_SHADE_OPACITY` (score 1) to 1 (score `max`), used for Month opacity shading. */
function ratingOpacity(score: number, max: number): number {
  return MIN_SHADE_OPACITY + ((score - 1) / (max - 1)) * (1 - MIN_SHADE_OPACITY);
}

export default function SessionBlock({
  session,
  scale,
  hoursRange,
  colorBy,
  focusOn,
  energyOn,
  dotsOn,
  onSelect,
}: SessionBlockProps) {
  const { left, width } = blockPosition(session, hoursRange);

  const dotAxis: ColorAxis = colorBy === "topic" ? "format" : "topic";
  const mainColor = defaultColorFor(categoryId(colorBy, session));
  const dotColor = defaultColorFor(categoryId(dotAxis, session));

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
  const isMonth = scale === "month";
  const showDots = dotsOn && !isMonth && width > 4;
  const showBadges = !isMonth && width > 4;
  const rated = isRated(session);
  const showDashedOutline = focusOn && !rated;

  let opacity = 1;
  if (isMonth) {
    if (focusOn && isRated(session)) {
      opacity = ratingOpacity(session.focus_rating, 5);
    } else if (energyOn) {
      opacity = ratingOpacity(ENERGY_SCORE[session.energy_level], 3);
    }
  }

  return (
    <button
      type="button"
      className={cn(
        "absolute top-1.5 bottom-1.5 rounded-md text-left",
        showDashedOutline && "outline-off-white/60 outline outline-1 outline-dashed",
      )}
      style={{ left: `${String(left)}%`, width: `${String(width)}%`, backgroundColor: mainColor, opacity }}
      title={tooltip}
      onClick={() => {
        onSelect(session);
      }}
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

      {showBadges && focusOn && (
        <span
          className={cn(
            "text-off-white absolute bottom-1 left-1.5 rounded bg-black/40 px-1 text-[9px] font-semibold",
            !rated && "opacity-60",
          )}
        >
          {rated ? `★${String(session.focus_rating)}` : "★ n/a"}
        </span>
      )}

      {showBadges && energyOn && (
        <span className="text-off-white absolute right-1.5 bottom-1 rounded bg-black/40 px-1 text-[9px] font-semibold">
          {ENERGY_BADGE[session.energy_level]}
        </span>
      )}
    </button>
  );
}
