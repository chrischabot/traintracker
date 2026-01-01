export interface TrainState {
  trainId: string;
  lat: number;
  lng: number;
  stanox: string;
  status: "on-time" | "slight-delay" | "delayed";
  delayMinutes: number;
  lastUpdate: number;
  tocId: string;
  eventType: "arrival" | "departure";
}

export interface TrainStats {
  total: number;
  onTime: number;
  slightDelay: number;
  delayed: number;
  lastUpdate: number;
}

export type ServerMessage =
  | { type: "snapshot"; trains: TrainState[]; timestamp: number }
  | { type: "update"; train: TrainState }
  | { type: "remove"; trainId: string }
  | { type: "stats"; total: number; onTime: number; slightDelay: number; delayed: number; lastUpdate: number }
  | { type: "pong" };

export type ClientMessage = { type: "ping" };

export const STATUS_COLORS = {
  "on-time": "#22c55e",
  "slight-delay": "#eab308",
  delayed: "#ef4444",
} as const;
