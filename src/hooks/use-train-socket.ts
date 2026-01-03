import { useEffect, useRef, useState, useCallback } from "react";
import type { TrainState, TrainStats, ServerMessage } from "@/types/train";

const WS_RECONNECT_DELAY = 3000;
const MAX_RETRIES_BEFORE_MOCK = 3;

const now = Date.now();
const MOCK_TRAINS: TrainState[] = [
  {
    trainId: "1A01", lat: 51.5074, lng: -0.1278, stanox: "87701", stationName: "London Euston", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: "VT", eventType: "departure",
    origin: { stanox: "87700", name: "Manchester Piccadilly", time: now - 7200000, eventType: "departure", delayMinutes: 0 },
    recentStops: [
      { stanox: "87705", name: "Milton Keynes Central", time: now - 1800000, eventType: "departure", delayMinutes: 0 },
    ],
  },
  {
    trainId: "1B02", lat: 51.4545, lng: -2.5879, stanox: "87702", stationName: "Bristol Temple Meads", status: "slight-delay", delayMinutes: 3, lastUpdate: now, tocId: "GW", eventType: "arrival",
    origin: { stanox: "87701", name: "London Paddington", time: now - 5400000, eventType: "departure", delayMinutes: 0 },
    recentStops: [
      { stanox: "87703", name: "Bath Spa", time: now - 900000, eventType: "departure", delayMinutes: 2 },
    ],
  },
  {
    trainId: "1C03", lat: 53.4808, lng: -2.2426, stanox: "87703", stationName: "Manchester Oxford Road", status: "delayed", delayMinutes: 12, lastUpdate: now, tocId: "NT", eventType: "departure",
    origin: { stanox: "87702", name: "Liverpool Lime Street", time: now - 3600000, eventType: "departure", delayMinutes: 5 },
    recentStops: [],
  },
  { trainId: "1D04", lat: 52.4862, lng: -1.8904, stanox: "87704", stationName: "Birmingham New Street", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: "XC", eventType: "arrival", recentStops: [] },
  { trainId: "1E05", lat: 55.9533, lng: -3.1883, stanox: "87705", stationName: "Edinburgh Waverley", status: "slight-delay", delayMinutes: 2, lastUpdate: now, tocId: "SR", eventType: "departure", recentStops: [] },
  { trainId: "1F06", lat: 53.8008, lng: -1.5491, stanox: "87706", stationName: "Leeds", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: "NT", eventType: "arrival", recentStops: [] },
  { trainId: "1G07", lat: 50.9097, lng: -1.4044, stanox: "87707", stationName: "Southampton Central", status: "delayed", delayMinutes: 8, lastUpdate: now, tocId: "SW", eventType: "departure", recentStops: [] },
  { trainId: "1H08", lat: 51.4816, lng: -3.1791, stanox: "87708", stationName: "Cardiff Central", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: "TW", eventType: "arrival", recentStops: [] },
  { trainId: "2A01", lat: 51.5312, lng: -0.1248, stanox: "87709", stationName: "King's Cross", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: "TL", eventType: "departure", recentStops: [] },
  { trainId: "2B02", lat: 51.5030, lng: -0.0136, stanox: "87710", stationName: "Canary Wharf", status: "slight-delay", delayMinutes: 4, lastUpdate: now, tocId: "SE", eventType: "arrival", recentStops: [] },
  { trainId: "2C03", lat: 51.5172, lng: -0.0801, stanox: "87711", stationName: "Liverpool Street", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: "TL", eventType: "departure", recentStops: [] },
  { trainId: "2D04", lat: 51.4636, lng: -0.1139, stanox: "87712", stationName: "Victoria", status: "delayed", delayMinutes: 15, lastUpdate: now, tocId: "SN", eventType: "arrival", recentStops: [] },
];

export function useTrainSocket() {
  const [trains, setTrains] = useState<Map<string, TrainState>>(new Map());
  const [stats, setStats] = useState<TrainStats>({
    total: 0,
    onTime: 0,
    slightDelay: 0,
    delayed: 0,
    lastUpdate: Date.now(),
  });
  const [connected, setConnected] = useState(false);
  const [usingMock, setUsingMock] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const retryCountRef = useRef(0);

  const enableMockMode = useCallback(() => {
    setUsingMock(true);
    setConnected(true);
    const mockMap = new Map(MOCK_TRAINS.map((t) => [t.trainId, t]));
    setTrains(mockMap);
    setStats({
      total: MOCK_TRAINS.length,
      onTime: MOCK_TRAINS.filter((t) => t.status === "on-time").length,
      slightDelay: MOCK_TRAINS.filter((t) => t.status === "slight-delay").length,
      delayed: MOCK_TRAINS.filter((t) => t.status === "delayed").length,
      lastUpdate: Date.now(),
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (usingMock) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

    ws.onopen = () => {
      setConnected(true);
      retryCountRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      retryCountRef.current++;

      if (retryCountRef.current >= MAX_RETRIES_BEFORE_MOCK) {
        enableMockMode();
      } else {
        reconnectTimeoutRef.current = window.setTimeout(connect, WS_RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case "snapshot":
            setTrains(new Map(message.trains.map((t) => [t.trainId, t])));
            setStats((prev) => ({ ...prev, total: message.trains.length, lastUpdate: message.timestamp }));
            break;

          case "update":
            setTrains((prev) => {
              const next = new Map(prev);
              next.set(message.train.trainId, message.train);
              return next;
            });
            break;

          case "remove":
            setTrains((prev) => {
              const next = new Map(prev);
              next.delete(message.trainId);
              return next;
            });
            break;

          case "stats":
            setStats({
              total: message.total,
              onTime: message.onTime,
              slightDelay: message.slightDelay,
              delayed: message.delayed,
              lastUpdate: message.lastUpdate,
            });
            break;
        }
      } catch {
      }
    };

    wsRef.current = ws;
  }, [usingMock, enableMockMode]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    trains: Array.from(trains.values()),
    stats,
    connected,
    usingMock,
  };
}
