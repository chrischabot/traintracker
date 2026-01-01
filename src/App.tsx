import { ThemeProvider } from "@/components/providers/theme-provider";
import { Header } from "@/components/dashboard/header";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { Legend } from "@/components/dashboard/legend";
import { TrainMap } from "@/components/map/train-map";
import { useTrainSocket } from "@/hooks/use-train-socket";

function App() {
  const { trains, stats, connected } = useTrainSocket();

  return (
    <ThemeProvider>
      <div className="h-screen w-screen overflow-hidden bg-background">
        <Header />
        <div className="absolute inset-0 pt-12">
          <TrainMap trains={trains} />
        </div>
        <StatsPanel total={stats.total} lastUpdate={stats.lastUpdate} connected={connected} />
        <Legend />
      </div>
    </ThemeProvider>
  );
}

export default App;
