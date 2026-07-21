import { afterEach, describe, expect, it, vi } from "vitest";

import { TrainStateManager } from "../server/src/train-state";

function createManager() {
  return new TrainStateManager(
    {
      "12345": {
        lat: 51.5,
        lng: -0.1,
        name: "Test location",
        tiploc: "TESTLOC",
      },
    },
    {
      onUpdate: () => undefined,
      onRemove: () => undefined,
      onStats: () => undefined,
    },
  );
}

describe("train state freshness", () => {
  afterEach(() => vi.useRealTimers());

  it("does not manufacture a fresh last-update time when stats are read", () => {
    const manager = createManager();

    expect(manager.getStats().lastUpdate).toBeNull();
  });

  it("keeps the receipt time of the last real state change", () => {
    vi.useFakeTimers();
    const receivedAt = new Date("2026-07-21T12:00:00Z");
    vi.setSystemTime(receivedAt);
    const manager = createManager();

    manager.processEvent({
      type: "activation",
      trainId: "real-train-id",
      stanox: "12345",
      timestamp: receivedAt.getTime() - 30_000,
    });

    expect(manager.getStats().lastUpdate).toBe(receivedAt.getTime());
    vi.advanceTimersByTime(60_000);
    expect(manager.getStats().lastUpdate).toBe(receivedAt.getTime());
  });
});
