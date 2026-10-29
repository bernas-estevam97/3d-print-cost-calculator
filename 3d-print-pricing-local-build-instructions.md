# Local Build Instructions: 3D Print Pricing Replica (single machine, no cloud)

**Audience:** an autonomous coding agent.
**Companion to:** `3d-print-pricing-replica-instructions.md` (the "main doc"). That file stays the source of truth for the product: data model, formulas, screens, seed data, phases. This file only states what changes when the app runs entirely on one local machine with no cloud service of any kind.

**Rule of precedence:** where this file and the main doc disagree, **this file wins**. Everything it does not mention is unchanged.

---

## 0. How to work

1. Read the main doc sections 0 to 3 first, then this whole file, then build in the main doc's phase order (section 12) with the deltas in section 13 below.
2. No account, API key, credit card or external service is required at any point. If a step seems to need one, you have taken a wrong turn — re-read section 1.
3. The app is one process. No Docker, no reverse proxy, no queue, no second service.
4. Everything the app stores lives in two places: one database file and one uploads folder. Both sit inside the project directory. Backing the app up means copying those two things.

---

## 1. Decisions locked for the local version

These replace the corresponding `[DECISION]` entries in the main doc.

| Topic | Local decision |
| --- | --- |
| Database | SQLite file, `./prisma/dev.db`, via Prisma. Not Postgres. |
| Money columns | Prisma `Float`. Round to 2 decimals at display only, per main doc section 0 item 4. |
| File storage | Local `./uploads` folder on disk. No object storage. |
| Slicer file retention | Keep the uploaded file. A local disk has room, so the "Slicer file" download button in main doc 6.3 stays in scope. |
| PDF generation | `@react-pdf/renderer`, in-process. Do not use Puppeteer or any headless browser. |
| Auth | Own email + password with a session cookie, exactly as the main doc describes. Keep it even for a single user, because the app is reachable from the LAN. |
| QR scanning | **Out of the first version.** See section 5. |
| Public client share link | **Out of the first version.** See section 5. |
| Email notifications | In-app only. No SMTP. See section 11. |
| Hosting | `next start` on the user's own machine. See sections 7 to 9. |

---

## 2. Stack

Unchanged from main doc section 2, with the provider choices above applied:

- Next.js 14+ (App Router) + TypeScript, one app, one process.
- Prisma + SQLite.
- Tailwind CSS + shadcn/ui + lucide-react.
- Recharts, TanStack Table, TanStack Query, dnd-kit, zod.
- `@react-pdf/renderer`.
- `fflate` (or `jszip`) to read `.3mf` archives, plus plain regex for `.gcode` comments. Slicer parsing runs client-side; nothing is uploaded until the user saves.

Nothing else. Do not add a state manager, a component library beyond shadcn/ui, or an HTTP client — `fetch` plus TanStack Query covers it.

---

## 3. Project layout

```
.
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── dev.db                 # created by migrate, never committed
├── uploads/                   # photos, 3MF/G-code, logo, signature; never committed
│   └── .gitkeep
├── src/
│   ├── app/[locale]/...       # /en/dashboard, /en/calculator, ...
│   ├── app/api/...            # routes from main doc section 7
│   ├── lib/
│   │   ├── pricing.ts         # the pure cost module, main doc section 7
│   │   ├── storage.ts         # put / get / delete / url — the only disk access
│   │   ├── db.ts              # Prisma client singleton
│   │   └── slicer.ts          # .3mf / .gcode parsing
│   ├── components/
│   └── i18n/en.ts
├── .env
└── .env.example
```

`.gitignore` must include `uploads/`, `prisma/dev.db`, `prisma/dev.db-journal`, `prisma/dev.db-wal`, `prisma/dev.db-shm`, `.env`.

`.env`:

```
DATABASE_URL="file:./dev.db"
SESSION_SECRET="<32+ random bytes, generated at setup>"
UPLOAD_DIR="./uploads"
MAX_UPLOAD_MB=50
PUBLIC_BASE_URL="http://localhost:3000"
```

`PUBLIC_BASE_URL` is what QR codes and document links embed. It stays `localhost` until the user sets up one of the access options in section 8.

---

## 4. Setup and run

Prerequisites: Node.js LTS (npm ships with it). Nothing else.

```bash
npm install
npx prisma migrate dev
npm run seed:demo                 # main doc section 11, development only
npm run dev                       # development, http://localhost:3000
```

Production run on the same machine:

```bash
npm run build
npm start                         # next start -H 0.0.0.0 -p 3000
```

Use `npm start`, not `npm run dev`, for day-to-day use. `dev` recompiles on every navigation and feels broken on a phone.

Provide these scripts in `package.json`: `dev`, `build`, `start`, `seed`, `test`, `backup`.

---

## 5. Features cut from the first version

Each is cut for a concrete technical reason, not to save effort. Leave a clear seam so it can be switched on later.

### 5.1 QR scanning — optional, not in v1

- **In scope:** rendering and printing the order QR code (main doc 6.3), which is just an image.
- **Out of scope:** the camera scanner on the Orders screen.
- **Reason:** `navigator.mediaDevices.getUserMedia` only works in a secure context. `http://localhost` qualifies; `http://192.168.1.50:3000` does not. On a LAN-only install the scanner would fail on the exact device it is meant for — a phone.
- **What to build instead:** nothing. The orders search box already finds an order by its short code. Do not add a "scan" button that cannot work.
- **Seam:** when HTTPS exists (section 8, Tailscale or Cloudflare Tunnel), the scanner becomes a single component that reads a code and calls the same search. Gate it behind a `isSecureContext` check so it only ever appears where it can work.

### 5.2 Public client share link — optional, not in v1

- Build the `/public/order/:token` route and store `clientLinkToken` as the main doc says; it costs little and keeps the data model complete.
- Hide or disable the "Link for client" button while `PUBLIC_BASE_URL` points at `localhost` or a private address, with the hint "Needs a public URL".
- **Reason:** the client is not on the workshop's WiFi, so a LAN URL is useless to them.
- **Seam:** Cloudflare Tunnel (section 8) gives a public HTTPS URL; setting `PUBLIC_BASE_URL` to it re-enables the button with no code change.

### 5.3 Already out of scope in the main doc

Main doc section 13 still applies in full. Nothing there comes back for the local version.

---

## 6. Database notes

- One file, `prisma/dev.db`. Create and change it only through `prisma migrate dev`.
- SQLite enforces one writer at a time. For a single-user workshop this is invisible. Keep Prisma as a singleton (`lib/db.ts`) so a dev-mode hot reload does not open a second connection pool.
- SQLite has no native enum. Store the order status, technology and similar as `String` and constrain them with a zod enum at every boundary, which the main doc already requires.
- SQLite `contains` is case-sensitive for non-ASCII. Global search (main doc 6.0 behaviours, `/api/search`) must lowercase both sides, or store a lowercased shadow column for name fields. Test it with a seeded client name containing `ã` ("Dragão", "Avó Carma").
- The verification fixtures in main doc 5.3.1 must pass as unit tests against `lib/pricing.ts`, which touches no database and must stay a pure function.

---

## 7. File storage

- All disk access goes through `lib/storage.ts`. No route handler calls `fs` directly.
- Files are saved as `uploads/<entity>/<uuid>.<ext>` — never under the original filename, which is attacker-controlled.
- Validate on upload: extension against an allow-list per field (`.png .jpg .webp` for photos and logos, `.gcode .3mf .stl` for model files), size against `MAX_UPLOAD_MB`, and MIME sniffing of the first bytes. Reject anything else.
- Serve files through a route handler that checks the session and the record's `workshopId`, then streams from disk. Do **not** put `uploads/` under `public/`, which would make every file world-readable to anyone on the LAN.
- Deleting a record deletes its files in the same operation.

---

## 8. Reaching the app from a phone

The machine running `npm start` must be powered on and awake. Three options, from least to most setup.

| Option | Reachable from | HTTPS | Camera / secure-context APIs | Client share link |
| --- | --- | --- | --- | --- |
| **LAN** | same WiFi only | no | no | no |
| **Tailscale** | anywhere, private | yes, via `tailscale cert` | yes | no (private network) |
| **Cloudflare Tunnel** | anywhere, public | yes | yes | yes |

### 8.1 LAN (default, zero dependencies)

1. Run `npm start` (it already binds `0.0.0.0:3000`).
2. Find the machine's address with `ipconfig` (the IPv4 address of the active adapter).
3. Open `http://<that-address>:3000` on the phone.
4. Windows Firewall blocks this silently until an inbound rule exists. In an elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName "3D Print Pricing" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -Profile Private
```

Use `-Profile Private` only, and make sure the WiFi network is marked Private in Windows. Never open the rule on the Public profile.

A home router usually hands out addresses by DHCP, so the machine's address can change. Reserve a static lease for it in the router, or the bookmark on the phone breaks.

### 8.2 Tailscale (recommended once the phone is used daily)

Install Tailscale on both the machine and the phone, sign in with the same account on both, then use the machine's Tailscale name. `tailscale cert` plus `tailscale serve` provides real HTTPS, which re-enables the scanner seam in 5.1. Works outside the house, stays private, free for personal use.

### 8.3 Cloudflare Tunnel (only if the client share link is wanted)

`cloudflared tunnel` publishes `http://localhost:3000` at a public HTTPS URL with no port forwarding and no inbound firewall rule. Set `PUBLIC_BASE_URL` to that URL to re-enable 5.2. Because the URL is public, auth must be working before this is switched on.

---

## 9. Keeping it running

- Task Scheduler, trigger "At log on", action `npm start`, working directory set to the project root, "Run whether user is logged on or not" off. Simplest option, survives reboots.
- Or NSSM to install `node` + the Next.js server as a real Windows service if the app should run without anyone logging in.
- Either way, log stdout and stderr to a file in the project (`logs/`, gitignored). A crash with no log is the main cause of "it just stopped working".
- Make sure Windows sleep is disabled on the host machine, or the phone sees a dead server every morning.

---

## 10. Backups

Main doc 6.14 already requires "Download full backup (JSON)" and "Restore from backup". Build it — a JSON export survives a schema change, a copied database file does not.

Add a local file-level backup on top of it:

- SQLite in WAL mode writes to `dev.db`, `dev.db-wal` and `dev.db-shm`. Copying only `dev.db` while the app runs yields a torn backup. Either stop the app first, or take a consistent snapshot with the online backup API: `npm run backup` uses Node's built-in `node:sqlite` `backup()`, so no `sqlite3` CLI is needed.
- Copy `uploads/` alongside it — the JSON export does not contain binary files.
- A nightly Task Scheduler job running `npm run backup` (a script that does both of the above into OneDrive or an external drive) is enough. Keep the last 7.
- Restoring means stopping the app, replacing the file and the folder, and starting it again. Write this down in the About tab.

---

## 11. Notifications

Main doc 6.15 lists notification toggles for low filament and overdue orders. Locally there is no SMTP, so:

- Keep the toggles and persist them.
- Deliver in-app only: a bell in the top bar listing the same events the Dashboard already computes (filaments with `lastsDays <= 14`, orders past their due date, maintenance overdue).
- Do not build a scheduler or a worker. The checks are plain queries, run when the Dashboard or the bell is opened.
- **Seam:** if real email is ever wanted, the same check functions get called from a cron and handed to an SMTP transport. Nothing else changes.

---

## 12. Security, even on a local network

Anyone on the same WiFi can reach the app. The main doc's section 9 security requirements are not optional here:

- Hash passwords with bcrypt. Never store or log a plaintext password.
- `httpOnly`, `sameSite=lax` session cookie. Set `secure` whenever the request arrives over HTTPS.
- Validate every input with zod and authorize every record by `workshopId` in the query, not after fetching it.
- Rate-limit login attempts in memory (a simple per-IP counter is enough for one process).
- Keep `uploads/` out of `public/`, per section 7.

---

## 13. Phase deltas

Follow main doc section 12. Only these items change:

- **Phase 1:** add `lib/storage.ts`, `.env.example`, and the SQLite migration plus seed. Acceptance adds: a fresh clone reaches a seeded, logged-in dashboard with only `npm install`, `prisma migrate dev`, `prisma db seed`, `npm run dev`.
- **Phase 3:** slicer parsing runs client-side; the file is uploaded only on save. Acceptance unchanged (both fixtures in 5.3.1 must reproduce exactly).
- **Phase 4:** the "Link for client" button is present but disabled with its hint, per 5.2. The QR code renders; no scanner exists, per 5.1.
- **Phase 7:** add the backup script and the restore instructions in the About tab. Responsive pass follows main doc 9.1, verified at 390 px on a real phone over the LAN, not only in devtools.

---

## 14. Definition of done, local version

All of the main doc section 15, plus:

1. A fresh clone runs with four commands and no account, key or external service.
2. Both numeric fixtures from main doc 5.3.1 pass as automated tests.
3. The phone on the same WiFi can complete the full flow in main doc 15 end to end: add a filament and a printer, calculate a print from a G-code file, save it as an order for a new client, drag it through Kanban to Done, see the figures on the Dashboard and Analytics, download a quote PDF.
4. No horizontal page scroll at 390 px; the bottom tab bar is present; the Kanban board is usable by touch.
5. Stopping the process, copying `prisma/dev.db` and `uploads/` to another folder, deleting the originals, restoring them and starting again produces the identical app state.
6. No button in the UI promises something the local install cannot do.

---

## 15. Upgrade path, if it is ever deployed

Nothing here paints you into a corner, provided the seams hold:

1. Swap the Prisma provider to `postgresql` and re-create the migrations. Re-check the three SQLite caveats in section 6 — this is the step that breaks things, so do it before there is real data.
2. Point `lib/storage.ts` at an S3-compatible bucket. No caller changes.
3. Set `PUBLIC_BASE_URL` to the deployed origin, which re-enables the client share link (5.2) and, with HTTPS, the QR scanner (5.1).
4. Everything else — the pricing module, the screens, the API surface — is unchanged.
