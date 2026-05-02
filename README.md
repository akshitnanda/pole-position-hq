# Pole Position HQ

Pole Position HQ is a premium Formula 1 command center built with Next.js App Router, Tailwind CSS, and TanStack Query. It combines real race schedule data, standings, fantasy signals, and scrub-linked telemetry into a polished public demo surface that feels closer to a pit wall broadcast than a typical stats page.

Live demo: https://polehq.vercel.app

## What it includes

- Broadcast-inspired F1 dashboard UI with a branded, public-demo shell
- OpenF1-backed session schedule, standings context, and fastest-lap telemetry
- F1 GraphQL standings enrichment for driver context and historical stats
- Official F1 Fantasy API integration with graceful fallback heuristics
- Motorsport.com, The Race, Reddit, and optional X activity feeds
- Race intelligence workspace for upgrade signals, timing deltas, and source confidence
- Scrub-linked telemetry and broadcast-style circuit map synchronization
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
- CI runs lint + build on push and PR via `.github/workflows/ci.yml`

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
- Race intelligence cards combine activity mentions with OpenF1 timing and standings-derived heuristics
- Fantasy data falls back gracefully when official endpoints are unavailable
- The UI explicitly shows whether a section is live, cached, fallback, or empty

## Notes

- No authentication is required in v1
- Watchlist and selection preferences are stored locally in the browser only
- The track map uses stylized circuit-specific SVG layouts selected from the dashboard payload
