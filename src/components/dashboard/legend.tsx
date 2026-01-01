import { Card, CardContent } from "@/components/ui/card";

const LEGEND_ITEMS = [
  { color: "#22c55e", label: "On time" },
  { color: "#eab308", label: "1-5 min late" },
  { color: "#ef4444", label: "5+ min late" },
] as const;

export function Legend() {
  return (
    <Card className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur-sm py-2 px-0 gap-0">
      <CardContent className="p-0 px-3 space-y-1.5">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full border border-white/50"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
