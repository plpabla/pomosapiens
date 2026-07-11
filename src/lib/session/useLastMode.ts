import { useSyncExternalStore } from "react";
import type { Mode } from "@/lib/types";

const LAST_MODE_KEY = "pomosapiens.last_mode";

// useSyncExternalStore store for last-used mode.
// Reading from localStorage with useSyncExternalStore + getServerSnapshot avoids the
// SSR/client hydration mismatch that a useState lazy-initializer would cause
// (server has no window, so it always sees "preset_1"; naive client reads can diverge).
const modeListeners = new Set<() => void>();
function subscribeMode(callback: () => void) {
  modeListeners.add(callback);
  return () => {
    modeListeners.delete(callback);
  };
}
function getModeSnapshot(): Mode {
  try {
    return (localStorage.getItem(LAST_MODE_KEY) as Mode | null) ?? "preset_1";
  } catch {
    return "preset_1";
  }
}
function getModeServerSnapshot(): Mode {
  return "preset_1";
}
function persistMode(mode: Mode) {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    // fail open: localStorage unavailable (private mode, partitioned storage, etc.)
  }
  modeListeners.forEach((l) => {
    l();
  });
}

export function useLastMode(): [Mode, (mode: Mode) => void] {
  const mode = useSyncExternalStore(subscribeMode, getModeSnapshot, getModeServerSnapshot);
  return [mode, persistMode];
}
