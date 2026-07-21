import { Client, type IMessage, type IFrame } from "@stomp/stompjs";
import WebSocket from "ws";
import type { FeedStatus } from "./types.js";

const NETWORK_RAIL_HOST = "datafeeds.networkrail.co.uk";
const NETWORK_RAIL_PORT = 61618;
const TRUST_TOPIC = "/topic/TRAIN_MVT_ALL_TOC";
const RECONNECT_DELAY_MS = 5000;
export const FEED_CURRENT_WINDOW_MS = 2 * 60 * 1000;
const FEED_STATUS_INTERVAL_MS = 15 * 1000;

Object.assign(globalThis, { WebSocket });

export function deriveFeedStatus(
  connected: boolean,
  lastMessageAt: number | null,
  now = Date.now(),
): FeedStatus {
  return {
    source: "network-rail-trust",
    connected,
    current:
      connected &&
      lastMessageAt !== null &&
      now - lastMessageAt <= FEED_CURRENT_WINDOW_MS,
    lastMessageAt,
  };
}

export class NetworkRailStompClient {
  private client: Client | null = null;
  private onMessage: (data: unknown) => void;
  private onStatus: (status: FeedStatus) => void;
  private username: string;
  private password: string;
  private lastMessageAt: number | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private lastEmittedConnected = false;
  private lastEmittedCurrent = false;

  constructor(
    username: string,
    password: string,
    onMessage: (data: unknown) => void,
    onStatus: (status: FeedStatus) => void,
  ) {
    this.username = username;
    this.password = password;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(): void {
    this.client = new Client({
      brokerURL: `ws://${NETWORK_RAIL_HOST}:${NETWORK_RAIL_PORT}/stomp`,
      connectHeaders: {
        login: this.username,
        passcode: this.password,
        "client-id": `traintracker-${Date.now()}`,
        "heart-beat": "15000,15000",
      },
      reconnectDelay: RECONNECT_DELAY_MS,
      heartbeatIncoming: 15000,
      heartbeatOutgoing: 15000,

      onConnect: () => {
        console.log("[STOMP] Connected to Network Rail");
        this.subscribe();
        this.emitStatus();
      },

      onStompError: (frame: IFrame) => {
        console.error("[STOMP] Error:", frame.headers["message"], frame.body);
      },

      onWebSocketError: (event: Event) => {
        console.error("[STOMP] WebSocket error:", event);
      },

      onWebSocketClose: () => {
        this.emitStatus();
      },

      onDisconnect: () => {
        console.log("[STOMP] Disconnected");
        this.emitStatus();
      },
    });

    console.log("[STOMP] Connecting to Network Rail...");
    this.client.activate();
    this.statusTimer = setInterval(() => this.emitStatus(true), FEED_STATUS_INTERVAL_MS);
    this.emitStatus(true);
  }

  private subscribe(): void {
    if (!this.client) return;

    let messageCount = 0;
    this.client.subscribe(TRUST_TOPIC, (message: IMessage) => {
      try {
        const data = JSON.parse(message.body);
        messageCount++;
        if (messageCount <= 5 || messageCount % 100 === 0) {
          console.log(`[STOMP] Received message #${messageCount}`);
        }
        this.onMessage(data);
        this.lastMessageAt = Date.now();
        this.emitStatus();
      } catch (err) {
        console.error("[STOMP] Failed to parse message:", err);
      }
    });

    console.log(`[STOMP] Subscribed to ${TRUST_TOPIC}`);
  }

  disconnect(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
    this.emitStatus(true);
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  getStatus(now = Date.now()): FeedStatus {
    return deriveFeedStatus(this.isConnected(), this.lastMessageAt, now);
  }

  private emitStatus(force = false): void {
    const status = this.getStatus();
    const changed =
      status.connected !== this.lastEmittedConnected ||
      status.current !== this.lastEmittedCurrent;

    if (!force && !changed) return;

    this.lastEmittedConnected = status.connected;
    this.lastEmittedCurrent = status.current;
    this.onStatus(status);
  }
}
