import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { deriveFeedStatus, NetworkRailStompClient } from "./stomp-client.js";
import { TrainStateManager } from "./train-state.js";
import { ClientWebSocketServer } from "./websocket-server.js";
import { parseTrustMessages } from "./trust-parser.js";
import type { StanoxLocation } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WS_PORT = parseInt(process.env.PORT || "8080", 10);
const NETWORK_RAIL_USERNAME = process.env.NETWORK_RAIL_USERNAME || "";
const NETWORK_RAIL_PASSWORD = process.env.NETWORK_RAIL_PASSWORD || "";

function loadStanoxLookup(): Record<string, StanoxLocation> {
  const lookupPaths = [
    path.resolve(__dirname, "../public/stanox-lookup.json"),
    path.resolve(__dirname, "../../public/stanox-lookup.json"),
  ];
  const lookupPath = lookupPaths.find((candidate) => fs.existsSync(candidate));

  if (!lookupPath) {
    console.warn(
      `[Server] stanox-lookup.json not found in ${lookupPaths.join(" or ")}, using empty lookup`,
    );
    return {};
  }

  const data = fs.readFileSync(lookupPath, "utf-8");
  return JSON.parse(data);
}

function main(): void {
  console.log("[Server] Starting TrainTracker server...");

  if (!NETWORK_RAIL_USERNAME || !NETWORK_RAIL_PASSWORD) {
    console.warn("[Server] NETWORK_RAIL_USERNAME or NETWORK_RAIL_PASSWORD not set");
    console.warn("[Server] Running without Network Rail connection (no live data)");
  }

  const stanoxLookup = loadStanoxLookup();
  console.log(`[Server] Loaded ${Object.keys(stanoxLookup).length} STANOX locations`);

  let stompClient: NetworkRailStompClient | null = null;

  const stateManager = new TrainStateManager(stanoxLookup, {
    onUpdate: (train) => wsServer?.broadcastUpdate(train),
    onRemove: (trainId) => wsServer?.broadcastRemove(trainId),
    onStats: (stats) => wsServer?.broadcastStats(stats),
  });

  const wsServer = new ClientWebSocketServer(WS_PORT, {
    getSnapshot: () => stateManager.getAllTrains(),
    getStats: () => stateManager.getStats(),
    getFeedStatus: () => stompClient?.getStatus() ?? deriveFeedStatus(false, null),
  });

  stateManager.start();
  wsServer.start();

  if (NETWORK_RAIL_USERNAME && NETWORK_RAIL_PASSWORD) {
    let eventCount = 0;
    let batchCount = 0;
    stompClient = new NetworkRailStompClient(
      NETWORK_RAIL_USERNAME,
      NETWORK_RAIL_PASSWORD,
      (data) => {
        const events = parseTrustMessages(data);
        batchCount++;
        for (const event of events) {
          eventCount++;
          stateManager.processEvent(event);
        }
        if (batchCount <= 5 || batchCount % 20 === 0) {
          console.log(`[Server] Batch #${batchCount}: ${events.length} events, total ${eventCount} events processed`);
        }
      },
      (status) => wsServer.broadcastFeedStatus(status),
    );
    stompClient.connect();
  }

  const shutdown = (): void => {
    console.log("[Server] Shutting down...");
    stompClient?.disconnect();
    stateManager.stop();
    wsServer.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  setInterval(() => {
    const trainCount = stateManager.getTrainCount();
    const clientCount = wsServer.getClientCount();
    const stompConnected = stompClient?.isConnected() ?? false;
    console.log(
      `[Server] Status: ${trainCount} trains, ${clientCount} clients, STOMP: ${stompConnected ? "connected" : "disconnected"}`
    );
  }, 60000);

  console.log(`[Server] Ready. WebSocket server on port ${WS_PORT}`);
}

main();
