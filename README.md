# TrainTracker

TrainTracker maps train movements from Network Rail's TRUST feed. It shows the latest location the feed has reported for each service, colours it by timetable variation, and keeps a short history of recent stops.

The status badge is deliberately strict. `Live` means the browser can reach the TrainTracker backend, the backend's STOMP connection to Network Rail is open, and a feed message has arrived within the last two minutes. If that chain is unavailable, the map labels its synthetic demonstration data instead of presenting it as live railway data.

## Architecture

```text
Browser (React + MapLibre)
    │ WebSocket /api/ws
    ▼
Cloudflare Worker
    │ Durable Object binding
    ▼
Cloudflare Container (Node.js + ws)
    │ STOMP /topic/TRAIN_MVT_ALL_TOC
    ▼
Network Rail TRUST feed
```

The Worker serves the built frontend and sends `/api/` requests to the Node.js server in a Cloudflare Container. The server parses five TRUST message types:

- `0001` — activation
- `0002` — cancellation
- `0003` — movement
- `0005` — reinstatement
- `0007` — identity change

When a browser connects, the server sends one full snapshot containing the current in-memory train state, its real last-update time, and Network Rail feed health. Subsequent train changes are sent as deltas. Feed-health messages are separate, so an open browser WebSocket is never mistaken for a current upstream feed.

The server writes a warm-state cache to its filesystem every 30 seconds and removes trains that have received no update for two hours. The persisted receipt times are retained when that cache is loaded; reading or re-saving the cache does not make old state look new. This file is not Durable Object storage and should not be treated as durable across replacement of a Cloudflare Container instance.

The generated lookup currently contains **12,327 STANOX operating locations** with coordinates. These include stations, junctions, sidings, and other railway locations; they are not 12,327 passenger stations. It is built by joining Network Rail CORPUS data to the coordinate workbook in `data/`:

```bash
pnpm exec tsx scripts/build-stanox-lookup.ts
```

## Connection and fallback behaviour

- The backend's STOMP client retries Network Rail every five seconds.
- The browser retries the TrainTracker WebSocket every three seconds.
- After three failed browser connections, or whenever the backend reports that the upstream feed is not current, the UI shows a clearly labelled 12-train synthetic dataset.
- Retries continue while synthetic data is visible. A current Network Rail status switches the map back to the latest live snapshot and deltas automatically.
- Synthetic train, location, and operator IDs use the reserved `synthetic:` prefix and cannot be confused with real STANOX identifiers.

## Local development

### Prerequisites

- Node.js 22
- pnpm 9
- A [Network Rail Data Feeds](https://datafeeds.networkrail.co.uk/) account for live data

Install both workspaces:

```bash
pnpm install
pnpm --dir server install
```

Start the backend with credentials in its environment:

```bash
export NETWORK_RAIL_USERNAME='your-account'
export NETWORK_RAIL_PASSWORD='your-password'
pnpm --dir server dev
```

In another terminal, start Vite. Its development proxy forwards `/api/ws` to the backend on port 8080:

```bash
pnpm dev
```

Open `http://localhost:5173`.

Without Network Rail credentials the backend still starts, reports the upstream feed as unavailable, and the browser uses labelled demonstration data.

## Build, test, and deployment

```bash
pnpm test
pnpm build
pnpm --dir server typecheck
```

The production build uses Cloudflare Workers, Containers, and a Durable Object binding. Store the two credentials as Worker secrets, build the static assets, then deploy:

Deploying the Container also requires the Docker CLI and a running Docker-compatible daemon.

```bash
pnpm exec wrangler secret put NETWORK_RAIL_USERNAME
pnpm exec wrangler secret put NETWORK_RAIL_PASSWORD
pnpm build
pnpm exec wrangler deploy
```

## Project structure

```text
src/                         React frontend and Cloudflare Worker
server/src/                  Node.js TRUST and WebSocket backend
public/stanox-lookup.json    Generated railway-location lookup
scripts/                     Lookup-generation tooling
data/                        Source data used by the generator
tests/                       Provenance, liveness, and UI tests
Dockerfile                   Cloudflare Container image
wrangler.toml                Worker, Container, and Durable Object config
```

TrainTracker uses Network Rail data but is not affiliated with Network Rail or any train operating company.
