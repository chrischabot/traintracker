# TrainTracker - Implementation Plan

## Overview

Real-time UK train tracking dashboard with trains displayed as colored dots on a dark map.

**Stack:**
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + mapcn
- Backend: Cloudflare Pages + Pages Functions + Durable Objects
- Data: Network Rail STOMP feed (TRUST)
- Map: MapLibre GL with dark theme

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + MapLibre)                                 │
│  • shadcn dashboard layout                                  │
│  • mapcn Map component with train markers                   │
│  • WebSocket connection to /api/ws                          │
│  • Local state: Map<trainId, TrainState>                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages Functions                                 │
│  • /api/ws → Upgrade to Durable Object WebSocket            │
│  • /api/stations → Static reference data                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Durable Object: TrainHub                                   │
│                                                             │
│  State:                                                     │
│  • trains: Map<trainId, TrainState>                         │
│  • stationCoords: Map<stanox, {lat, lng}>                   │
│  • lastCleanup: timestamp                                   │
│                                                             │
│  Connections:                                                │
│  • Outbound: STOMP to Network Rail                          │
│  • Inbound: Hibernatable client WebSockets                  │
│                                                             │
│  Logic:                                                     │
│  • Parse TRUST messages                                     │
│  • Update train positions                                   │
│  • Broadcast deltas to clients                              │
│  • TTL-based cleanup (30 min stale threshold)               │
└─────────────────────┬───────────────────────────────────────┘
                      │ STOMP
                      ▼
         Network Rail TRUST Feed
         /topic/TRAIN_MVT_ALL_TOC
```

---

## Data Models

### TrainState
```typescript
interface TrainState {
  trainId: string;           // 10-char TRUST ID e.g. "515G531I24"
  lat: number;
  lng: number;
  stanox: string;            // Current location code
  status: 'on-time' | 'slight-delay' | 'delayed';
  delayMinutes: number;      // timetable_variation from TRUST
  lastUpdate: number;        // Unix timestamp
  tocId: string;             // Train Operating Company
  eventType: 'arrival' | 'departure';
  terminated: boolean;
}
```

### Status Color Mapping
```typescript
const STATUS_COLORS = {
  'on-time': '#22c55e',      // Green (variation <= 0)
  'slight-delay': '#eab308', // Amber (1-5 min late)  
  'delayed': '#ef4444',      // Red (>5 min late)
} as const;

function getStatus(variation: number): TrainState['status'] {
  if (variation <= 0) return 'on-time';
  if (variation <= 5) return 'slight-delay';
  return 'delayed';
}
```

### TRUST Message Handling
```typescript
type TrustMessageType = 
  | '0001'  // Train Activation → create entry
  | '0002'  // Train Cancellation → remove entry
  | '0003'  // Train Movement → update position
  | '0005'  // Train Reinstatement → re-add
  | '0006'  // Change of Origin
  | '0007'  // Change of Identity → update trainId mapping
  | '0008'; // Change of Location

interface TrustMessage {
  header: { msg_type: TrustMessageType };
  body: {
    train_id: string;
    loc_stanox: string;
    actual_timestamp: string;
    timetable_variation: string;
    variation_status: string;
    event_type: 'ARRIVAL' | 'DEPARTURE';
    train_terminated: string;
    toc_id: string;
  };
}
```

---

## Train Lifecycle Management

### Entry Creation
- **Activation (0001)**: Create new entry with initial position
- **Movement (0003)**: Create if not exists, update if exists
- **Reinstatement (0005)**: Re-create previously cancelled entry

### Entry Updates
- **Movement (0003)**: Update lat/lng, delay, timestamp
- **Change of Identity (0007)**: Map old ID → new ID

### Entry Removal
```typescript
function shouldRemoveTrain(train: TrainState, now: number): boolean {
  // 1. Explicit termination
  if (train.terminated) return true;
  
  // 2. TTL expiry (no update in 30 minutes)
  const STALE_THRESHOLD_MS = 30 * 60 * 1000;
  if (now - train.lastUpdate > STALE_THRESHOLD_MS) return true;
  
  return false;
}

// On cancellation message (0002)
function handleCancellation(trainId: string) {
  trains.delete(trainId);
  broadcastRemoval(trainId);
}

// Periodic cleanup (every 5 minutes)
function cleanupStaleTrains() {
  const now = Date.now();
  for (const [id, train] of trains) {
    if (shouldRemoveTrain(train, now)) {
      trains.delete(id);
      broadcastRemoval(id);
    }
  }
}
```

---

## Project Structure

```
traintracker/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── map.tsx            # mapcn component
│   │   │   └── ...
│   │   ├── dashboard/
│   │   │   ├── header.tsx         # App header with logo
│   │   │   ├── stats-panel.tsx    # Train count, update indicator
│   │   │   └── legend.tsx         # Color legend
│   │   ├── map/
│   │   │   ├── train-map.tsx      # Main map with markers
│   │   │   └── train-marker.tsx   # Individual train dot
│   │   └── providers/
│   │       └── train-provider.tsx # WebSocket + state management
│   ├── hooks/
│   │   ├── use-trains.ts          # Train state hook
│   │   └── use-websocket.ts       # WebSocket connection hook
│   ├── lib/
│   │   ├── utils.ts               # shadcn utils
│   │   ├── train-utils.ts         # Status calculations
│   │   └── constants.ts           # Colors, thresholds
│   ├── types/
│   │   └── train.ts               # TypeScript interfaces
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                  # Tailwind imports
├── functions/
│   └── api/
│       ├── ws.ts                  # WebSocket upgrade endpoint
│       └── _middleware.ts         # CORS, auth
├── worker/
│   ├── durable-objects/
│   │   └── train-hub.ts           # Main Durable Object
│   ├── lib/
│   │   ├── stomp-client.ts        # STOMP protocol handler
│   │   ├── trust-parser.ts        # TRUST message parser
│   │   └── station-coords.ts      # STANOX → lat/lng mapping
│   └── index.ts                   # Worker entry
├── data/
│   └── stations.json              # Pre-built STANOX → coords
├── public/
│   └── map-style.json             # Dark MapLibre style
├── wrangler.toml
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── components.json                # shadcn config
```

---

## Implementation Phases

### Phase 1: Project Setup
1. Initialize Vite + React + TypeScript
2. Add Tailwind CSS
3. Initialize shadcn/ui
4. Install mapcn
5. Configure Wrangler for Cloudflare

### Phase 2: UI Foundation
1. Create dashboard layout (header, main area)
2. Integrate mapcn Map component
3. Apply dark theme to map
4. Add stats panel and legend components

### Phase 3: Reference Data
1. Download STANOX → coordinates mapping
2. Process into optimized JSON lookup
3. Bundle with worker or serve from KV

### Phase 4: Backend Core
1. Create TrainHub Durable Object
2. Implement train state management
3. Add cleanup/TTL logic
4. Create WebSocket broadcast system

### Phase 5: STOMP Integration
1. Implement STOMP client for Workers
2. Connect to Network Rail feed
3. Parse TRUST messages
4. Update train state on messages

### Phase 6: Frontend Integration
1. WebSocket connection hook
2. Train state provider
3. Real-time marker updates
4. Connection status indicator

### Phase 7: Polish
1. Add loading states
2. Error handling
3. Reconnection logic
4. Performance optimization (marker clustering)

---

## Wrangler Configuration

```toml
# wrangler.toml
name = "traintracker"
compatibility_date = "2024-01-01"
pages_build_output_dir = "dist"

[vars]
NETWORK_RAIL_USERNAME = ""  # Set in dashboard
NETWORK_RAIL_PASSWORD = ""  # Set in dashboard

[[durable_objects.bindings]]
name = "TRAIN_HUB"
class_name = "TrainHub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TrainHub"]
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NETWORK_RAIL_USERNAME` | Network Rail data feed username |
| `NETWORK_RAIL_PASSWORD` | Network Rail data feed password |

---

## Client-Server Protocol

### Initial Connection
```typescript
// Client connects to WebSocket
// Server sends full state snapshot
{
  type: 'snapshot',
  trains: TrainState[],
  timestamp: number
}
```

### Delta Updates
```typescript
// Server broadcasts changes
{
  type: 'update',
  train: TrainState
}

{
  type: 'remove',
  trainId: string
}
```

### Stats
```typescript
{
  type: 'stats',
  total: number,
  onTime: number,
  slightDelay: number,
  delayed: number,
  lastUpdate: number
}
```

---

## Map Configuration

### Dark Theme Style
Using Protomaps or custom MapLibre style with:
- Near-black landmass (#0a0a0a)
- Slightly darker water (#050505)
- Subtle gray roads (#1a1a1a)
- Minimal labels in light gray

### Initial View
```typescript
const UK_CENTER = [-2.5, 54.5]; // Center of UK
const INITIAL_ZOOM = 6;         // Shows all of UK
```

### Train Markers
```typescript
// Small circles with white stroke
<circle
  r={4}
  fill={STATUS_COLORS[status]}
  stroke="white"
  strokeWidth={1}
/>
```

---

## Performance Considerations

1. **Marker Rendering**: Use MapLibre's native circle layer for 1000+ markers
2. **State Updates**: Batch updates, don't re-render on every message
3. **WebSocket Messages**: Send deltas, not full state
4. **Cleanup**: Run TTL cleanup every 5 min, not on every message
5. **Reference Data**: Pre-load station coords, don't fetch per-train

---

## Fallback Strategy

If Network Rail STOMP is problematic:
1. **Realtime Trains API** - HTTP pull every 30s
2. **Darwin Push Port** - Alternative STOMP feed
3. **Mock Data** - For development/demo mode

---

## Getting Started Commands

```bash
# 1. Create project
pnpm create vite@latest traintracker --template react-ts
cd traintracker

# 2. Add Tailwind
pnpm add tailwindcss @tailwindcss/vite

# 3. Initialize shadcn
pnpm dlx shadcn@latest init

# 4. Add shadcn components
pnpm dlx shadcn@latest add card button badge

# 5. Add mapcn
pnpm dlx shadcn@latest add https://mapcn.vercel.app/maps/map.json

# 6. Add Cloudflare tooling
pnpm add -D wrangler @cloudflare/workers-types

# 7. Dev server
pnpm dev

# 8. Deploy
pnpm build && wrangler pages deploy dist
```
