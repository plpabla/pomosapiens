import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";

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

afterEach(() => {
  dispatchVisibilityChange("visible");
});

export function stubAudioGlobal(): { instances: AudioMock[]; restore: () => void } {
  const instances: AudioMock[] = [];
  vi.stubGlobal(
    "Audio",
    // Must be a regular function (not arrow) so `new Audio()` works as a constructor.
    // When a constructor returns a plain object, `new` uses that object as the result.
    vi.fn().mockImplementation(function () {
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
