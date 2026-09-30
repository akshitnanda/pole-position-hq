# Pole Position HQ

Pole Position HQ is a premium Formula 1 command center built with Next.js App Router, Tailwind CSS, and TanStack Query. It combines real race schedule data, standings, a clearly labeled fantasy sandbox, and scrub-linked telemetry into a polished public demo surface that feels closer to a pit wall broadcast than a typical stats page.

Live demo: https://polehq.vercel.app

## What it includes

- Broadcast-inspired F1 dashboard UI with a branded, public-demo shell
- OpenF1-backed session schedule, standings context, and fastest-lap telemetry
- F1 GraphQL standings enrichment for driver context and historical stats
- Official F1 Fantasy API integration with graceful fallback heuristics
- Motorsport.com, The Race, Reddit, and optional X activity feeds
- Race intelligence workspace for sourced upgrade mentions, evidence strength, and timing deltas
- NVIDIA NIM-powered Pit Wall AI briefs with evidence references and server-side credentials
- Session-only Pit Wall AI workspaces per brief mode, with mode-scoped frozen evidence receipts, server-locked fact cards, stale-snapshot labeling, and source-complete text export
- NIM selects references only; headlines, cards, and the next-session item are assembled from dashboard records. Archived timing and strategy keep their circuit, date, and session context in the brief and export.
- Pit Wall opens with an immediate three-card snapshot brief (fixed rules, explicitly not AI). NVIDIA refinement is optional and cancellable; a failed request leaves the readable brief in place. Searchable source receipts and exports use the exact displayed snapshot. Driver focus excludes other drivers' timing records.
- Driver Focus has an inline driver picker and includes the selected driver's timing beyond the top six. Brief dates can be read in UTC or browser-local time; original timestamps stay intact in receipts and exports. Evidence search supports category filters.
- Independent race-session feeds load concurrently. Client dashboard refreshes time out after 45 seconds while retaining the last successful snapshot; the Refresh control prevents duplicate requests and reports timeout failures explicitly. The local live-timing endpoint is a persistent replay stream, so its total request duration is not a page-load latency measurement.
- Timing connections stay offline until a valid frame arrives. A WebSocket silent for 15 seconds falls back to replay; replay silent for 30 seconds is labeled offline until frames resume. Malformed messages and late frames from retired sockets are ignored. Transport activity does not relabel archived telemetry as live, and local replay emits neither fabricated latency nor race-control updates.
- Open Commands from the header or press Ctrl/Cmd+K to search workspaces, drivers, team themes, and refresh/appearance actions. Search runs locally. Use arrow keys and Enter to select, Escape to close; focused controls are protected from dashboard playback shortcuts.
- A shared cockpit strip keeps scheduled-event, selected-driver, and timing-connection context visible across workspaces. Event and driver shortcuts open Weekend Outlook and Driver Focus directly; driver commands also open Driver Focus. Source Health expands into per-feed provenance, status, notes, and timestamps without treating replay connectivity as fresh data. Past or cancelled schedule references are never labeled upcoming by this strip.
- Keep Brief creates an in-memory checkpoint that survives workspace navigation, but not page reload. NVIDIA results use the same checkpoint store. Race/driver briefs are isolated by driver and season; weekend outlook is shared across driver selection. Compare exact saved/current evidence records without inference: positional reference changes are ignored, ambiguous duplicate labels are not paired, and missing records are not presented as events on track. Copy/export always use the displayed checkpoint until Use Current Snapshot releases it.
- Saved Briefs is a searchable checkpoint library with snapshot dates, source-order attribution, and per-entry exports. Open restores the saved driver and briefing mode; Ctrl/Cmd+K also finds available checkpoints with “saved” or a driver name. Entries for missing drivers or other seasons remain exportable but cannot silently open under another driver. The library is in-memory only and clears on page reload.
- Export All Briefs downloads every saved checkpoint into one offline text pack, regardless of library search filters. Each section retains its own scope, timestamps, AI attribution, and cited source receipts; unavailable-driver checkpoints are included. Packs are reading artifacts, not importable backups. Individual export filenames include driver and snapshot time.
- Scrub-linked telemetry, 0.5x-16x session replay, and circuit-map synchronization
- Official OpenF1 team-radio clips with session-scoped driver attribution
- Opt-in local session reminders plus Google and Apple calendar links
- Local-only saved preferences for selected driver and watchlist
- Public-demo resilience with cached snapshots, fallback states, and source badges

## Tech stack

- Next.js 16
- React 19
- Tailwind CSS 4
- TanStack Query
- Lucide React

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy environment defaults if you want to override upstream APIs:

```bash
copy .env.example .env.local
```

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`

Hot reload is enabled through Turbopack.

## Environment variables

All environment variables are optional in v1.

- `NEXT_PUBLIC_SITE_URL`
  Public base URL for metadata and social previews.
- `OPENF1_API_BASE_URL`
  Override for the OpenF1 REST base URL.
- `F1_GRAPHQL_ENDPOINT`
  Override for the F1 GraphQL endpoint.
- `F1_FANTASY_API_BASE_URL`
  Override for the official fantasy API base URL.
- `MOTORSPORT_RSS_URL`
  Override for the Motorsport.com F1 RSS feed.
- `THE_RACE_RSS_URL`
  Override for The Race activity source. Defaults to the public Formula 1 category page and normalizes readable article links when an RSS feed is not exposed.
- `X_BEARER_TOKEN`
  Optional X API bearer token for recent-search activity around F1 race, upgrade, and timing terms.
- `NVIDIA_API_KEY`
  Server-only credential for NVIDIA's hosted NIM API. Never expose this with a `NEXT_PUBLIC_` prefix.
- `NVIDIA_NIM_BASE_URL`
  OpenAI-compatible NIM base URL. Defaults to NVIDIA's hosted API and can point to a self-hosted deployment.
- `NVIDIA_NIM_MODEL`
  NIM model identifier. Defaults to `nvidia/nemotron-3.5-lightning-30b-a3b`.

## Quality checks

```bash
npm run lint
npm run build
npm run check
```

## GitHub workflow

The repo is intended to use GitHub as the source of truth.

- `main` is the production branch
- Pull requests should be used for preview verification
- CI runs regression tests, lint, and build on pushes to main and pull requests via `.github/workflows/ci.yml`

## Vercel deployment

The app is designed for zero-config Vercel deployment.

### First deploy

```bash
npx vercel
```

### Production deploy

```bash
npx vercel --prod
```

### Recommended Vercel setup

- Link the project to this repository
- Set production to deploy from `main`
- Use Vercel preview deployments for pull requests
- Set `NEXT_PUBLIC_SITE_URL=https://polehq.vercel.app` when managing env vars in Vercel

## Data behavior

Pole Position HQ is optimized as a stable live demo, not a fragile ultra-realtime toy.

- The page hydrates from a server snapshot
- Client refreshes happen on an interval and when visibility returns
- Telemetry and schedule data are short-cache snapshots
- Newsroom activity uses public editorial/community feeds, with X enabled only when a bearer token is configured
- Race intelligence keeps sourced upgrade mentions separate from OpenF1 timing-derived pace context
- Pit Wall AI runs only on demand, sends a compact evidence ledger through a server route, and rejects findings without valid dashboard evidence references
- Fantasy data falls back gracefully when official endpoints are unavailable
- The UI explicitly shows whether a section is live, cached, fallback, or empty
- Local session reminders require the dashboard to remain open; calendar links are the reliable closed-tab option

## Notes

- No authentication is required in v1
- Watchlist and selection preferences are stored locally in the browser only
- The track map uses stylized circuit-specific SVG layouts selected from the dashboard payload
