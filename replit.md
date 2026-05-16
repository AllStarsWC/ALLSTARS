# WC 2026 All Stars Gacha Machine

An animated trading card gacha machine for the 2026 FIFA World Cup — pull cards, build your collection, and compete on the leaderboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/gacha run dev` — run the frontend (port 24287)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io (real-time pull feed + live chat)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + framer-motion
- State: TanStack Query (generated hooks from Orval codegen)
- Cards data: in-memory (100 players, 4 rarity tiers)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/routes/gacha.ts` — pull logic, collections, leaderboard
- `artifacts/api-server/src/cards.json` — 100 player card definitions
- `artifacts/gacha/src/` — frontend (components, pages, socket lib)

## Architecture decisions

- Cards are stored in `cards.json` and imported statically by esbuild (no runtime file reads that break after bundling)
- Socket.io runs on the same Express HTTP server instance; the `/socket.io` path is registered in `artifact.toml` so the proxy forwards WebSocket traffic
- Pull state (collections, leaderboard, feed) is in-memory — resets on server restart. Swap with Replit DB or Postgres to persist.
- Single-pull and 10-pull both use query hooks with `enabled: false` + `refetch()` so they trigger on button click, not on mount
- The 10-pull guarantees at least 1 rare-or-above by forcing the last slot from a non-common pool if none appeared

## Product

- **Pull tab**: Enter a username, pull single or 10-card packs with animated card flips. Legendary pulls trigger confetti.
- **Vault tab**: Browse all 100 cards — locked (silhouette) or unlocked. Filter by rarity.
- **Rankings tab**: Live leaderboard ranked by legendaries then total collected.
- **Live Feed tab**: Real-time stream of notable pulls (rare+) from all users via Socket.io.
- **Chat tab**: Live chat room shared across all users via Socket.io.

## Rarity System

| Rarity    | Cards | Pull Weight | Approx Rate |
|-----------|-------|-------------|-------------|
| Legendary | 10    | 1 each      | ~1%         |
| Epic      | 20    | 5 each      | ~6%         |
| Rare      | 30    | 18 each     | ~19%        |
| Common    | 40    | 50 each     | ~74%        |

## Gotchas

- Always import cards.json statically (not `readFileSync`) — after esbuild bundles to `dist/`, filesystem paths shift
- Socket.io path `/socket.io` must be listed in `artifact.toml` paths array for the proxy to forward WebSocket upgrades
- Re-run codegen after every OpenAPI spec change: `pnpm --filter @workspace/api-spec run codegen`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
