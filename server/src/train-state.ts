import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { TrainState, TrainStats, ParsedTrainEvent, StanoxLocation, StopInfo } from "./types.js";
import { getStatusFromDelay } from "./trust-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PERSIST_INTERVAL_MS = 30 * 1000;
const MAX_RECENT_STOPS = 5;
const STATE_FILE_PATH = path.resolve(__dirname, "../data/train-state.json");

interface LegacyPersistedState {
  version: 1;
  savedAt: number;
  trains: TrainState[];
}

interface InternalTrainState extends TrainState {
  receivedAt: number;
}

interface PersistedState {
  version: 2;
  savedAt: number;
  lastUpdateAt: number | null;
  trains: InternalTrainState[];
}

export class TrainStateManager {
  private trains = new Map<string, InternalTrainState>();
  private stanoxLookup: Map<string, StanoxLocation>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private onUpdate: (train: TrainState) => void;
  private onRemove: (trainId: string) => void;
  private onStats: (stats: TrainStats) => void;
  private unknownStanoxCount = 0;
  private knownStanoxCount = 0;
  private lastUpdateAt: number | null = null;

  constructor(
    stanoxLookup: Record<string, StanoxLocation>,
    callbacks: {
      onUpdate: (train: TrainState) => void;
      onRemove: (trainId: string) => void;
      onStats: (stats: TrainStats) => void;
    }
  ) {
    this.stanoxLookup = new Map(Object.entries(stanoxLookup));
    this.onUpdate = callbacks.onUpdate;
    this.onRemove = callbacks.onRemove;
    this.onStats = callbacks.onStats;
  }

  start(): void {
    this.loadState();
    this.cleanupTimer = setInterval(() => this.cleanupStaleTrains(), CLEANUP_INTERVAL_MS);
    this.persistTimer = setInterval(() => this.saveState(), PERSIST_INTERVAL_MS);
    this.metricsTimer = setInterval(() => {
      if (this.unknownStanoxCount > 0 || this.knownStanoxCount > 0) {
        const total = this.unknownStanoxCount + this.knownStanoxCount;
        const pct = Math.round((this.knownStanoxCount / total) * 100);
        console.log(`[TrainState] STANOX hit rate: ${pct}% (${this.knownStanoxCount}/${total})`);
        this.unknownStanoxCount = 0;
        this.knownStanoxCount = 0;
      }
    }, 60000);
    console.log("[TrainState] State manager started");
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    this.saveState();
    console.log("[TrainState] State manager stopped");
  }

  private loadState(): void {
    try {
      if (!fs.existsSync(STATE_FILE_PATH)) {
        console.log("[TrainState] No saved state found, starting fresh");
        return;
      }

      const data = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      const state = JSON.parse(data) as PersistedState | LegacyPersistedState;

      if (state.version !== 1 && state.version !== 2) {
        console.warn("[TrainState] State version mismatch, starting fresh");
        return;
      }

      const now = Date.now();
      const maxAge = STALE_THRESHOLD_MS;
      let loadedCount = 0;

      const persistedTrains: InternalTrainState[] =
        state.version === 2
          ? state.trains
          : state.trains.map((train) => ({
              ...train,
              receivedAt: train.lastUpdate,
            }));

      for (const train of persistedTrains) {
        const age = now - train.receivedAt;
        if (age < maxAge) {
          this.trains.set(train.trainId, train);
          loadedCount++;
        }
      }

      this.lastUpdateAt =
        state.version === 2
          ? state.lastUpdateAt
          : persistedTrains.reduce<number | null>(
              (latest, train) => latest === null ? train.receivedAt : Math.max(latest, train.receivedAt),
              null,
            );

      console.log(`[TrainState] Loaded ${loadedCount} trains from saved state (saved ${Math.round((now - state.savedAt) / 1000)}s ago)`);
      this.broadcastStats();
    } catch (err) {
      console.error("[TrainState] Failed to load state:", err);
    }
  }

  private saveState(): void {
    try {
      const dir = path.dirname(STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const trains = Array.from(this.trains.values());
      const state: PersistedState = {
        version: 2,
        savedAt: Date.now(),
        lastUpdateAt: this.lastUpdateAt,
        trains,
      };

      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state));
      console.log(`[TrainState] Saved ${trains.length} trains to disk`);
    } catch (err) {
      console.error("[TrainState] Failed to save state:", err);
    }
  }

  processEvent(event: ParsedTrainEvent): void {
    switch (event.type) {
      case "activation":
        this.handleActivation(event);
        break;
      case "movement":
        this.handleMovement(event);
        break;
      case "cancellation":
        this.handleCancellation(event);
        break;
      case "reinstatement":
        this.handleActivation(event);
        break;
      case "identity_change":
        this.handleIdentityChange(event);
        break;
    }
  }

  private handleActivation(event: ParsedTrainEvent): void {
    if (!event.stanox) return;

    const location = this.stanoxLookup.get(event.stanox);
    if (!location) return;

    const originStop: StopInfo = {
      stanox: event.stanox,
      name: location.name,
      time: event.timestamp,
      eventType: "departure",
      delayMinutes: 0,
    };

    const receivedAt = Date.now();
    const train: InternalTrainState = {
      trainId: event.trainId,
      lat: location.lat,
      lng: location.lng,
      stanox: event.stanox,
      stationName: location.name,
      status: "on-time",
      delayMinutes: 0,
      lastUpdate: event.timestamp,
      tocId: event.tocId || "XX",
      eventType: "departure",
      origin: originStop,
      recentStops: [],
      receivedAt,
    };

    this.trains.set(event.trainId, train);
    this.lastUpdateAt = receivedAt;
    this.onUpdate(this.toExternalState(train));
    this.broadcastStats();
  }

  private handleMovement(event: ParsedTrainEvent): void {
    if (!event.stanox) return;

    const location = this.stanoxLookup.get(event.stanox);
    const existing = this.trains.get(event.trainId);

    if (location) {
      this.knownStanoxCount++;
    } else {
      this.unknownStanoxCount++;
    }

    if (!location && !existing) {
      return;
    }

    const delayMinutes = event.delayMinutes ?? existing?.delayMinutes ?? 0;
    const eventType = event.eventType || "departure";

    let recentStops = existing?.recentStops || [];
    let origin = existing?.origin;

    if (existing && existing.stanox !== event.stanox && location) {
      const previousStop: StopInfo = {
        stanox: existing.stanox,
        name: existing.stationName,
        time: existing.lastUpdate,
        eventType: existing.eventType,
        delayMinutes: existing.delayMinutes,
      };
      recentStops = [previousStop, ...recentStops].slice(0, MAX_RECENT_STOPS);
    }

    if (!origin && location) {
      origin = {
        stanox: event.stanox,
        name: location.name,
        time: event.timestamp,
        eventType,
        delayMinutes,
      };
    }

    const lat = location?.lat ?? existing?.lat;
    const lng = location?.lng ?? existing?.lng;

    if (lat === undefined || lng === undefined) {
      return;
    }

    const receivedAt = Date.now();
    const train: InternalTrainState = {
      trainId: event.trainId,
      lat,
      lng,
      stanox: location ? event.stanox : existing!.stanox,
      stationName: location ? location.name : existing!.stationName,
      status: getStatusFromDelay(delayMinutes),
      delayMinutes,
      lastUpdate: event.timestamp,
      tocId: event.tocId || existing?.tocId || "XX",
      eventType,
      terminated: event.terminated,
      platform: event.platform,
      origin: origin || existing?.origin,
      recentStops,
      receivedAt,
    };

    this.trains.set(event.trainId, train);
    this.lastUpdateAt = receivedAt;
    this.onUpdate(this.toExternalState(train));
    this.broadcastStats();
  }

  private handleCancellation(event: ParsedTrainEvent): void {
    if (this.trains.has(event.trainId)) {
      this.trains.delete(event.trainId);
      this.lastUpdateAt = Date.now();
      this.onRemove(event.trainId);
      this.broadcastStats();
    }
  }

  private handleIdentityChange(event: ParsedTrainEvent): void {
    if (!event.newTrainId) return;

    const existing = this.trains.get(event.trainId);
    if (existing) {
      this.trains.delete(event.trainId);
      this.onRemove(event.trainId);

      const receivedAt = Date.now();
      const updated: InternalTrainState = {
        ...existing,
        trainId: event.newTrainId,
        lastUpdate: event.timestamp,
        receivedAt,
      };
      this.trains.set(event.newTrainId, updated);
      this.lastUpdateAt = receivedAt;
      this.onUpdate(this.toExternalState(updated));
      this.broadcastStats();
    }
  }

  private cleanupStaleTrains(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, train] of this.trains) {
      const timeSinceReceived = now - train.receivedAt;
      if (timeSinceReceived > STALE_THRESHOLD_MS) {
        toRemove.push(id);
      }
    }

    if (toRemove.length > 0) {
      console.log(`[TrainState] Cleaning up ${toRemove.length} stale trains`);
      for (const id of toRemove) {
        this.trains.delete(id);
        this.onRemove(id);
      }
      this.broadcastStats();
    }
  }

  private toExternalState(train: InternalTrainState): TrainState {
    const { receivedAt, ...external } = train;
    void receivedAt;
    return external;
  }

  private broadcastStats(): void {
    this.onStats(this.getStats());
  }

  getStats(): TrainStats {
    let onTime = 0;
    let slightDelay = 0;
    let delayed = 0;

    for (const train of this.trains.values()) {
      switch (train.status) {
        case "on-time":
          onTime++;
          break;
        case "slight-delay":
          slightDelay++;
          break;
        case "delayed":
          delayed++;
          break;
      }
    }

    return {
      total: this.trains.size,
      onTime,
      slightDelay,
      delayed,
      lastUpdate: this.lastUpdateAt,
    };
  }

  getAllTrains(): TrainState[] {
    return Array.from(this.trains.values()).map(t => this.toExternalState(t));
  }

  getTrainCount(): number {
    return this.trains.size;
  }
}
