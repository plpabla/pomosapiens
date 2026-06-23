import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

export interface AudioMock {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  muted: boolean;
  currentTime: number;
  src: string;
}

export function createAudioMock(): AudioMock {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    muted: false,
    currentTime: 0,
    src: "",
  };
}

export function dispatchVisibilityChange(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => state === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

export function stubAudioGlobal(): { instances: AudioMock[]; restore: () => void } {
  const instances: AudioMock[] = [];
  vi.stubGlobal(
    "Audio",
    vi.fn().mockImplementation(() => {
      const mock = createAudioMock();
      instances.push(mock);
      return mock;
    }),
  );
  return {
    instances,
    restore: () => {
      vi.unstubAllGlobals();
    },
  };
}
