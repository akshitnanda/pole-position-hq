# Pole Position HQ

Pole Position HQ is a premium Formula 1 command center built with Next.js App Router, Tailwind CSS, and TanStack Query. It combines real race schedule data, standings, fantasy signals, and scrub-linked telemetry into a polished public demo surface that feels closer to a pit wall broadcast than a typical stats page.

## What it includes

- Broadcast-inspired F1 dashboard UI with a branded, public-demo shell
- OpenF1-backed session schedule, standings context, and fastest-lap telemetry
- F1 GraphQL standings enrichment for driver context and historical stats
- Official F1 Fantasy API integration with graceful fallback heuristics
- Scrub-linked telemetry and track map synchronization
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
- Configure `NEXT_PUBLIC_SITE_URL` after the first stable production URL is known

## Data behavior

Pole Position HQ is optimized as a stable live demo, not a fragile ultra-realtime toy.

- The page hydrates from a server snapshot
- Client refreshes happen on an interval and when visibility returns
- Telemetry and schedule data are short-cache snapshots
- Fantasy data falls back gracefully when official endpoints are unavailable
- The UI explicitly shows whether a section is live, cached, fallback, or empty

## Notes

- No authentication is required in v1
- Watchlist and selection preferences are stored locally in the browser only
- The track map is intentionally stylized for the demo and does not yet use circuit-specific geometry
