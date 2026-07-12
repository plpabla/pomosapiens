import { cn } from "@/lib/utils";
import type { EnergyLevel } from "@/lib/types";

const energyPillClass: Record<string, string> = {
  high: "bg-spark/15 text-spark",
  medium: "bg-blaze/15 text-blaze",
  low: "bg-ash/15 text-ash",
};

interface Props {
  energyLevel: EnergyLevel;
}

export default function EnergyPill({ energyLevel }: Props) {
  const pillClass = energyPillClass[energyLevel] ?? "bg-ash/15 text-ash";

  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase", pillClass)}>
      {energyLevel}
    </span>
  );
}
