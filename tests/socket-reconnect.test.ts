import { describe, expect, it, vi } from "vitest";

import {
  getReconnectDecision,
  isServerConnectionStale,
  MAX_RETRIES_BEFORE_SYNTHETIC,
  SERVER_MESSAGE_TIMEOUT_MS,
  startServerMessageWatchdog,
  WS_RECONNECT_DELAY,
} from "../src/hooks/use-train-socket";

describe("train socket reconnection policy", () => {
  it("keeps scheduling retries after synthetic data takes over", () => {
    const decision = getReconnectDecision(MAX_RETRIES_BEFORE_SYNTHETIC);

    expect(decision).toEqual({
      useSynthetic: true,
      retryAfterMs: WS_RECONNECT_DELAY,
    });
    expect(getReconnectDecision(MAX_RETRIES_BEFORE_SYNTHETIC + 20).retryAfterMs).toBe(
      WS_RECONNECT_DELAY,
    );
  });

  it("waits for the failure threshold before showing synthetic data", () => {
    expect(getReconnectDecision(MAX_RETRIES_BEFORE_SYNTHETIC - 1).useSynthetic).toBe(false);
  });

  it("declares a silent backend stale after three ping intervals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));
    const lastMessageAt = Date.now();

    vi.advanceTimersByTime(SERVER_MESSAGE_TIMEOUT_MS - 1);
    expect(isServerConnectionStale(lastMessageAt)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(isServerConnectionStale(lastMessageAt)).toBe(true);
    vi.useRealTimers();
  });

  it("fires the watchdog when the server stops answering", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00Z"));
    const onTimeout = vi.fn();
    const watchdog = startServerMessageWatchdog(onTimeout);

    vi.advanceTimersByTime(SERVER_MESSAGE_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();

    watchdog.stop();
    vi.useRealTimers();
  });
});
