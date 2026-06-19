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

**Three design systems, purpose-driven (not visual-style-driven):**
- `social` — Instagram, Stories, Reels. Dark-first, high-contrast.
- `brand` — External brand materials, print, campaigns. Cream/light base.
- `internal` — Reports, presentations, internal comms. Clean, functional.

Each system has a `guidelines` field (Kyle's rules) injected into Claude alongside the global `claudeMd`. Guidelines are data — update via admin UI without a deploy. Status: **PENDING from Kyle**.

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
| 0 | ✅ | Scaffold + hello world deployed to Vercel; full Convex schema pushed to local dev |
| 1 | ✅ | Convex Auth wired (Password provider); Mad Monkey brand + config seeded; user sync on sign-in |
| 2 | ✅ | Thin vertical slice: brief → Claude → SVG → PNG (pending seed + ANTHROPIC_API_KEY) |
| 3 | ✅ | Threads + conversational refinement — gallery sidebar (past creations as SVG thumbnails + ≤6-word caption), "Create something new", refine-in-place, delete-with-confirm, collapsible. Chat feed shows every version (each exportable: PNG/JPG/PDF/DOCX/SVG). Quick Fix mode (`components/quick-fix-editor.tsx` + `convex/edits.saveManualEdit`): hand move/resize/rotate/retype/delete on the SVG, saved as a new version marked "hand-edited" (not re-validated) |
| 4 | ✅ | Validation + auto-regenerate gate — `lib/validate.ts` (colours incl. rgb()/named, fonts, blur, gradients, logo presence) + `lib/pixel-validate.ts` (resvg raster audit: sentinel-colour visibility — catches covered/clipped text and off-canvas marks even in rotated/transformed groups; ~1.5s/attempt, best-effort soft layer), max 3 auto-retries in `generateAsset`, hard fails never ship, soft layout notes ship with amber "to eyeball" badge |
| 5 | ⬜ | Template expansion + server-side export |
| 6 | ⬜ | Token metering + per-seat caps + admin dashboard |
| 7 | ⬜ | Versioned brand governance + rollback |
| 8 | ⬜ | Multi-tenant onboarding |
| 9 | ⬜ | Production hardening + monitoring |

## Security & abuse controls (live)

**Registration is invite-only.** `auth.ts > createOrUpdateUser` rejects any new email
that isn't in the `invites` allowlist. No stranger can self-register.

**Per-user monthly spend cap — $50 (0 = unlimited).** Enforced *before* the Claude
call in `generateAsset`: sums `usage_ledger` for the current month and blocks at the cap.
Default cap for invited users is `$50` (set at invite time).

**Per-user rate limits (standard).** Also pre-flight in `generateAsset`:
10 generations/minute, 200/day (counted from the `generations` table).

**SVG XSS sanitisation.** Claude's SVG is run through DOMPurify (svg profile) before
`dangerouslySetInnerHTML` — strips `<script>`, event handlers, external refs.

**Secrets.** `ANTHROPIC_API_KEY` lives only in the Convex action env (server-side);
never referenced in any client component. `.env*` is gitignored.

### Admin operations (CLI = deployment-access = admin)

```bash
# Authorise a new login (creates an allowlist entry; they then sign up at /sign-up)
npx convex run admin:createInvite '{"email":"person@madmonkeyhostels.com","role":"marketer"}'

# Promote an existing user to admin (+ set their cap)
npx convex run admin:bootstrapAdmin '{"email":"person@madmonkeyhostels.com"}'
```
Auth-gated equivalents (`admin:inviteUser`, `admin:setUserCap`, `admin:listInvites`)
exist for a future in-app admin UI.

## Go-live runbook (Convex prod + Vercel)

1. `npx convex deploy` → creates/uses the **production** Convex deployment (managed JWT keys).
2. Set prod env: `npx convex env set ANTHROPIC_API_KEY sk-ant-... --prod`.
3. Run the seed against prod: `npx convex run seed:seedMadMonkey --prod`.
4. Bootstrap the first admin against prod (`admin:bootstrapAdmin --prod`).
5. Vercel: set `NEXT_PUBLIC_CONVEX_URL` (+ site URL) to the prod deployment; deploy.
6. Verify: invite-only blocks unknown emails, cap blocks at $100, rate limit trips, HTTPS only.

## Community image bank

Real brand photography lives in `brand_images` (Convex storage + mandatory description).
Claude never sees pixels — `generateAsset` injects a URL+description manifest into the
system prompt and Claude picks by description match. Any signed-in user can upload at
`/bank`; deletion is uploader-or-admin. Client inlines `<image>` hrefs as data URLs
post-generation (`lib/inline-images.ts`) because SVG-as-img rasterisation blocks all
external resources — without it, exports silently lose photos and logos.

## Convex schema tables

`brands` · `brand_config` · `design_systems` · `templates` · `threads` · `messages` · `generations` · `usage_ledger` · `users` · `invites` · `brand_images`

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

## Convex runtime split rule

Convex's `"use node"` runtime only allows **actions** in the same file. Queries and mutations must live in a separate file *without* `"use node"`.

Pattern used throughout this project:
- `convex/generationsInternal.ts` — `internalQuery` + `internalMutation` (no "use node")
- `convex/generations.ts` — `action` only ("use node"; imports `@anthropic-ai/sdk`)

## File structure

```
app/                   Next.js App Router pages
  (auth)/              Convex Auth sign-in / sign-up routes
  admin/               Admin-only routes (brand config, usage)
components/
  ui/                  shadcn primitives
convex/
  schema.ts            Full database schema (with authTables spread)
  auth.ts              Convex Auth config (Password provider)
  auth.config.ts       JWT issuer config
  http.ts              HTTP router (auth routes)
  brands.ts            Brand + brand_config queries/mutations
  generations.ts       generateAsset action only — "use node" (Claude call)
  generationsInternal.ts  getDesignSystem + persistGeneration — no "use node"
  seed.ts              seedMadMonkey internalMutation — idempotent brand seed
  users.ts             getCurrentUser + ensureBrand
lib/
  prompt.ts            buildSystemPrompt, stripFences, FORMAT_DIMENSIONS
```
