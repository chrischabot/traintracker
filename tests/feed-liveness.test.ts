import { describe, expect, it } from "vitest";

import {
  deriveFeedStatus,
  FEED_CURRENT_WINDOW_MS,
} from "../server/src/stomp-client";

describe("Network Rail feed liveness", () => {
  const now = 1_700_000_000_000;

  it("does not call a connected feed current before a message arrives", () => {
    expect(deriveFeedStatus(true, null, now)).toEqual({
      source: "network-rail-trust",
      connected: true,
      current: false,
      lastMessageAt: null,
    });
  });

  it("requires both a live STOMP connection and a recent feed message", () => {
    const recent = now - FEED_CURRENT_WINDOW_MS;

    expect(deriveFeedStatus(true, recent, now).current).toBe(true);
    expect(deriveFeedStatus(false, recent, now).current).toBe(false);
    expect(deriveFeedStatus(true, recent - 1, now).current).toBe(false);
  });
});
