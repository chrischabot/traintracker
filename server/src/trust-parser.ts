import type { TrustMessage, ParsedTrainEvent } from "./types.js";

export function parseTrustMessages(raw: unknown): ParsedTrainEvent[] {
  const events: ParsedTrainEvent[] = [];

  try {
    const messages = Array.isArray(raw) ? raw : [raw];

    for (const msg of messages) {
      const trustMsg = msg as TrustMessage;
      const msgType = trustMsg.header?.msg_type;
      const body = trustMsg.body;

      if (!msgType || !body?.train_id) continue;

      switch (msgType) {
        case "0001":
          events.push({
            type: "activation",
            trainId: body.train_id,
            stanox: body.sched_origin_stanox || body.tp_origin_stanox,
            timestamp: parseTimestamp(body.creation_timestamp || body.tp_origin_timestamp),
            tocId: body.toc_id,
          });
          break;

        case "0002":
          events.push({
            type: "cancellation",
            trainId: body.train_id,
            timestamp: parseTimestamp(body.canx_timestamp),
          });
          break;

        case "0003":
          events.push({
            type: "movement",
            trainId: body.train_id,
            stanox: body.loc_stanox,
            timestamp: parseTimestamp(body.actual_timestamp),
            delayMinutes: parseVariation(body.timetable_variation, body.variation_status),
            eventType: body.event_type?.toLowerCase() as "arrival" | "departure",
            terminated: body.train_terminated === "true",
            tocId: body.toc_id,
            platform: body.platform || undefined,
          });
          break;

        case "0005":
          events.push({
            type: "reinstatement",
            trainId: body.train_id,
            stanox: body.loc_stanox,
            timestamp: parseTimestamp(body.original_loc_timestamp),
            tocId: body.toc_id,
          });
          break;

        case "0007":
          events.push({
            type: "identity_change",
            trainId: body.train_id,
            newTrainId: body.current_train_id,
            timestamp: Date.now(),
          });
          break;
      }
    }
  } catch (err) {
    console.error("[TRUST Parser] Error parsing message:", err);
  }

  return events;
}

function parseTimestamp(ts: string | undefined): number {
  if (!ts) return Date.now();
  const parsed = parseInt(ts, 10);
  return isNaN(parsed) ? Date.now() : parsed;
}

function parseVariation(variation: string | undefined, status: string | undefined): number {
  if (!variation) return 0;

  const minutes = parseInt(variation, 10);
  if (isNaN(minutes)) return 0;

  if (status === "EARLY") {
    return -Math.abs(minutes);
  }

  return Math.abs(minutes);
}

export function getStatusFromDelay(delayMinutes: number): "on-time" | "slight-delay" | "delayed" {
  if (delayMinutes <= 0) return "on-time";
  if (delayMinutes <= 5) return "slight-delay";
  return "delayed";
}
