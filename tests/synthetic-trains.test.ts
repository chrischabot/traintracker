import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createSyntheticTrainDataset,
  isSyntheticIdentifier,
} from "../src/lib/synthetic-trains";

describe("synthetic train data", () => {
  it("keeps every fixture identifier in the reserved synthetic namespace", () => {
    const dataset = createSyntheticTrainDataset(1_700_000_000_000);
    const trainIds = dataset.trains.map((train) => train.trainId);
    const locationIds = dataset.trains.flatMap((train) => [
      train.stanox,
      ...(train.origin ? [train.origin.stanox] : []),
      ...train.recentStops.map((stop) => stop.stanox),
    ]);
    const operatorIds = dataset.trains.map((train) => train.tocId);

    expect(dataset.source).toBe("synthetic");
    expect([...trainIds, ...locationIds, ...operatorIds].every(isSyntheticIdentifier)).toBe(true);
    expect(new Set(trainIds).size).toBe(trainIds.length);
  });

  it("cannot collide with a real STANOX in the generated lookup", () => {
    const dataset = createSyntheticTrainDataset();
    const lookup = JSON.parse(
      readFileSync(new URL("../public/stanox-lookup.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;

    const locationIds = dataset.trains.flatMap((train) => [
      train.stanox,
      ...(train.origin ? [train.origin.stanox] : []),
      ...train.recentStops.map((stop) => stop.stanox),
    ]);

    expect(locationIds.some((identifier) => identifier in lookup)).toBe(false);
    expect(locationIds).not.toContain("87701");
  });
});
