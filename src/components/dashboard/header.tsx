import { Train } from "lucide-react";

export function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 h-12 bg-background/80 backdrop-blur-sm border-b border-border flex items-center px-4">
      <div className="flex items-center gap-2">
        <Train className="h-5 w-5 text-green-500" />
        <h1 className="text-lg font-semibold">TrainTracker</h1>
      </div>
    </header>
  );
}
