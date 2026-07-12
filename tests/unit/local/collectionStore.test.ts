import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCollectionStore } from "@/lib/local/collectionStore";

interface Item {
  id: string;
  name: string;
}

const KEY = "pomosapiens.test.items";

function makeStore() {
  return createCollectionStore<Item>({ key: KEY, version: 1 });
}

describe("createCollectionStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty array when the key is missing", () => {
    expect(makeStore().getItems()).toEqual([]);
  });

  it("round-trips items through setItems/getItems with a versioned envelope", () => {
    const store = makeStore();
    store.setItems([{ id: "a", name: "Alpha" }]);
    expect(store.getItems()).toEqual([{ id: "a", name: "Alpha" }]);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "")).toEqual({ v: 1, items: [{ id: "a", name: "Alpha" }] });
  });

  it("fails open to an empty array on corrupt JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(makeStore().getItems()).toEqual([]);
  });

  it("fails open to an empty array on version mismatch", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 999, items: [{ id: "a", name: "Alpha" }] }));
    expect(makeStore().getItems()).toEqual([]);
  });

  it("returns a referentially stable snapshot between writes", () => {
    const store = makeStore();
    store.setItems([{ id: "a", name: "Alpha" }]);
    expect(store.getItems()).toBe(store.getItems());
  });

  it("notifies subscribers on setItems and stops after unsubscribe", () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setItems([{ id: "a", name: "Alpha" }]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setItems([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refreshes the snapshot on a storage event for its key", () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getItems();
    expect(before).toEqual([]);
    // Simulate another tab writing to the same key.
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items: [{ id: "b", name: "Beta" }] }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getItems()).toEqual([{ id: "b", name: "Beta" }]);
  });

  it("ignores storage events for other keys", () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "some.other.key" }));
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns the shared frozen empty array as the server snapshot", () => {
    const store = makeStore();
    expect(store.getServerSnapshot()).toEqual([]);
    expect(Object.isFrozen(store.getServerSnapshot())).toBe(true);
    expect(store.getServerSnapshot()).toBe(makeStore().getServerSnapshot());
  });
});
