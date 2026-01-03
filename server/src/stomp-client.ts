import { Client, type IMessage, type IFrame } from "@stomp/stompjs";
import WebSocket from "ws";

const NETWORK_RAIL_HOST = "datafeeds.networkrail.co.uk";
const NETWORK_RAIL_PORT = 61618;
const TRUST_TOPIC = "/topic/TRAIN_MVT_ALL_TOC";
const RECONNECT_DELAY_MS = 5000;

Object.assign(globalThis, { WebSocket });

export class NetworkRailStompClient {
  private client: Client | null = null;
  private onMessage: (data: unknown) => void;
  private username: string;
  private password: string;

  constructor(username: string, password: string, onMessage: (data: unknown) => void) {
    this.username = username;
    this.password = password;
    this.onMessage = onMessage;
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
      },

      onStompError: (frame: IFrame) => {
        console.error("[STOMP] Error:", frame.headers["message"], frame.body);
      },

      onWebSocketError: (event: Event) => {
        console.error("[STOMP] WebSocket error:", event);
      },

      onDisconnect: () => {
        console.log("[STOMP] Disconnected");
      },
    });

    console.log("[STOMP] Connecting to Network Rail...");
    this.client.activate();
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
      } catch (err) {
        console.error("[STOMP] Failed to parse message:", err);
      }
    });

    console.log(`[STOMP] Subscribed to ${TRUST_TOPIC}`);
  }

  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }
}
