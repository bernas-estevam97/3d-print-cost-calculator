# 3D Print Pricing (local edition)

Cost calculator and small CRM for a 3D-printing workshop. Price a print from a slicer file, turn it
into an order, track it through production, manage clients, printers and filament stock, issue PDF
documents and see the numbers on a dashboard.

Runs entirely on one machine: Next.js + SQLite. Accounts are local (email + password stored in the
database); there are no API keys or cloud services.

- Product spec: `3d-print-pricing-replica-instructions.md`
- Local deployment decisions: `3d-print-pricing-local-build-instructions.md` (wins where the two differ)
- Current state of the build, for anyone picking it up: `PROJECT_STATE.md`

## Features

- **Calculator**: drop a `.gcode` or `.3mf` file to read print time and filament use, or enter them by
  hand. Material, electricity, depreciation, labor, post-processing, services, taxes, marketplace fees
  and rounding. Four pricing modes (auto markup, fixed markup, target price, target profit).
- **Orders**: saved with a snapshot of every price input, so later settings changes do not rewrite
  history. Status flow from negotiation to done, repeat, recalculate, bulk actions, client share link.
- **Kanban**: drag orders between statuses. Filament is deducted from stock once printing starts and
  returned if the order is cancelled.
- **Clients** with categories and loyalty levels; **printers** with usage hours and payback;
  **dryers**; **model catalog**; **warehouse** with shelves, finished goods and write-offs; **filaments**
  with stock forecasts and low-stock alerts.
- **Calendar**, **documents** (quote, invoice, receipt, delivery note, contract, acceptance act as PDF),
  **analytics** and **dashboard**, global search, notifications.
- Light/dark theme, accent colours, currency choice, works on phones.
- Per-workshop JSON export/import and file-level backups.

## Run it

Requires Node.js 24 LTS.

```bash
cp .env.example .env   # then generate SESSION_SECRET as the comment in the file says
npm install            # also generates the Prisma client
npx prisma migrate dev # creates prisma/dev.db
npm run dev            # http://localhost:3000, then "Create a workshop" on the login page
```

Day-to-day use (faster than dev mode, reachable from other devices on the network):

```bash
npm run build
npm start              # binds 0.0.0.0:3000
```

## Access from other devices

Same Wi-Fi: open `http://<this-PC's-IP>:3000`. Windows blocks it until you allow the port once
(elevated PowerShell, private networks only):

```powershell
New-NetFirewallRule -DisplayName "3D Print Pricing" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

Outside the network, a temporary public link through Cloudflare (run the production server first):

```powershell
winget install --id Cloudflare.cloudflared   # once
cloudflared tunnel --url http://localhost:3000
```

Anyone with that link can register, so stop the tunnel (Ctrl+C) when done. For the order page's
"Link for client" button, set `PUBLIC_BASE_URL` in `.env` to the public URL, then rebuild and restart.
Tailscale is the alternative for private remote access. Details in the local build guide, section 8.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build / server on port 3000 |
| `npm test` | Unit tests (pricing fixtures, slicer parsing) and the stock-deduction integration test |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run backup` | Consistent DB snapshot + copy of `uploads/` into `backup/<time>/`, keeps 7 |
| `npm run seed:demo` | Development only: create the spec's demo workshop (published password; never on a shared install) |
| `npm run check:seed` | Print the seeded numbers the spec uses as acceptance checks |

## Data

All data is two things, both outside git:

- `prisma/dev.db`: the SQLite database (accounts, workshops, orders, clients, stock, documents, settings).
- `uploads/<workshopId>/<kind>/`: uploaded photos, slicer files and logos. Served only through the
  authenticated `/api/files` route, never from `public/`.

Back up both with `npm run backup`. Everything can be edited or deleted in the app; Profile → Danger
zone deletes a whole account and its workshop. `npx prisma studio` opens a raw table editor (it skips
app rules such as returning stock, so prefer the app).

## Where things live

- `src/lib/pricing.ts`: every cost and price formula. Pure; covered by `pricing.test.ts`.
- `src/lib/calc.ts`: calculator form state to pricing input. Shared by the browser and the server.
- `src/lib/orders.ts`: order rules: snapshots, status changes, stock deduction, repeat, recalculate.
- `src/lib/entities.ts`: the plain CRUD entities behind `/api/[entity]`.
- `src/lib/storage.ts`: the only code that touches uploaded files.
- `src/app/en/*`: the pages; `src/app/api/*`: the JSON API.
- `prisma/schema.prisma`, `prisma/seed.ts`: data model and demo data.
