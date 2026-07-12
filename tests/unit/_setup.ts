import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";

// jsdom has no PointerEvent constructor, so Testing Library's fireEvent.pointerDown/Up
// fall back to a plain Event with `button`/`ctrlKey` left undefined. Radix's dropdown-menu
// (and other Radix primitives) open on pointerdown and gate on `event.button === 0`, so
// without this polyfill their triggers never open in jsdom tests.
if (typeof PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId;
      this.pointerType = params.pointerType;
      this.isPrimary = params.isPrimary;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

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
