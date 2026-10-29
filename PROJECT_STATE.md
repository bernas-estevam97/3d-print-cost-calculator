# Project state

Handover document for an agent or developer continuing this project. Read this first, then
`README.md`. Last updated 2026-10-29.

## 1. What this is

A local replica of a 3D-printing workshop pricing app: cost calculator + order management + small
CRM + stock + documents + analytics. Single machine, Next.js + SQLite, multi-account (each account owns
one workshop; every row is scoped by `workshopId`).

Source of truth for behaviour:

- `3d-print-pricing-replica-instructions.md` (main spec, ~700 lines). Section numbers like "main doc
  5.12" in code comments point here.
- `3d-print-pricing-local-build-instructions.md` (local deployment decisions). It wins on conflicts.

Spec edits already made: section 2 (DB provider decision, uploads through `lib/storage.ts`, slicer file
retention), 6.3 (QR scanner optional, not in v1; client share link needs a public URL), new 9.1
(mobile/interaction requirements), 10 (acceptance check 5). The local guide was switched from pnpm to
npm, `seed:demo` marked dev-only, and backup uses `node:sqlite`.

## 2. Status

Feature-complete against the spec for v1. All checks green as of the last session:

- 34 tests pass (`npm test`): pricing fixtures, slicer parsing, `orders.integration.test.ts`.
- `npm run typecheck`, `npm run lint` and `npm run build` are clean, with no build warnings.
- Both spec pricing fixtures reproduce in the UI.
- Seed sanity numbers match the spec (via `npm run check:seed` after `seed:demo`): 9.7 kg / 11 spools /
  128 € stock, printer 430.07 h, dashboard week revenue 24 (+167%) and profit 19, October revenue 36.5
  and net 31.4.
- Every page renders with no console errors and no horizontal scroll at 390 px width.
- `npm audit`: 0 vulnerabilities.

Known deliberate deviation: dashboard "In progress" shows 3 on the seed data, not the spec's observed 0,
because the code follows the spec's written formula (statuses 2 to 7).

Database state: demo account removed (backup taken first at `backup/2026-10-29T16-03-32`). One real
account remains (the owner's). The app was shared through a Cloudflare quick tunnel so a colleague can
register and test.

Git: repo initialised on `main`, files staged, **no commit yet**.

## 3. Stack and versions

| Package | Version | Notes |
| --- | --- | --- |
| Next.js | 16.4.3 | Turbopack. Uses `src/proxy.ts` (not middleware), async route params. `cacheComponents`/`partialPrefetching` not enabled. Read `node_modules/next/dist/docs/` before changing framework code (see `AGENTS.md`). |
| React / react-dom | 19.3.1 | Pages are client components using TanStack Query. |
| TypeScript | 6.0.3 | TS 7 blocked: typescript-eslint needs < 6.1. |
| ESLint | 9.39.5 | ESLint 10 tried and reverted: eslint-config-next plugins support 9 only. |
| Prisma | 7.10.1 | With `@prisma/adapter-better-sqlite3` + better-sqlite3. Client generated to `src/generated/` (gitignored, `postinstall` regenerates). Prisma 8 is only an rc. |
| Tailwind | 4 | Tokens in `src/app/globals.css`. |
| Others | | zod 4, @tanstack/react-query 5, @dnd-kit, recharts 3, @react-pdf/renderer, fflate, qrcode, date-fns, bcryptjs, iron-session, next-themes, sonner, lucide-react, clsx, tailwind-merge |
| Dev | | vitest 5, tsx, @types/node 24 |

Package manager: npm. Node 24 LTS.

## 4. Config

- `next.config.ts`: `serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer"]`,
  `turbopack.root: process.cwd()`, a CSS loader rule.
- `prisma.config.ts`: loads `.env` with `process.loadEnvFile()`, seed command `tsx prisma/seed.ts`.
- `.env` (gitignored; template `.env.example`): `DATABASE_URL="file:./prisma/dev.db"`,
  `SESSION_SECRET`, `UPLOAD_DIR="./uploads"`, `MAX_UPLOAD_MB=50`, `PUBLIC_BASE_URL`.
- `vitest.config.mts`: `@` alias to `src`.
- npm scripts: `dev` (`next dev -H 0.0.0.0`), `build`, `start` (`next start -H 0.0.0.0 -p 3000`),
  `lint`, `test`, `typecheck`, `postinstall` (`prisma generate`), `backup`, `check:seed`, `seed:demo`.
- `.gitignore` excludes: `node_modules`, `.next`, build caches, `src/generated/`, `.env*` (except
  example), `prisma/*.db*`, `uploads/`, `backup/`, `logs/`, `*.log`, the tool folders `prisma init`
  created (`.claude/`, `.agents/`, `.windsurf/`, `skills-lock.json`), editor/OS noise and
  `NOTES.local.md` (owner's private run/debug notes).

## 5. Architecture

### Request flow

`src/proxy.ts` redirects to `/login?next=...` when the `pp_session` cookie is missing on `/en/*`
(optimistic only). Every API route is wrapped by `route()` from `lib/api.ts`, which loads the
iron-session, resolves the user's `workshopId`, validates input with zod and maps `HttpError` to JSON
errors. `publicRoute()` is used for the unauthenticated public order page. Pages call the API through
`lib/client.ts` (`api()`, `useMe`, `useMutate`, `useQueryState`, `useLocal`).

### Pure modules (no DB; usable on client and server)

- `lib/pricing.ts`: `compute(input)` returns every cost line, price, profit and warnings; plus `round2`,
  `applyRounding`, `defaultPricingSettings`. Price modes: `auto | markup | price | profit`. Profit =
  revenue − total cost; net profit also subtracts tax, marketplace fees and acquiring. In auto/markup
  mode deductions are added on top of the price.
- `lib/calc.ts`: `calcSchema`, `emptyCalc`, `toPricingInput`, `computeCalc`, `pricingSettings`. Turns
  calculator form state into pricing input. `includeLabor` only affects the personal write-off.
- `lib/slicer.ts`: `parseGcode`, `parse3mf` (unzips with fflate), `parseSlicerFile`, `SlicerError`.
- `lib/status.ts`: `STATUSES` (key, label, badge `cls`, kanban `bar`), `STEPPER`, `IN_PROGRESS`,
  `CONSUMING` (printing, packing, delivery, done, closed).
- `lib/format.ts`, `lib/json.ts` (`parseJson`), `lib/types.ts`, `lib/qr.ts`.

### Server modules

- `lib/db.ts`: Prisma singleton; loads `.env` itself if `DATABASE_URL` is missing (scripts, tests).
- `lib/session.ts`: iron-session config, cookie `pp_session`.
- `lib/api.ts`: `route`, `publicRoute`, `HttpError`.
- `lib/storage.ts`: `put`, `get`, `remove`, `removeAll`. Files at `uploads/<workshopId>/<kind>/`.
  Contains `turbopackIgnore` comments so the bundler does not trace runtime paths.
- `lib/entities.ts`: registry of plain CRUD entities served by `/api/[entity]` and
  `/api/[entity]/[id]`: printer-groups, printers, dryers, filaments, client-categories, clients,
  model-groups, models, shelves, shelf-items, finished-goods, write-offs, events, tax-regimes,
  marketplace-fees, loyalty-tiers, catalog-items, templates, drafts. PATCH writes only keys actually
  sent (works around zod 4 filling defaults).
- `lib/derive.ts`: computed values: filament stock and "lasts N days", printer stats (hours, payback
  from net profit), client loyalty levels.
- `lib/orders.ts`: `loadRefs`, `createOrder` (stores a full pricing snapshot), `setStatus` (deducts
  filament once when entering a `CONSUMING` status, returns it on cancel), `deleteOrder`,
  `recalculate`, `repeatOrder`, `addService`.
- `lib/analytics.ts`: `analytics(workshopId, from, to)` and `dashboard(workshopId, range)`. Revenue and
  profit count PAID orders only. `ORDER_CAP = 5000`.
- `lib/backup.ts`: per-workshop JSON export/import.
- `lib/documents.tsx`: document types and numbering `QT/INV/RC/DN/CT/AC-YYYY-NNNN`, totals, PDF
  rendering with @react-pdf/renderer.
- `lib/bootstrap.ts`: `createWorkshop` seeds a new workshop: default settings, tax regimes (IVA 23 %
  default), catalogs, built-in warehouse shelves.

### Data model (`prisma/schema.prisma`)

User, Workshop, Settings, TaxRegime, MarketplaceFee, LoyaltyTier, CatalogItem, PrinterGroup, Printer,
Dryer, Filament, ClientCategory, Client, ModelGroup, Model, ModelFilament, Order, OrderMaterial,
OrderService, WarehouseShelf, ShelfItem, FinishedGood, WriteOff, CalendarEvent, Document,
CompanyDetails, CalcTemplate, CalcDraft. Everything hangs off Workshop with `onDelete: Cascade`, so
deleting a workshop removes all its rows. One migration: `prisma/migrations/20261029144721_init`.

### API routes (`src/app/api/`)

auth/login (in-memory rate limit), auth/register, auth/logout; me (GET/PATCH/DELETE: profile, password,
notification prefs, account deletion); settings; company-details; upload; `files/[...path]`
(authenticated file serving); orders, `orders/[id]`, `orders/[id]/status`, `orders/[id]/repeat`,
`orders/[id]/recalculate`, `orders/[id]/services`, orders/bulk, orders/service;
`public/order/[token]`; calculator/refs, calculator/warehouse; documents, `documents/[id]`,
`documents/[id]/pdf`; analytics; dashboard; search (accent-insensitive); notifications; export;
import; app-config; `[entity]` and `[entity]/[id]` (generic CRUD).

### Pages (`src/app/`)

- `login`: sign in / "Create a workshop" registration. No demo hint.
- `public/order/[token]`: client-facing order status page (no login).
- `en/dashboard`: KPIs with sparklines (week/month), status funnel, restock list, quick actions.
- `en/calculator`: slicer file drop, materials, printer, labor, services, pricing mode, live result,
  templates and drafts, save as order.
- `en/orders` and `en/orders/[id]`: table with filters and bulk actions; detail with status stepper,
  materials, services, documents, repeat/recalculate, client link + QR.
- `en/production`: Kanban board (@dnd-kit) by status.
- `en/calendar`: events with repetition, order due dates.
- `en/clients` and `en/clients/[id]`; `en/printers` and `en/printers/[id]`; `en/dryers`; `en/models`.
- `en/warehouse` (shelves, finished goods, write-offs) and `en/filaments` (stock, forecasts).
- `en/documents`: create and download PDFs; company details.
- `en/analytics`: period picker, four tabs, CSV export.
- `en/settings`: tabs General (sub-tabs Calculations, Catalogs, Taxes, Loyalty, Maintenance), Sync,
  Backups (JSON export/import), About.
- `en/profile`: Profile, Security (password), Notifications, Danger zone (delete workshop).
- `en/finance`: redirect only.

### Components (`src/components/`)

- `ui.tsx`: native `<dialog>` kit, buttons, fields, `NumberInput` that accepts commas, `Segmented`,
  `Switch`, `PhotoInput`, skeletons.
- `data-table.tsx`: shared table.
- `shell.tsx`: sidebar, mobile bottom tabs, global search, theme/accent picker, currency, notifications,
  profile menu.
- `charts.tsx`: Recharts wrappers (`MiniBars`, `Bars`, `MultiSeries`, `Donut`, `BarList`). Colours
  come from validated `--series-1..8` CSS tokens, never cycled.
- `printer-form.tsx`, `client-form.tsx`, `providers.tsx`.

### Scripts

- `scripts/backup.mjs`: SQLite snapshot through `node:sqlite` plus a copy of `uploads/` into
  `backup/<timestamp>/`, keeps the last 7.
- `scripts/check-seed.ts`: prints the acceptance numbers.
- `prisma/seed.ts`: demo workshop (demo@workshop.local). Development only; never on a shared install.

## 6. Recent changes (latest session)

1. Pointer cursor on all clickable elements (global rule in `globals.css`).
2. Currency dropdown turned white in dark mode: global `option { background: var(--card); color:
   var(--fg) }`, and the currency select uses `bg-bg text-fg`.
3. Dependency upgrades to the versions above. Fixed the build warnings (`turbopackIgnore` in storage).
4. Demo removal: the demo account and its uploads were deleted from the DB, the demo hint was removed
   from the login page, `seed` was renamed to `seed:demo` and marked dev-only. Dashboard empty restock
   text is now "Nothing to restock".
5. Git init + `.gitignore` rewrite; README refreshed; this file added.

## 7. Conventions and gotchas

- Read the Next.js docs bundled in `node_modules/next/dist/docs/` before touching framework APIs;
  this Next version differs from older training data (`proxy.ts`, async params, Turbopack).
- Every query must filter by the session's `workshopId`. Never trust IDs from the client without it.
- Orders store snapshots. Changing settings must not change saved orders unless the user clicks
  Recalculate.
- Stock moves only through `setStatus` / `deleteOrder` in `lib/orders.ts`. Raw DB edits (Prisma Studio)
  bypass this.
- Uploaded files go only through `lib/storage.ts`; never put them in `public/`.
- Charts: one series uses the accent; several series use `--series-N` in fixed order; no dual axes.
- Mobile: every page must work at 390 px without horizontal scroll (spec 9.1).
- Comments are sparse and point at spec sections; match that style.
- Browser testing: Chrome is not installed, so the Playwright MCP does not work on this machine.
  Headless Brave at `C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe` with
  playwright-core works.

## 8. Open items / ideas (not started)

- First git commit.
- QR scanner (spec says optional, not in v1).
- Email notifications (only in-app notifications exist in the local version).
- Changing account email (not available locally).
- A stable public URL instead of the temporary Cloudflare quick tunnel, if remote use continues.
