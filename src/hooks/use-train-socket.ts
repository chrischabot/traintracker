import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FeedStatus,
  ServerMessage,
  TrainDataSource,
  TrainState,
  TrainStats,
} from "@/types/train";
import { createSyntheticTrainDataset } from "@/lib/synthetic-trains";

export const WS_RECONNECT_DELAY = 3000;
export const MAX_RETRIES_BEFORE_SYNTHETIC = 3;
export const CLIENT_PING_INTERVAL_MS = 15_000;
export const SERVER_MESSAGE_TIMEOUT_MS = 45_000;

export function isServerConnectionStale(
  lastServerMessageAt: number,
  now = Date.now(),
) {
  return now - lastServerMessageAt >= SERVER_MESSAGE_TIMEOUT_MS;
}

export function startServerMessageWatchdog(onTimeout: () => void) {
  let lastServerMessageAt = Date.now();
  let timedOut = false;
  const timer = globalThis.setInterval(() => {
    if (timedOut || !isServerConnectionStale(lastServerMessageAt)) return;
    timedOut = true;
    onTimeout();
  }, CLIENT_PING_INTERVAL_MS);

  return {
    recordMessage() {
      lastServerMessageAt = Date.now();
    },
    stop() {
      globalThis.clearInterval(timer);
    },
  };
}

export function getReconnectDecision(consecutiveFailures: number) {
  return {
    useSynthetic: consecutiveFailures >= MAX_RETRIES_BEFORE_SYNTHETIC,
    retryAfterMs: WS_RECONNECT_DELAY,
  };
}

const EMPTY_STATS: TrainStats = {
  total: 0,
  onTime: 0,
  slightDelay: 0,
  delayed: 0,
  lastUpdate: null,
};

export function useTrainSocket() {
  const [trains, setTrains] = useState<Map<string, TrainState>>(new Map());
  const [stats, setStats] = useState<TrainStats>(EMPTY_STATS);
  const [connected, setConnected] = useState(false);
  const [usingMock, setUsingMock] = useState(false);
  const [dataSource, setDataSource] = useState<TrainDataSource>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const retryCountRef = useRef(0);
  const activeRef = useRef(false);
  const dataSourceRef = useRef<TrainDataSource>(null);
  const feedStatusRef = useRef<FeedStatus | null>(null);
  const liveTrainsRef = useRef<Map<string, TrainState>>(new Map());
  const liveStatsRef = useRef<TrainStats>(EMPTY_STATS);

  const selectDataSource = useCallback((source: TrainDataSource) => {
    dataSourceRef.current = source;
    setDataSource(source);
    setUsingMock(source === "synthetic");
  }, []);

  const enableSyntheticMode = useCallback(() => {
    if (dataSourceRef.current === "synthetic") return;

    const dataset = createSyntheticTrainDataset();
    selectDataSource(dataset.source);
    setTrains(new Map(dataset.trains.map((train) => [train.trainId, train])));
    setStats(dataset.stats);
  }, [selectDataSource]);

  const activateLiveData = useCallback(() => {
    selectDataSource("live");
    setTrains(new Map(liveTrainsRef.current));
    setStats(liveStatsRef.current);
  }, [selectDataSource]);

  const applyFeedStatus = useCallback((feed: FeedStatus) => {
    feedStatusRef.current = feed;
    setFeedStatus(feed);

    if (feed.current) {
      activateLiveData();
    } else {
      enableSyntheticMode();
    }
  }, [activateLiveData, enableSyntheticMode]);

  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    let pingTimer: number | undefined;
    let watchdog: ReturnType<typeof startServerMessageWatchdog> | undefined;
    let failureHandled = false;

    const clearSocketTimers = () => {
      if (pingTimer) window.clearInterval(pingTimer);
      watchdog?.stop();
    };

    const handleDisconnect = () => {
      if (failureHandled) return;
      if (wsRef.current !== ws) {
        failureHandled = true;
        clearSocketTimers();
        return;
      }
      failureHandled = true;
      clearSocketTimers();
      setConnected(false);
      if (wsRef.current === ws) wsRef.current = null;
      if (!activeRef.current) return;

      if (dataSourceRef.current === "live") {
        selectDataSource(null);
      }

      retryCountRef.current++;
      const decision = getReconnectDecision(retryCountRef.current);
      if (decision.useSynthetic) enableSyntheticMode();

      reconnectTimeoutRef.current = window.setTimeout(connect, decision.retryAfterMs);
    };

    ws.onopen = () => {
      if (wsRef.current !== ws) {
        ws.close();
        return;
      }
      setConnected(true);
      pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, CLIENT_PING_INTERVAL_MS);
      watchdog = startServerMessageWatchdog(() => {
        handleDisconnect();
        ws.close(4000, "Server message timeout");
      });
    };

    ws.onclose = handleDisconnect;

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      handleDisconnect();
      ws.close();
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      watchdog?.recordMessage();
      retryCountRef.current = 0;
      try {
        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case "snapshot":
            liveTrainsRef.current = new Map(message.trains.map((train) => [train.trainId, train]));
            liveStatsRef.current = message.stats;
            applyFeedStatus(message.feed);
            break;

          case "update": {
            const next = new Map(liveTrainsRef.current);
            next.set(message.train.trainId, message.train);
            liveTrainsRef.current = next;
            if (feedStatusRef.current?.current) setTrains(next);
            break;
          }

          case "remove": {
            const next = new Map(liveTrainsRef.current);
            next.delete(message.trainId);
            liveTrainsRef.current = next;
            if (feedStatusRef.current?.current) setTrains(next);
            break;
          }

          case "stats": {
            const nextStats = {
              total: message.total,
              onTime: message.onTime,
              slightDelay: message.slightDelay,
              delayed: message.delayed,
              lastUpdate: message.lastUpdate,
            };
            liveStatsRef.current = nextStats;
            if (feedStatusRef.current?.current) setStats(nextStats);
            break;
          }

          case "feed_status":
            applyFeedStatus(message.feed);
            break;
        }
      } catch {
        return;
      }
    };

    wsRef.current = ws;
  }, [applyFeedStatus, enableSyntheticMode, selectDataSource]);

  useEffect(() => {
    activeRef.current = true;
    connect();

    return () => {
      activeRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const socket = wsRef.current;
      wsRef.current = null;
      socket?.close();
    };
  }, [connect]);

  return {
    trains: Array.from(trains.values()),
    stats,
    connected,
    usingMock,
    dataSource,
    feedStatus,
  };
}
