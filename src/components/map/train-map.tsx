import { Map, MapControls, MapMarker, MarkerContent, MarkerTooltip } from "@/components/ui/map";
import type { TrainState, StopInfo } from "@/types/train";
import { STATUS_COLORS } from "@/types/train";
import { getTocName } from "@/lib/toc";

interface TrainMapProps {
  trains: TrainState[];
}

const UK_CENTER: [number, number] = [-2.5, 54.5];
const INITIAL_ZOOM = 6;

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDelay(minutes: number): string {
  if (minutes <= 0) return "";
  return `+${minutes}`;
}

export function TrainMap({ trains }: TrainMapProps) {
  return (
    <Map center={UK_CENTER} zoom={INITIAL_ZOOM} maxZoom={18} minZoom={4}>
      <MapControls position="bottom-right" showZoom showCompass />
      {trains.map((train) => (
        <TrainMarker key={train.trainId} train={train} />
      ))}
    </Map>
  );
}

interface TrainMarkerProps {
  train: TrainState;
}

function TrainMarker({ train }: TrainMarkerProps) {
  const color = STATUS_COLORS[train.status];

  return (
    <MapMarker longitude={train.lng} latitude={train.lat}>
      <MarkerContent>
        <div
          className="h-2.5 w-2.5 rounded-full border border-white/70 shadow-sm"
          style={{ backgroundColor: color }}
        />
      </MarkerContent>
      <MarkerTooltip>
        <TrainTooltipContent train={train} />
      </MarkerTooltip>
    </MapMarker>
  );
}

function TrainTooltipContent({ train }: { train: TrainState }) {
  const recentStops = (train.recentStops || []).slice(0, 2);
  const statusColor = STATUS_COLORS[train.status];

  const currentStop: StopInfo = {
    stanox: train.stanox,
    name: train.stationName,
    time: train.lastUpdate,
    eventType: train.eventType,
    delayMinutes: train.delayMinutes,
  };

  const originDifferent = train.origin && train.origin.stanox !== train.stanox;
  const allStops = [
    ...(originDifferent ? [{ stop: train.origin!, type: "origin" as const }] : []),
    ...recentStops.map((stop) => ({ stop, type: "past" as const })),
    { stop: currentStop, type: "current" as const },
  ];

  return (
    <div className="min-w-[200px] overflow-hidden rounded-lg bg-zinc-900 shadow-xl">
      <div className="border-b border-zinc-700/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
          />
          <span className="text-sm font-medium text-white">{getTocName(train.tocId)}</span>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">{train.trainId}</span>
      </div>

      <div className="relative px-3 py-2.5">
        {allStops.length > 1 && (
          <div
            className="absolute w-px bg-zinc-700"
            style={{
              left: "18px",
              top: "20px",
              bottom: "20px",
            }}
          />
        )}

        <div className="relative space-y-0">
          {allStops.map(({ stop, type }, i) => (
            <StopRow
              key={`${stop.stanox}-${i}`}
              stop={stop}
              type={type}
              isLast={i === allStops.length - 1}
              platform={type === "current" ? train.platform : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface StopRowProps {
  stop: StopInfo;
  type: "origin" | "past" | "current";
  isLast?: boolean;
  platform?: string;
}

function StopRow({ stop, type, isLast, platform }: StopRowProps) {
  const delay = formatDelay(stop.delayMinutes);
  const isOrigin = type === "origin";
  const isPast = type === "past";
  const isCurrent = type === "current";
  const eventLabel = stop.eventType === "arrival" ? "Arr" : "Dep";

  return (
    <div className={`relative flex items-start gap-2.5 ${isLast ? "pb-0" : "pb-3"}`}>
      <div className="relative z-10 flex h-4 w-4 items-center justify-center">
        {isCurrent ? (
          <div className="relative flex items-center justify-center">
            <div className="absolute h-3 w-3 animate-ping rounded-full bg-emerald-500/30" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
        ) : isOrigin ? (
          <div className="h-2 w-2 rounded-full border-[1.5px] border-zinc-500 bg-zinc-800" />
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isPast ? "opacity-40" : ""}`}>
        <div
          className={`truncate leading-tight ${
            isCurrent ? "text-[13px] font-medium text-white" : "text-xs text-zinc-400"
          }`}
        >
          {stop.name}
        </div>
        <div className="flex items-center gap-1.5">
          {isCurrent && (
            <span className="text-[10px] font-medium text-zinc-400">{eventLabel}</span>
          )}
          <span className="font-mono text-[10px] text-zinc-500">
            {formatTime(stop.time)}
          </span>
          {delay && (
            <span className="text-[10px] font-medium text-amber-400">{delay}</span>
          )}
          {isCurrent && platform && (
            <span className="text-[10px] text-zinc-500">Plat {platform}</span>
          )}
        </div>
      </div>
    </div>
  );
}
