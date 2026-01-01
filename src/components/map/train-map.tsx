import { Map, MapControls, MapMarker, MarkerContent, MarkerTooltip } from "@/components/ui/map";
import type { TrainState } from "@/types/train";
import { STATUS_COLORS } from "@/types/train";

interface TrainMapProps {
  trains: TrainState[];
}

const UK_CENTER: [number, number] = [-2.5, 54.5];
const INITIAL_ZOOM = 6;

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
        <div className="space-y-0.5">
          <div className="font-medium">{train.trainId}</div>
          <div className="text-muted-foreground">
            {train.delayMinutes > 0 ? `${train.delayMinutes} min late` : "On time"}
          </div>
        </div>
      </MarkerTooltip>
    </MapMarker>
  );
}
