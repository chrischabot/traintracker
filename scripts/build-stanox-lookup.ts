import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";
// @ts-expect-error - geodesy types incomplete
import OsGridRef from "geodesy/osgridref.js";

const DATA_DIR = path.join(import.meta.dirname, "../data");
const OUTPUT_PATH = path.join(import.meta.dirname, "../public/stanox-lookup.json");

interface CorpusEntry {
  STANOX: string;
  TIPLOC: string;
  "3ALPHA": string;
  NLC: number;
  NLCDESC: string;
}

interface TiplocCoord {
  TIPLOC: string;
  EASTING: number;
  NORTHING: number;
}

interface StanoxLocation {
  lat: number;
  lng: number;
  name: string;
  crs?: string;
  tiploc: string;
}

function bngToLatLng(easting: number, northing: number): { lat: number; lng: number } | null {
  try {
    const gridRef = new OsGridRef(easting, northing);
    const latLon = gridRef.toLatLon();
    return {
      lat: Math.round(latLon.lat * 1000000) / 1000000,
      lng: Math.round(latLon.lon * 1000000) / 1000000,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log("Building STANOX lookup...\n");

  console.log("Loading CORPUS data...");
  const corpusPath = path.join(DATA_DIR, "corpus.json");
  const corpusRaw = fs.readFileSync(corpusPath, "utf-8");
  const corpus: { TIPLOCDATA: CorpusEntry[] } = JSON.parse(corpusRaw);
  console.log(`  Loaded ${corpus.TIPLOCDATA.length} CORPUS entries`);

  const tiplocToCorpus = new Map<string, CorpusEntry>();
  let stanoxCount = 0;
  for (const entry of corpus.TIPLOCDATA) {
    const stanox = entry.STANOX?.trim();
    const tiploc = entry.TIPLOC?.trim();
    if (stanox && tiploc && stanox !== " ") {
      tiplocToCorpus.set(tiploc, entry);
      stanoxCount++;
    }
  }
  console.log(`  ${stanoxCount} entries have valid STANOX codes`);

  console.log("\nLoading TIPLOC coordinates...");
  const xlsxPath = path.join(DATA_DIR, "tiploc_coords.xlsx");
  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const tiplocCoords: TiplocCoord[] = XLSX.utils.sheet_to_json(sheet);
  console.log(`  Loaded ${tiplocCoords.length} TIPLOC coordinates`);

  const tiplocToCoords = new Map<string, TiplocCoord>();
  for (const coord of tiplocCoords) {
    const tiploc = coord.TIPLOC?.toString().trim();
    if (tiploc && coord.EASTING && coord.NORTHING) {
      tiplocToCoords.set(tiploc, coord);
    }
  }
  console.log(`  ${tiplocToCoords.size} TIPLOCs have valid coordinates`);

  console.log("\nMerging and converting coordinates...");
  const stanoxLookup: Record<string, StanoxLocation> = {};
  let matched = 0;
  let converted = 0;
  let failed = 0;

  for (const [tiploc, corpusEntry] of tiplocToCorpus) {
    const coords = tiplocToCoords.get(tiploc);
    if (!coords) continue;
    matched++;

    const latLng = bngToLatLng(coords.EASTING, coords.NORTHING);
    if (!latLng) {
      failed++;
      continue;
    }

    const stanox = corpusEntry.STANOX.trim();
    const crs = corpusEntry["3ALPHA"]?.trim();

    if (!stanoxLookup[stanox] || (crs && crs !== " ")) {
      stanoxLookup[stanox] = {
        lat: latLng.lat,
        lng: latLng.lng,
        name: corpusEntry.NLCDESC?.trim() || tiploc,
        tiploc,
        ...(crs && crs !== " " ? { crs } : {}),
      };
      converted++;
    }
  }

  console.log(`  Matched ${matched} TIPLOCs with coordinates`);
  console.log(`  Converted ${converted} unique STANOX locations`);
  console.log(`  Failed conversions: ${failed}`);

  console.log("\nWriting output...");
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stanoxLookup, null, 2));
  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`  Written to ${OUTPUT_PATH}`);
  console.log(`  File size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`  Total STANOX locations: ${Object.keys(stanoxLookup).length}`);

  console.log("\nSample entries:");
  const sampleKeys = Object.keys(stanoxLookup).slice(0, 5);
  for (const key of sampleKeys) {
    console.log(`  ${key}: ${JSON.stringify(stanoxLookup[key])}`);
  }
}

main().catch(console.error);
