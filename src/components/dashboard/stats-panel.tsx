import { Card, CardContent } from "@/components/ui/card";

interface StatsPanelProps {
  total: number;
  lastUpdate: number | null;
  connected?: boolean;
}

export function StatsPanel({ total, lastUpdate, connected = true }: StatsPanelProps) {
  const timeAgo = lastUpdate
    ? `${Math.round((Date.now() - lastUpdate) / 1000)}s ago`
    : "—";

  return (
    <Card className="absolute top-16 left-4 z-10 bg-background/90 backdrop-blur-sm py-3 px-0 gap-1 min-w-[140px]">
      <CardContent className="p-0 px-4">
        <div className="text-2xl font-bold tabular-nums">{total.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground">trains</div>
      </CardContent>
      <CardContent className="p-0 px-4 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500 animate-pulse"}`}
          />
          {connected ? "Live" : "Reconnecting..."}
        </div>
        <div className="text-xs text-muted-foreground/70">{timeAgo}</div>
      </CardContent>
    </Card>
  );
}
