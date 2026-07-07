import { formatTime } from "@/lib/timer/formatTime";

export function getRunningTabTitle(input: {
  phase: "running" | "rating";
  internalPhase: "rating" | "running_break";
  mode: "preset" | "count_up";
  remaining: number;
  elapsed: number;
  breakRemaining: number;
}): string | null {
  if (input.phase === "running") {
    return `⏱ ${formatTime(input.mode === "count_up" ? input.elapsed : input.remaining)} – PomoSapiens`;
  }
  if (input.internalPhase === "running_break") {
    return `🌴 ${formatTime(input.breakRemaining)} – PomoSapiens`;
  }
  return null;
}
