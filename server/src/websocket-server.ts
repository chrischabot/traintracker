import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";
import type { FeedStatus, TrainState, TrainStats, ServerMessage, ClientMessage } from "./types.js";

const PING_INTERVAL_MS = 30000;

export class ClientWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private clientIsAlive = new WeakMap<WebSocket, boolean>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private getSnapshot: () => TrainState[];
  private getStats: () => TrainStats;
  private getFeedStatus: () => FeedStatus;

  constructor(
    port: number,
    callbacks: {
      getSnapshot: () => TrainState[];
      getStats: () => TrainStats;
      getFeedStatus: () => FeedStatus;
    }
  ) {
    this.getSnapshot = callbacks.getSnapshot;
    this.getStats = callbacks.getStats;
    this.getFeedStatus = callbacks.getFeedStatus;

    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on("error", (error: Error) => {
      console.error("[WS Server] Error:", error);
    });

    console.log(`[WS Server] Listening on port ${port}`);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS Server] Client connected from ${clientIp}`);

    this.clients.add(ws);
    this.clientIsAlive.set(ws, true);

    const snapshot = this.getSnapshot();
    const snapshotMsg: ServerMessage = {
      type: "snapshot",
      trains: snapshot,
      stats: this.getStats(),
      feed: this.getFeedStatus(),
    };
    ws.send(JSON.stringify(snapshotMsg));

    ws.on("message", (data: RawData) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        if (message.type === "ping") {
          const pong: ServerMessage = { type: "pong" };
          ws.send(JSON.stringify(pong));
        }
      } catch {
        void 0;
      }
    });

    ws.on("pong", () => {
      this.clientIsAlive.set(ws, true);
    });

    ws.on("close", () => {
      console.log(`[WS Server] Client disconnected from ${clientIp}`);
      this.clients.delete(ws);
    });

    ws.on("error", (error: Error) => {
      console.error(`[WS Server] Client error from ${clientIp}:`, error);
      this.clients.delete(ws);
    });
  }

  start(): void {
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (this.clientIsAlive.get(client) === false) {
          this.clients.delete(client);
          client.terminate();
          continue;
        }

        if (client.readyState !== WebSocket.OPEN) continue;
        this.clientIsAlive.set(client, false);
        client.ping();
      }
    }, PING_INTERVAL_MS);
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    this.wss.close();
    console.log("[WS Server] Stopped");
  }

  broadcastUpdate(train: TrainState): void {
    const msg: ServerMessage = { type: "update", train };
    this.broadcast(msg);
  }

  broadcastRemove(trainId: string): void {
    const msg: ServerMessage = { type: "remove", trainId };
    this.broadcast(msg);
  }

  broadcastStats(stats: TrainStats): void {
    const msg: ServerMessage = {
      type: "stats",
      total: stats.total,
      onTime: stats.onTime,
      slightDelay: stats.slightDelay,
      delayed: stats.delayed,
      lastUpdate: stats.lastUpdate,
    };
    this.broadcast(msg);
  }

  broadcastFeedStatus(feed: FeedStatus): void {
    this.broadcast({ type: "feed_status", feed });
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
