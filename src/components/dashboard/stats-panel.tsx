import { Card, CardContent } from "@/components/ui/card";
import type { TrainDataSource } from "@/types/train";

interface StatsPanelProps {
  total: number;
  lastUpdate: number | null;
  connected: boolean;
  dataSource: TrainDataSource;
}

export function getDataStatus(connected: boolean, dataSource: TrainDataSource) {
  if (dataSource === "synthetic") {
    return { label: "Demo data", dotClassName: "bg-amber-500" };
  }

  if (connected && dataSource === "live") {
    return { label: "Live", dotClassName: "bg-green-500" };
  }

  if (connected) {
    return { label: "Waiting for data...", dotClassName: "bg-amber-500 animate-pulse" };
  }

  return { label: "Reconnecting...", dotClassName: "bg-red-500 animate-pulse" };
}

export function StatsPanel({ total, lastUpdate, connected, dataSource }: StatsPanelProps) {
  const timeAgo = lastUpdate
    ? `${Math.round((Date.now() - lastUpdate) / 1000)}s ago`
    : "—";
  const dataStatus = getDataStatus(connected, dataSource);

  return (
    <Card className="absolute top-16 left-4 z-10 bg-background/90 backdrop-blur-sm py-3 px-0 gap-1 min-w-[140px]">
      <CardContent className="p-0 px-4">
        <div className="text-2xl font-bold tabular-nums">{total.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground">trains</div>
      </CardContent>
      <CardContent className="p-0 px-4 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${dataStatus.dotClassName}`}
          />
          {dataStatus.label}
        </div>
        <div className="text-xs text-muted-foreground/70">{timeAgo}</div>
      </CardContent>
    </Card>
  );
}
