# Mad Monkey Studio — Architecture

AI-first design system that enforces on-brand marketing asset generation via Claude. Brand identity is data, not code. The engine is brand-agnostic and multi-tenant from day one.

## How to run

```bash
npm run dev          # Next.js dev server on :3000
npx convex dev       # Convex local dev (separate terminal)
```

## How to deploy

```bash
npx convex deploy    # push Convex schema + functions
vercel --prod        # push Next.js to Vercel (or via git push → CI)
```

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | — |
| Styling | Tailwind v4 + shadcn/ui + lucide-react | — |
| Backend | Convex | DB + reactive queries + actions + file storage in one |
| Auth | Clerk + `ConvexProviderWithClerk` | Pre-built UI, role via `publicMetadata.role`, official Convex adapter |
| AI | Anthropic Claude API | Only model. Key lives in Convex env, never client-side |
| Hosting | Vercel | Next.js first-class support |

## Key decisions

**Auth — Clerk (not Convex Auth):** Clerk's App Router middleware and `ConvexProviderWithClerk` are the officially documented pattern. Role stored in `publicMetadata.role` (`"admin"` | `"marketer"`).

**Rendering — client-side for MVP, serverless Chromium in Phase 5:** MVP uses `canvas.toBlob()` for PNG from SVG. Phase 5 adds a Vercel serverless function with `@sparticuz/chromium` + `puppeteer-core` for pixel-perfect PNG/PDF. 50MB Vercel limit is tight; fallback is Browserless.io.

**File storage — Convex built-in:** `storage.generateUploadUrl()` + `storage.getUrl()`. No extra vendor. R2 can replace this later if CDN is needed.

**Multi-tenant — brand-as-tenant, single Convex deployment:** Every table carries `brandId`. Every query/mutation verifies `brandId === user.brandId`. No per-brand deployments.

**Brand config is versioned, never mutated:** Every admin edit writes a new `brand_config` row (incrementing `version`). Active config = highest version where `isActive = true`. Rollback = flip `isActive`.

## Architecture overview

```
Browser
  └─ Next.js App Router (Vercel)
       ├─ Convex React hooks (reactive queries, subscriptions)
       └─ Convex actions (server-side, no client exposure)
            ├─ Anthropic Claude API (brand_config injected as system prompt)
            └─ Convex DB + File Storage
```

### Generation pipeline

1. Marketer pastes refined brief into a thread
2. `generateAsset` Convex action fetches active `brand_config`, builds system prompt from `claudeMd` + palette/font allow-list
3. Claude returns SVG or HTML render-ready code
4. Validator parses output for hex colours, font-family strings, dimensions — compares against allow-list
5. Violation → auto-retry with violations appended (max 3 retries)
6. Pass → write `generations` row, render to PNG, store in Convex storage
7. Canvas updates reactively; `usage_ledger` row logged

### Brand config enforcement

The validator is a **hard gate**, not a suggestion. A generation that uses `#FF0000` when the palette is `["#CC7A5C","#F2EEE6",...]` is rejected and regenerated automatically. This is the core differentiator.

## Design language

Dark UI shell. Always dark — no light mode.

| Token | Value | Use |
|---|---|---|
| Background | `#1C1A18` | Page, base |
| Surface | `#242220` | Cards, panels |
| Foreground | `#F2EEE6` | Body text (warm off-white) |
| Accent | `#CC7A5C` | CTAs, highlights (terracotta) |
| Muted | `#8C8278` | Secondary text |
| Border | `rgba(242,238,230,0.08)` | Hairline borders |
| Display font | Fraunces | Headings (serif, variable) |
| Body font | DM Sans | UI text (grotesque) |

## Phases

| Phase | Status | What |
|---|---|---|
| 0 | ✅ | Scaffold + hello world deployed |
| 1 | ⬜ | Clerk auth + full Convex schema + Mad Monkey brand seeded |
| 2 | ⬜ | Thin vertical slice: brief → Claude → SVG → PNG |
| 3 | ⬜ | Threads + conversational refinement |
| 4 | ⬜ | Validation + auto-regenerate gate |
| 5 | ⬜ | Template expansion + server-side export |
| 6 | ⬜ | Token metering + per-seat caps + admin dashboard |
| 7 | ⬜ | Versioned brand governance + rollback |
| 8 | ⬜ | Multi-tenant onboarding |
| 9 | ⬜ | Production hardening + monitoring |

## Convex schema tables

`brands` · `brand_config` · `design_systems` · `templates` · `threads` · `messages` · `generations` · `usage_ledger` · `users`

See plan file for full field definitions: `.claude/plans/unified-sprouting-seal.md`

## Environment variables

```
# Convex (set via `npx convex env set`)
ANTHROPIC_API_KEY=

# Next.js (set in Vercel dashboard or .env.local)
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

## File structure

```
app/                   Next.js App Router pages
  (auth)/              Clerk sign-in / sign-up routes
  (studio)/            Main studio UI (threads, canvas)
  admin/               Admin-only routes (brand config, usage)
  api/                 API routes (webhook from Clerk, render endpoint)
components/
  ui/                  shadcn primitives
  studio/              Studio-specific components (Canvas, ThreadList, etc.)
  admin/               Admin components
convex/
  schema.ts            Full database schema
  brands.ts            Brand + brand_config queries/mutations
  threads.ts           Thread + message queries/mutations
  generations.ts       Generation action (Claude call + validation)
  users.ts             User sync + role checks
  usage.ts             Ledger queries + cap enforcement
lib/
  validator.ts         Brand config validation logic (pure, testable)
  prompt.ts            System prompt builder
```
