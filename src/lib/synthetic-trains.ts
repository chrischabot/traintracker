import type { TrainDataSource, TrainState, TrainStats } from "@/types/train";

export const SYNTHETIC_IDENTIFIER_PREFIX = "synthetic:";

const SYNTHETIC_OPERATOR_ID = `${SYNTHETIC_IDENTIFIER_PREFIX}operator:demo`;

export interface SyntheticTrainDataset {
  source: Extract<TrainDataSource, "synthetic">;
  trains: TrainState[];
  stats: TrainStats;
}

function trainId(sequence: number): string {
  return `${SYNTHETIC_IDENTIFIER_PREFIX}train:${sequence.toString().padStart(3, "0")}`;
}

function locationId(slug: string): string {
  return `${SYNTHETIC_IDENTIFIER_PREFIX}location:${slug}`;
}

export function isSyntheticIdentifier(identifier: string): boolean {
  return identifier.startsWith(SYNTHETIC_IDENTIFIER_PREFIX);
}

export function createSyntheticTrainDataset(now = Date.now()): SyntheticTrainDataset {
  const trains: TrainState[] = [
    {
      trainId: trainId(1), lat: 51.5074, lng: -0.1278, stanox: locationId("london-euston"), stationName: "London Euston", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "departure",
      origin: { stanox: locationId("manchester-piccadilly"), name: "Manchester Piccadilly", time: now - 7200000, eventType: "departure", delayMinutes: 0 },
      recentStops: [
        { stanox: locationId("milton-keynes-central"), name: "Milton Keynes Central", time: now - 1800000, eventType: "departure", delayMinutes: 0 },
      ],
    },
    {
      trainId: trainId(2), lat: 51.4545, lng: -2.5879, stanox: locationId("bristol-temple-meads"), stationName: "Bristol Temple Meads", status: "slight-delay", delayMinutes: 3, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "arrival",
      origin: { stanox: locationId("london-paddington"), name: "London Paddington", time: now - 5400000, eventType: "departure", delayMinutes: 0 },
      recentStops: [
        { stanox: locationId("bath-spa"), name: "Bath Spa", time: now - 900000, eventType: "departure", delayMinutes: 2 },
      ],
    },
    {
      trainId: trainId(3), lat: 53.4808, lng: -2.2426, stanox: locationId("manchester-oxford-road"), stationName: "Manchester Oxford Road", status: "delayed", delayMinutes: 12, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "departure",
      origin: { stanox: locationId("liverpool-lime-street"), name: "Liverpool Lime Street", time: now - 3600000, eventType: "departure", delayMinutes: 5 },
      recentStops: [],
    },
    { trainId: trainId(4), lat: 52.4862, lng: -1.8904, stanox: locationId("birmingham-new-street"), stationName: "Birmingham New Street", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "arrival", recentStops: [] },
    { trainId: trainId(5), lat: 55.9533, lng: -3.1883, stanox: locationId("edinburgh-waverley"), stationName: "Edinburgh Waverley", status: "slight-delay", delayMinutes: 2, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "departure", recentStops: [] },
    { trainId: trainId(6), lat: 53.8008, lng: -1.5491, stanox: locationId("leeds"), stationName: "Leeds", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "arrival", recentStops: [] },
    { trainId: trainId(7), lat: 50.9097, lng: -1.4044, stanox: locationId("southampton-central"), stationName: "Southampton Central", status: "delayed", delayMinutes: 8, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "departure", recentStops: [] },
    { trainId: trainId(8), lat: 51.4816, lng: -3.1791, stanox: locationId("cardiff-central"), stationName: "Cardiff Central", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "arrival", recentStops: [] },
    { trainId: trainId(9), lat: 51.5312, lng: -0.1248, stanox: locationId("london-kings-cross"), stationName: "King's Cross", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "departure", recentStops: [] },
    { trainId: trainId(10), lat: 51.5030, lng: -0.0136, stanox: locationId("canary-wharf"), stationName: "Canary Wharf", status: "slight-delay", delayMinutes: 4, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "arrival", recentStops: [] },
    { trainId: trainId(11), lat: 51.5172, lng: -0.0801, stanox: locationId("london-liverpool-street"), stationName: "Liverpool Street", status: "on-time", delayMinutes: 0, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "departure", recentStops: [] },
    { trainId: trainId(12), lat: 51.4636, lng: -0.1139, stanox: locationId("london-victoria"), stationName: "Victoria", status: "delayed", delayMinutes: 15, lastUpdate: now, tocId: SYNTHETIC_OPERATOR_ID, eventType: "arrival", recentStops: [] },
  ];

  return {
    source: "synthetic",
    trains,
    stats: {
      total: trains.length,
      onTime: trains.filter((train) => train.status === "on-time").length,
      slightDelay: trains.filter((train) => train.status === "slight-delay").length,
      delayed: trains.filter((train) => train.status === "delayed").length,
      lastUpdate: now,
    },
  };
}
