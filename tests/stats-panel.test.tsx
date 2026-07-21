import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatsPanel } from "../src/components/dashboard/stats-panel";

function renderStatus(connected: boolean, dataSource: "live" | "synthetic" | null) {
  return renderToStaticMarkup(
    <StatsPanel
      total={12}
      lastUpdate={1_700_000_000_000}
      connected={connected}
      dataSource={dataSource}
    />,
  );
}

describe("StatsPanel data status", () => {
  it("never labels synthetic fallback data as live", () => {
    const markup = renderStatus(true, "synthetic");

    expect(markup).toContain("Demo data");
    expect(markup).not.toContain(">Live<");
  });

  it("only labels connected live data as live", () => {
    expect(renderStatus(true, "live")).toContain(">Live<");
    expect(renderStatus(false, "live")).toContain("Reconnecting...");
    expect(renderStatus(true, null)).toContain("Waiting for data...");
  });
});
