# Build Instructions: 3D Print Pricing Replica (Workshop CRM + Cost Calculator)

**Audience:** an autonomous coding agent.
**Goal:** recreate, in a minimal but faithful way, the web service "3D Print Pricing" (3dprintpricing.pro), a cost calculator and CRM for 3D-printing workshops.
**Source of truth:** a tab-by-tab analysis of the live dashboard (as of 2026-10-29). Everything below was observed in the real product unless marked **[DECISION]** (you choose) or **[NOT OBSERVED]** (details were not inspected, so use the stated default).

Read sections 0 to 3 fully before writing code. Then build phase by phase (section 12). Do not skip the acceptance checks.

---

## 0. How to work

1. Build in the phase order of section 12. After each phase run its acceptance checks.
2. Keep the app single-tenant per user ("workshop"): every record belongs to one workshop.
3. Do not add features from section 13 (out of scope) unless all phases are done.
4. Money is stored as integer minor units? **No.** Store as `REAL`/`DECIMAL(12,4)` and round only for display (2 decimals). The original shows 2 decimals and rounds e.g. 13.30 to "13 €" in dense tables.
5. All UI strings in English. Keep strings in one `i18n/en.ts` file so more languages can be added.
6. Commit seed data (section 11) so the app looks populated on first run.

---

## 1. Product summary

One calculator feeds everything else:

```
Calculator ──save──> Order ──> Kanban / Orders list ──> Analytics
    │                  │
    │                  ├── Client (CRM)
    │                  ├── Filament stock (deducted when order reaches "Printing")
    │                  └── Printer (hours used, amortization, payback)
    └──save──> Warehouse finished goods / personal-use write-off
```

Modules (sidebar order): Dashboard, Calculator, Orders, Calendar, Kanban, Clients, Documents, Analytics, Printers, Model Catalog, Warehouse (with Filaments), Settings. Plus a top bar and a profile menu.

**Minimal replica scope (build these):** Auth, Settings, Printers, Filaments, Calculator, Orders (list + detail), Kanban, Clients, Model Catalog, Warehouse (filaments + finished goods), Dashboard, Analytics (Overview + Finance + Production + Customers), Documents (quote and invoice PDF), Calendar (basic), theme/currency.

---

## 2. Tech stack **[DECISION: defaults]**

- **Framework:** Next.js 14+ (App Router) with TypeScript.
- **DB/ORM:** Prisma. Choose the provider up front and do not plan to swap: **SQLite** if the app will only ever run on one machine (zero install, backup is copying one file), **Postgres** if it will ever be deployed. "SQLite now, Postgres later" is not free: SQLite has no native enums, no case-insensitive `contains` filter and different `Decimal` handling, so the swap breaks status columns, search and money fields on deploy day.
- **UI:** Tailwind CSS + shadcn/ui (Radix primitives); lucide-react icons.
- **Charts:** Recharts.
- **Tables:** TanStack Table (sortable columns, column picker).
- **Drag and drop:** dnd-kit (Kanban).
- **PDF:** `@react-pdf/renderer` or server-side HTML to PDF.
- **Auth:** email + password (bcrypt), session cookie. One user = one workshop (owner).
- **Validation:** zod. **State/fetching:** TanStack Query.
- **File uploads:** local `./uploads` folder on disk (photos, 3MF/G-code, logo, signature), max 50 MB per slicer file. This is only valid on a host with a persistent disk (local machine, VPS, Fly.io volume). Serverless hosts (Vercel, Cloudflare Workers) have no persistent disk and lose uploaded files on every redeploy, so they need S3-compatible object storage (Cloudflare R2, Supabase Storage) instead. Put every read/write behind one `lib/storage.ts` with `put / get / delete / url` so the backend swaps without touching callers.
- **Slicer file retention [DECISION]:** parsing a 50 MB G-code yields only grams and print time. Keeping every uploaded file fills a 1 GB storage quota in roughly 20 orders. Default: parse the file, persist the extracted values, and keep the original only when the host has a real disk. When the file is not kept, hide the "Slicer file" download button (6.3).
- Routes use a locale prefix: `/en/dashboard`, `/en/calculator`, etc. (the original does this; keep `/en` only).

---

## 3. Design system

The original is a dark, compact, rounded-card dashboard.

- **Layout:** left icon sidebar (collapsible via a panel icon in the top bar), top bar, content area. Max readable width about 1100 px for forms, full width for tables.
- **Theme:** Light / Dark / System toggle. **Default dark** (near-black navy background around `#0b1220`, cards slightly lighter, 12 to 16 px radius, thin borders).
- **Accent colour:** selectable: orange (default, around `#f97316`), blue, red, slate, green, purple. Accent is used for primary buttons, active sidebar item, charts' main series, links.
- **Semantic colours:** green = positive/profit/paid, amber = unpaid/warnings, red = delete/loss, blue = informational.
- **Status badges (pill, coloured):** Negotiation (amber), Confirmed (blue), Printer assigned (indigo), Printing (purple), Print error (red), Packing (orange), Delivery (teal), Done (green), Cancelled (grey), Closed (grey-dark).
- **Page header pattern:** big title + small `(i)` info icon (tooltip), optional subtitle, primary action button (orange, top right).
- **Empty states:** centred muted text with a single action button (e.g. "No dryers yet" + "Add dryer").
- **Toasts:** top right, green check (e.g. `Draft "Penny Wise" opened`).
- **Floating buttons (bottom right):** a calculator shortcut button and an assistant button. **[DECISION]** implement only the calculator shortcut; skip the assistant.
- **Top bar (left to right):** sidebar toggle, home icon + current page title, global search ("Search orders, clients, filaments..."), tools menu, theme/accent menu, currency selector (e.g. `€ EUR`), language selector (`EN`), profile menu (avatar initials, name, plan badge).
- **Theme menu:** Light / Dark / System, then an "Accent" row of 6 colour dots.
- **Currency selector:** list with symbol, ISO code, name. Minimum list: RUB, USD, EUR, GBP, CNY, JPY, BRL, KRW, TRY, KZT, UAH, BYN, PLN, ILS, ZAR (original has 22). Currency only changes the display symbol, it does not convert amounts.
- **Profile menu:** Profile, Workshop **[NOT OBSERVED, link 404s: skip]**, Subscription **[skip]**, Privacy Policy, Terms of Service, Log out.
- **Global search:** searches orders, clients, filaments (and pages); results grouped by type; press `/` or Cmd/Ctrl+K to focus. **[DECISION]**

---

## 4. Data model

Create these tables. All have `id` (uuid), `workshopId`, `createdAt`, `updatedAt`. Types: `money` = decimal, `g` = grams (decimal), `h` = hours (decimal).

### 4.1 Workshop and Settings (one row each per workshop)

`Settings` fields (defaults in brackets, taken from the real account):

| Field | Default | Notes |
| --- | --- | --- |
| printTechnology | `FDM` | `FDM`, `SLA`, `BOTH`. Hides sections not matching. Implement FDM fully; SLA optional (resin in ml). |
| electricityEnabled | true | When false electricity cost = 0 everywhere. |
| electricityMode | `single` | `single` or `day_night`. Implement `single` only. |
| electricityTariff | 0.17 | currency per kWh |
| operatorRate | 0 | per hour. 0 = labor line disabled |
| modelingRate | 0 | per hour |
| paintingRate | 0 | per hour |
| defaultMarkupPct | 30 | percent |
| markupBase | all true | booleans: material, labor, warehouse, packagingDelivery, electricity, amortization, consumablesPostprocessing |
| deductTaxes | true | "mandatory deductions" toggles: taxes, marketplaceCommission, acquiring |
| deductMarketplace | true | |
| deductAcquiring | false | |
| acquiringPct | 0 | |
| complexitySimplePct / Medium / Complex | 0 / 0 / 0 | percent markup on recommended price |
| defectAllowancePct | 0 | increases material grams by this % |
| roundingMode | `none` | `none`, `nearest_1`, `up_1`, `nearest_5`, `up_5`, `up_10` **[DECISION]** |
| currency | EUR | display |
| theme / accent | dark / orange | per user |

`TaxRegime`: `name`, `ratePct`. Seed: Simplified tax 6, Self-employed 6, Sole proprietor 20, LLC 20, VAT 5, **IVA 23** (default selected in the sample account). Users can add custom.

`MarketplaceFee` (used only in calculator "Marketplace" select): `name`, `commissionPct`, `fixedFee`. Seed: none (the account had none). Keep a small settings screen to add rows.

`LoyaltyTier`: `minOrders`, `discountPct`. Empty by default. When a client reaches a threshold the calculator **suggests** applying the discount.

`Catalogs` (settings tab "Catalogs"): editable lists of `FilamentBrand`, `MaterialType`, `FilamentModifier` (and the SLA equivalents if SLA implemented). Seed lists:

- Brands: Bambu Lab, Overture, eSun, Polymaker, Creality, FlashForge, ELEGOO, ERYONE, Other.
- Material types (new filament form): PLA, PETG, ABS, ASA, PET, PCTG, TPU, TPE, PVA, HIPS, Nylon, PA, PC, PP, PMMA, PEEK.
- Modifiers: Lite, Silk, Silk+, Matte, Marble, Galaxy, Sparkle, Translucent, Fluorescent, Glow, Wood, Metal, Dual Color, Triple Color, Quad Color, Gradient, CF, GF, Aero, HF, FR, 95A, 68D.

### 4.2 Core entities

```
Printer
  id, manufacturer, model (required), internalName, technology (FDM|SLA),
  powerW (default 200), price, lifetimeH (default 5000 in form; sample 10000),
  initialHours (default 0), hoursManual (decimal, editable "hours used"),
  note, photoUrl, groupId?, maintenanceIntervalHours?, maintenanceIntervalDays?,
  lastMaintenanceAt?
  -- derived: hoursUsed = hoursManual + initialHours + SUM(hours of orders printed on it)
  -- derived: paybackPct = earnedProfit / price

Filament
  id, name (default "PLA Basic" if empty), brand, type, modifier?, purchaseLink?,
  spoolPrice (default 1500 in form, sample 13.43), spoolWeightG (default 1000),
  spoolCount (default 1), usedFromSpoolG (default 0), colors[] (hex, up to several),
  photoUrl?, lowStockThresholdG?
  -- derived: pricePerKg = spoolPrice / spoolWeightG * 1000
  -- derived: stockG = spoolCount*spoolWeightG - usedFromSpoolG - consumed
  -- derived: lastsDays (see 5.9)

Dryer
  id, name, powerW, price, lifetimeH, hoursUsed   (optional; empty list by default)

Client
  id, name (required), phone, email, address, source (free text: Avito, Telegram...),
  discountPct, category? (FK ClientCategory), photoUrl, telegram?,
  contactPerson?, signer?, companyName?, taxId?, note
  -- derived: ordersCount, completedAmount (sum of price of Done orders), level

Model (catalog item)
  id, name (required), photoUrl, fileUrl (.gcode/.3mf/.stl), sourceLink,
  technology (FDM|SLA), groupId?, printTimeMin, extraCosts, pricePerPiece (nullable),
  complexity (none|simple|medium|complex), sellAsProduct (bool), productDescription
  ModelFilament: modelId, filamentId?, grams  (up to 16 rows)
  -- derived: materialPerPieceG = SUM(grams)

ModelGroup (folders): id, name

Order
  id, number (short code, 8 uppercase hex chars e.g. F96C0CE2), name,
  clientId?, status (enum, 5.1), paid (bool), advanceReceived (money), tips (money),
  tipsReceived (bool), trackingNumber, saleDate, dueDate?, tags[] (text), notes,
  source (default 'direct'), personalUse (bool),
  printerId?, printTimeMin, quantity, assemblyQuantity (default 1),
  -- money snapshot at save time:
  costMaterial, costElectricity, costPrinter, costDryer, costLabor, costConsumables,
  costPostprocessing, costPackaging, costDelivery, costWarehouse, costOther,
  totalCost, discountPct, discountAmount, taxRegimeId?, taxAmount,
  marketplaceFeeId?, marketplaceFee, acquiringFee,
  salePrice, revenue (= salePrice + tips), profit, netProfit, marginPct,
  materialDeducted (bool), statusDates (JSON: status -> ISO date),
  clientLinkToken (random, for public share link)
OrderMaterial: orderId, filamentId?, name, grams, pricePerKg (snapshot)
OrderService: orderId, name, cost, mode (fixed|markup), price

WarehouseShelf
  id, name, icon, link, builtIn (bool), kind (filaments|finished|rings|paints|custom), photoUrl
FinishedGood
  id, shelfId, modelId?, name, quantity, unitCost, unitPrice, photoUrl, description,
  createdFromOrderId?
WriteOff: id, kind (filament|finished|other), refId, quantity, reason, createdAt

CalendarEvent
  id, title, description, type (todo|order|reminder|appointment), color, date,
  allDay, repeat (none|daily|weekly|monthly), startTime, endTime, tags[], done (bool),
  orderId?

Document
  id, type (quote|contract|receipt|invoice|delivery_note|completion_act|utd),
  number (e.g. QT-2026-0001), clientId?, orderId?, amount, createdAt, data (JSON)
CompanyDetails: companyName, taxId, address, phone, email, signer, signerTitle,
  bankName, bic, bankAccount, correspondentAccount, logoUrl, signatureUrl

User: id, email, passwordHash, name, role (owner)
```

Relationships: Order has many OrderMaterial and OrderService; Order belongs to Client, Printer. Filament consumption is tracked through OrderMaterial when `materialDeducted = true`.

---

## 5. Business rules and formulas (the core, implement exactly)

### 5.1 Order statuses

Ordered list (stepper and Kanban columns use this order):

1. Negotiation  2. Confirmed  3. Printer assigned  4. Printing  5. Print error  6. Packing (label may read "Order assembly")  7. Delivery  8. Done  9. Cancelled  10. Closed

- The order detail **stepper shows 7 steps**: Negotiation, Confirmed, Printer assigned, Printing, Packing, Delivery, Done. Each completed step shows its date (`dd.mm`); future steps show an em dash. Print error, Cancelled and Closed are only visible in the status dropdown.
- Record the date when the order first enters each status (`statusDates`).
- Kanban hotkeys `1` to `5` map to the first five statuses.
- A new order created from the calculator defaults to the status chosen in the calculator's "Order status" picker (default Negotiation).

### 5.2 Material deduction (critical)

- Filament is deducted from stock **once**, when the order moves to **Printing**. Set `materialDeducted = true`.
- If the order is later cancelled or deleted, return only what was deducted.
- Repeating the status change must never deduct twice.
- If stock would go negative, allow it but show a warning "stock will go negative".
- Manual-material orders (no stock filament) deduct nothing.

### 5.3 Cost components (FDM)

Let `T = print time in hours` (hours + minutes/60), `Q = quantity`.

```
grams_i'          = grams_i * (1 + defectAllowancePct/100)
material          = SUM_i( grams_i' * filament_i.spoolPrice / filament_i.spoolWeightG )   // = grams * pricePerKg/1000
electricity       = electricityEnabled ? printer.powerW/1000 * T * electricityTariff : 0
printerAmort      = printer ? printer.price / printer.lifetimeH * T : 0
dryerAmort        = dryer ? dryer.price / dryer.lifetimeH * T : 0   (+ electricity of the dryer, same formula, if enabled)
labor             = operatorHours*operatorRate + modelingHours*modelingRate + paintingHours*paintingRate
warehouseItems    = SUM(item.unitCost * qty)
consumables, postProcessing, printFileCost = user-entered (Advanced mode only)
packaging, delivery = user-entered
totalCost         = material + electricity + printerAmort + dryerAmort + labor + warehouseItems
                    + consumables + postProcessing + printFileCost + packaging + delivery + SUM(services.cost)
```

If no printer is selected: electricity and amortization are 0 and the UI shows a warning: "No printer selected: depreciation and electricity aren't included, the price will come out lower than real".

### 5.3.1 Verification fixtures (must pass as unit tests)

1. **Draft "Penny Wise":** filaments Gray 28 g @13.43/1000 g, Jade White 19 g @13.43, Cocoa Brown 18 g @13.43, Preto Lab Professional 7 g @15/1000 g → per-line 0.38, 0.26, 0.24, 0.11 (display rounded), material total **0.98**. With 30% markup base = material only: price **1.27**, profit **0.29**, margin **23.1%** (margin = profit / price).
2. **Order "Charmander na janela":** 157 g total, 11 h 40 min, printer 200 W, price 150, lifetime 10 000 h, tariff 0.17 → electricity **0.40**, printer amortization **0.18**, material **2.13**, total cost **2.70**. Sale price 14.00, tips 2.00 → revenue **16.00**, profit **13.30**, margin **83.1%** (13.30 / 16.00).

### 5.4 Price, markup and profit

```
markupBase = SUM of cost items whose markupBase toggle is ON
             (items toggled OFF are still added to the price at cost, without markup)
recommendedPrice = totalCost + markupBase * markupPct/100
if complexity != none:  recommendedPrice *= (1 + complexityPct/100)
recommendedPrice *= (1 + marketingCoefficientPct/100)       // optional field, default 0
apply discount (pct and/or amount) AFTER computing the price
apply tax / marketplace fee / acquiring according to "mandatory deductions" toggles:
   tax            = price * taxRate/100
   marketplaceFee = price * commissionPct/100 + fixedFee
   acquiring      = price * acquiringPct/100
apply roundingMode to the final price
revenue = salePrice + tips
profit  = revenue - totalCost - (deductions that are toggled on)
marginPct = profit / revenue * 100
```

The calculator's pricing panel has four modes: **Auto** (use default markup %), **Markup** (user types %), **Price** (user types the final price, profit is derived), **Profit** (user types desired profit, price is derived). The UI line `Price is calculated automatically: 30%` and `30.0% of cost` shows the active markup.

Services (extra lines) have `cost` and either a fixed sale price or a markup %.

If the markup base has no item with an amount, show a warning on the markup field.

### 5.5 Quantity, models and groups

- `Catalog` source: pick a model; fills grams, filaments, time and its `pricePerPiece`.
- `Group` source: pick a model folder; rows go to "Fixed" per-piece prices; models without a price are counted at cost, not zero.
- `Stock` source: pick a finished good (selling from stock).
- Cost and price scale with `Q`.
- If a model has `pricePerPiece`, it is used as the sale price instead of cost-based calculation.

### 5.6 Order list/detail derived values

- `Profit` in table = revenue - cost, `Margin` = profit / revenue.
- Order detail shows three KPI tiles: Revenue, Profit, Net profit (with Margin under it).
- **Net profit** = profit after tax, marketplace fee and acquiring; add tips. (In the sample, dashboard net profit 31 can exceed "profit" 30 because tips are included; reproduce: `netProfit = revenue - cost - tax - fees` where revenue includes tips.)
- "Unpaid" = `paid=false`; paid toggle, advance received toggle, tips received toggle on the detail page.
- "Repeat order": copy calculation into a new order, status Negotiation, today's date; do NOT copy payment, advance, due date, tracking number, quote, documents. Stock untouched until Printing.
- "Recalculate": re-run the calculation with current prices and update the snapshot.
- "Plan / actual": **[OUT OF SCOPE]** skip.

### 5.7 Client level and loyalty

- `level` label by number of orders. Observed: "Beginner" for 1 to 2 orders. **[DECISION]** use Beginner (0 to 4), Regular (5 to 14), Pro (15+) and make the filter "All levels" work.
- Loyalty tiers from Settings: when `ordersCount >= tier.minOrders` the calculator shows a banner offering `tier.discountPct`. Empty tiers disable the feature.

### 5.8 Finished-goods stock

- "Save to warehouse" in the calculator creates or increments a `FinishedGood` with unit cost = totalCost / Q and unit price.
- Warehouse "Finished models" shelf shows quantity and total value (qty × unit cost).
- "Sell" decrements quantity and creates a stock-sale order (source `stock`).
- "Write off for personal use" creates an order with `personalUse = true` priced at cost (the calculator shows "Cost to write off"). The Orders list has a "Hide personal-use" filter.

### 5.9 Filament remaining and forecast

```
stockG = spoolCount*spoolWeightG - usedFromSpoolG - SUM(grams deducted by orders)
avgDailyUseG = grams used in last 30 days / 30   (fallback to last 90 days if zero)
lastsDays = stockG / avgDailyUseG   (if avgDailyUseG > 0), display "Lasts ~N d"
```

- Show "Lasts ~N d" under stock grams in the Filaments table.
- Dashboard card "Restock this week": filaments with `lastsDays <= 14` (red if `<= 7`), sorted ascending, e.g. "Preto Lab Professional, Lasts ~3 d".
- Filaments page header summary: `In stock: 9.7 kg · 11 spools · worth 128 €` where worth = SUM(spoolPrice × spoolCount) (observed 128 € for 11 spools; use stock-proportional value if you prefer, state your choice).

### 5.10 Printer metrics

- `hoursUsed` = auto total from orders + manual field. The printer detail shows a progress bar `Used: 430.07 h` against lifetime, and `Payback: 21% (31.747 / 150 €)`: earned money from orders on this printer divided by price.
- Maintenance: interval by print hours and by days, whichever first. If overdue, show a banner on the Printers list: `Maintenance needed: <printer>` (amber, with wrench icon).
- Settings > Maintenance lists each printer with `hours (auto + manual)`.

### 5.11 Analytics definitions

Periods: Day, Week, Month, Year with prev/next arrows and a date picker; "N orders in period".

- **Overview:** Today card (today's profit, print time today, "No urgent orders in the next 72 h" or a count of orders due within 72 h); Revenue, Net profit, Margin for period; 12-month dynamics line chart (revenue and profit); Most profitable models (orders count, profit, profit per hour); Loss-making models.
- **Finance:** Cash flow (Paid sales with count, Total cost, Accounts receivable = unpaid orders incl. in progress); Cost structure donut + list with % for Material, Electricity, Printer amortization, Consumables, Dryer amortization, Packaging, Post-processing; Profit trend (6 months) bar chart; Recent orders list; By category table (Revenue, Paid, Unpaid, Cost, Tax, Marketplace commission, Gross profit, Net profit); CSV export.
- **Production:** Order flow (median days per status, based on `statusDates`; show "No data" when empty); Orders completed per week (12 weeks bar chart); Print time (week, month, year as `Xd Yh Zm`); Material consumption (filament g, resin ml); Electricity and operator costs over 12 months; Top materials (g); Top colours (hex swatches with grams); Printer payback; Costs by printer.
- **Customers and channels:** Tied up in filament stock (value), Tied up in finished goods (value), Sales channels (Direct, marketplaces, with orders and revenue), Top clients (orders, total), Order funnel (count and amount per status).

### 5.12 Dashboard widgets

- Greeting by time of day: `Good morning/afternoon/evening, <FirstName>!` + "Here's what's happening in your business today".
- Buttons: "Refer a friend" **[skip]**, "Document" dropdown (create document shortcuts), **"New calculation"** (primary).
- 4 KPI tiles with `Week` / `Month` selectors and a mini bar chart (last 7 days or 12 weeks): **In progress** (count of orders in statuses 2 to 7 not done), **Revenue** (+ % vs previous period badge), **Profit** (+ % badge), **Clients** (total count).
- "ANALYTICS" row with a `30 days · compared to previous period` selector and cards: **Active printers** (live printer status, empty text "No printers running right now"; without monitoring integration show printers whose status is Printing from Kanban), **Order funnel** (bars per status with counts), **Top materials by usage** (total + top 5 bars), **Orders and clients by weekday** (grouped bar, Mon to Sun).
- **Events** list: "New order <name>, date" and "New client <name>, date" (last 5, linked).
- **To-do** card ("No tasks planned" + "Open calendar").
- **Restock this week** list.

---

## 6. Screens (what to build, tab by tab)

For each screen: route, layout, controls. Tables share these behaviours: column sort, column picker ("Columns"), remembered sort, search box, row hover actions, row delete (trash icon) with confirm, empty state.

### 6.1 Calculator `/en/calculator`

Page header: "Calculator (i)".

Top row:
- **Templates** chips (saved calculations, up to 15). Clicking a chip loads it. Buttons: "Save as template" (bookmark icon), "All templates" (list icon: search, rename, update from current, delete with undo).
- Right side: **Paste a conversation** (textarea modal: paste chat text, parse model name, quantity, deadline, client, material heuristically **[DECISION: simple regex; optional]**), **Drafts (N)** (list with time, open, delete; max 5), **Start over** (clears form; offers Restore for 7 s).
- Draft autosave: after any input, store a draft (localStorage immediately, server after 3 s). Show `Draft saved · hh:mm`. When leaving with unfinished input, next visit shows a banner: `Unfinished calculation "<name>" · <time>` with **Continue** and **Hide**.

Two-column layout, left = form (collapsible cards), right = sticky **COST BREAKDOWN** panel.

**Form (left), cards in order:**

0. `Advanced mode` checkbox ("Labor, price simulation, detailed breakdown"). When on, extra fields appear: Consumables, Post-processing, Print file cost.
1. **MODEL:** `Model name` input; segmented control `Catalog | Group | Stock` with a selector ("None selected" dropdown with search, shows thumbnail); `Quantity (pcs)` (default 1).
2. **MATERIAL:** dropzone "Drop a .gcode or .3mf file" (see 6.1.1). Toggle `From stock | Manual`. From stock: `Filament` select + `Usage (g)`; `Additional filaments` list with Add (each: filament select + grams). Manual: grams + `Price per kg` + optional name (deducts nothing).
3. **EQUIPMENT:** `Printer` select (list from Printers); `Print time` fields `h` and `min`; `Dryer` select. Warning text when no printer.
4. **LABOR:** three rows (Operator work, Modeling, Painting). Each has an hours input. If the rate in Settings is 0, show an inline notice: "Enable the rate in Settings → Calculation to include this cost" with a link.
5. **CONSUMABLES & PACKAGING:** `Warehouse items` (Add item: picks from warehouse shelves with quantity; "Open warehouse" link; shows "No items"), `Packaging` (money), `Delivery` (money). **[SKIP]** CDEK/Yandex delivery quote prompts. In Advanced mode: Consumables, Post-processing, Print file cost.
6. **SALE:** `Client` select (or "No client", with quick-create); `Discount` as `%` and `€` fields; `Tax regime` select (default IVA 23%) + "Custom %" + "Add tax rate"; `Marketplace` select ("No marketplace") + "Custom %".
7. **ORDER DETAILS:** `Sale date` (datetime), `Due date`, `Tags` (chips), `Notes`.

**Right panel: COST BREAKDOWN** (shows "Fill in the form to calculate" until valid):
- `PRODUCTION` group with total, `Material` with per-filament lines (colour dot, name, grams, cost), Electricity, Printer, Dryer.
- `SERVICES`: inputs `Service name`, `Cost`, price mode (`Fixed | Markup %`), `Sale price`, **Add service**.
- **Total cost.**
- Price mode tabs: `Auto | Markup | Price | Profit`, with note text.
- `COMPLEXITY MARKUP`: `None | Simple | Medium | Complex` (pills).
- `MARKETING COEFFICIENT %` input.
- **Sale price**, **Profit**, `Margin x%`, `y% of cost`.
- `ORDER STATUS` pill picker (Negotiation, Confirmed, Printer assigned, Printing, Print error, Packing, Delivery, Done, Cancelled, Closed).
- Buttons: **Save order**, **Save to warehouse**, checkbox `Include labor (operator/painting/modeling)`, `Cost to write off x €`, **Write off for personal use**.
- **Calculation review / Review** button: **[SKIP]** (AI review).

#### 6.1.1 Slicer file upload

Accept `.gcode`, `.3mf` (50 MB max). Parse client-side or server-side:
- `.3mf` (zip): read `Metadata/slice_info.config` (Bambu: `<filament id type color used_g used_m>`, `prediction` seconds) and `Metadata/*.gcode` header comments; PrusaSlicer/Orca: `; filament used [g] =`, `; estimated printing time (normal mode) = 1h 10m 5s`.
- `.gcode`: scan header/footer comments for `filament used [g]`, `total filament weight`, `estimated printing time`.
- Fill grams per filament (match by colour/type to stock filaments if possible), print time, then show a toast. If the 3MF has no slicing results, show hint: "Export plate sliced as 3MF (File → Export → Export plate sliced as 3MF)". Plain `.stl` gives only a (optional) 3D preview with no auto-calculation.

#### 6.1.2 Saving

- **Save order:** creates Order with snapshots, `status` from picker, `materialDeducted` true only if status is Printing (or later through the transition rule). Deletes the draft. Redirects to the order detail.
- **Save to warehouse:** see 5.8.
- **Write off:** see 5.8.
- Lite-plan limits and watermark behaviours are **out of scope**.

### 6.2 Orders `/en/orders`

- Header "Orders (i)", count line `Orders: N`.
- Toolbar: search, **Filters** popover (Status select, Order source select "All orders", Payment select "Payment: all / paid / unpaid", Order date From/To, checkbox "Hide personal-use"), sort select ("Newest first", oldest, price, profit), view toggle (grid cards | table), **Columns** picker, **Kanban** button (navigates to Kanban), **CSV** export, **Sell a service** (creates an order without materials: name, price, client), **New order** (primary, goes to Calculator).
- Table columns: checkbox, Model (thumbnail, name, time), Status badge, Payment badge (Paid green / Unpaid amber), Client, Material (colour dot + name/brand), Cost, Price, Profit (green), Margin %, delete icon.
- Rows grouped by date headings ("October 27, 2026").
- Bulk select enables bulk delete / status change **[DECISION: simple bulk status + delete]**.

### 6.3 Order detail `/en/orders/:id`

- Back link "Back to list". Title + status badge + date (`dd.mm.yyyy`).
- Action buttons: **Preview** (quote preview), **Slicer file** (download stored file), **Recalculate**, **Repeat order**, **Print QR**, delete (red).
- **Status stepper** (7 steps with icons, connecting lines filled up to the current step) + a status dropdown at right.
- **Link for client** button: generates `/public/order/:token` showing status and quote without signing up (read-only page). The route is always built, but it is only reachable by the client when the app has a public URL. On a LAN-only install the button must be hidden or disabled with the hint "Needs a public URL" (see the local build guide).
- KPI tiles: Revenue, Profit, Net profit (+ Margin).
- **MODEL BREAKDOWN** card: model name, `qty pcs · N g`, `Material x € · Equipment y €`, Revenue, Cost, Profit/pc.
- **MATERIAL & EQUIPMENT** card: Assembly quantity, filament list (colour, name, grams), Usage (g), Printer, Print time, Quantity.
- **COST BREAKDOWN** card: Material, Electricity, Printer, (others if non-zero), Total cost, **Add service to order** button, Sale price, Tips.
- **CLIENT** card: client name (link), toggles Paid, Advance received, Tips received, Tracking number input.
- **ORDER QR CODE:** render a QR image encoding the order short code (e.g. F96C0CE2) with the explanation "Scan on the orders screen to select this order". Displaying and printing the QR is in scope. **Scanning it with a camera is [OPTIONAL, not in the first version]:** `getUserMedia` requires a secure context, so a camera scanner works on `localhost` but fails on a plain `http://` LAN address. Build the orders-screen scanner only once HTTPS is in place; until then the orders search box covers the same need.
- **OVERHEADS:** Printer amortization etc.
- **DOCUMENTS:** buttons Quote / Invoice, Delivery note (UPD and marking-code scan are Russia-specific: **[SKIP]**).

### 6.4 Kanban `/en/production`

- Toolbar: search, sort select (default "Color → time ↑"), `By printer` toggle (lanes per printer, with queue length), `TV mode` (full-screen read-only board, large text) **[optional]**, `List` toggle, **New order** (goes to Calculator), **Filters**.
- Columns (headers show count): Negotiation, Confirmed, Printer assigned, Printing, Print error, Packing, Delivery, Done, Cancelled, Closed. Column header shows summed print time and grams for the column (e.g. `11h 40m · 157 g`).
- Card: model name, paid badge, filament chips ("PLA · 0h 59m"), client name, printer (printer icon + name), due date ("Due date…"), price. Drag between columns changes status (apply rules in 5.1 and 5.2).
- Hotkeys footer: `↑↓←→ navigate, 1–5 status, Shift+click multi-select, Enter open, Del delete, Esc clear`.
- Cards that cannot meet the due date in a printer lane show "Won't make the deadline: ready ~…" **[optional]**.

### 6.5 Clients `/en/clients`

- Header "Clients (i)", count line `N clients`, search, `All levels` select, view toggle (cards | grid | table), **New client**.
- Table columns: avatar/initials, Name, Phone, Telegram (icon), Level badge, Orders (count), Completed (money), Discount, delete.
- **New client dialog:** Name* , Phone, Email, Address, Source (placeholder "Avito, Telegram..."), Discount %, Category select ("No category"), Photo upload, Cancel / Save.
- **Client detail `/en/clients/:id`:** header with name and `N orders · X €`; tabs **Contacts** (all fields above + category, photo, Telegram invite button **[skip]**), **Company details** (contact person, signer, company name, tax ID), **Orders (N)**, **Documents**.

### 6.6 Printers `/en/printers`

- Filter chips `All N | FDM N | SLA N`, search, view toggle (list | grid | table), **Group** (create printer groups), Bambu Cloud / Anycubic Cloud buttons (**[SKIP]**), **New printer**, `N printers`, maintenance alert banner, **Columns**.
- Table: Name (+ model subtitle, thumbnail), Group, Technology badge, Status, Power (W), Price, Lifetime (h) as `430 h / 10,000 h`, Payback %, row menu.
- **New printer dialog:** Catalog select (preset list of common printers with default power/price **[DECISION: ship ~15 presets: Bambu Lab A1 mini, A1, P1S, X1C, Prusa MK4, Ender 3 V3...]**), Manufacturer, Model*, Internal name (hint: tells apart identical printers), Power (W) default 200, Price, Lifetime (h) default 5000, Initial hours default 0, Note, Photo.
- **Printer detail `/en/printers/:id`:** header image + name, usage bar (`Used: 430.07 h`, `Printing hour ~0 € · Last 30 days: 2 €`, payback bar), tabs **Parameters** (all fields above + Technology FDM/SLA toggle + Hours used), **Maintenance** (interval hours/days, last done, "Mark done"), **Cloud** **[SKIP]**, **Prints** (list of orders printed on it **[DECISION: derive from orders]**), **Usage History** (hours by month **[optional]**). Buttons: favourite star, Print QR, delete.

### 6.7 Dryers `/en/dryers`

Same pattern as Printers but simpler: "Dryers", **New dryer**, `0 dryers`, empty state "No dryers yet" + "Add dryer". Fields: name, power W, price, lifetime h, hours used. **[NOT OBSERVED: form]**; use these fields.

### 6.8 Model Catalog `/en/models`

- Header "Model Catalog (i)", search, technology filter `All | FDM | SLA`, sort ("By name"), view toggle, **Group** (folder), **New model**, **Columns**.
- Table: thumbnail + name + filament name, Group, Technology badge (orange FDM), Material per piece (g), Print time (`1 h 10 min`), Price per piece, For sale (chip), File.
- Row action: **To calculator** (opens a new calculation prefilled; the previous unfinished calculation stays in Drafts).
- **New model dialog:** Name*, MW import (**[SKIP]**), Photo, Model file dropzone (G-code/3MF auto-fills weight/time), Filament list (up to 16: filament select + grams, "Add filament"), Print time (h, m), Extra costs, Price per piece (hint: used as sale price when ordering instead of cost-based), Manufacturing complexity (Not set, Simple, Medium, Complex), Source link (Copy, Paste), checkbox "Sell this model as a product" with Product description + "Generate with AI" **[SKIP AI; keep the textarea]**, Cancel / Save.

### 6.9 Warehouse `/en/warehouse`

- Header "Warehouse", subtitle "Filaments, finished models, packaging and custom shelves". Buttons: view toggle (grid | table), **Write-offs** (list of write-offs), hide icon (show/hide shelves), **New shelf**, **Columns**.
- Table: drag handle, shelf (icon + name + optional "Coming soon"), Type ("Built-in shelves"), Quantity (pcs), Total value.
- Built-in shelves (seed): **Filaments** (opens Filaments page), **Keychain rings** (components), **Paints** (disabled, "Coming soon"), **Finished models**. Users can add custom shelves.
- **New shelf dialog:** Photo, Icon select ("No icon"), Name*, Link, Cancel / Save. A custom shelf holds items (name, qty, unit cost) used by "Warehouse items" in the calculator and deducted when an order starts printing.

### 6.10 Filaments `/en/filaments`

- Breadcrumb "Warehouse > Filaments (i)". Toolbar: search, **Filter**, view toggle, **Select** (multi-select mode), **Import from Excel/CSV**, **From Bambu Cloud** (**[SKIP]**), **New filament**.
- Link "Spool remaining calculator" (small tool: enter spool weight on scale and empty-spool weight, outputs grams left; optional).
- Summary bar: `In stock: 9.7 kg · 11 spools · worth 128 €`.
- Table: Name (colour dot + name + brand), Brand, Type badge, Color swatch, Spools, Stock (grams + "Lasts ~N d"), Spool price (`13.43 €` + `13 €/kg`), row menu.
- **New filament dialog:** Name (placeholder "PLA Basic"; empty uses it), Brand select (+ "Other, manually"), Type select, Modifiers select, Purchase link, Spool price, Spool weight (g) default 1000, Spool count (stepper, default 1), Used from spool (g), Colors (swatches + hex input), Photo, Cancel / Save.
- CSV import columns: name, brand, type, color, spoolPrice, spoolWeightG, spoolCount.

### 6.11 Calendar `/en/calendar`

- Header "Calendar (i)", subtitle "Orders, appointments, to-dos and reminders, all in one place.". View select (Month default; add Week, Day), prev/next arrows, **Today**, date picker, title "October 2026", **Filters** (event type), **New event**.
- Month grid Mon to Sun; show orders (by due date) and events as coloured chips; click day to add event.
- **New event dialog:** Title, Description, Type (To-do default), Color, Date, All day, Repeat (Doesn't repeat, daily, weekly, monthly), Start, End, Tags, Done checkbox, Cancel / Save.
- Google/Apple sync banners: **[SKIP]** (show nothing).

### 6.12 Documents `/en/documents`

Tabs: **Documents** and **Company details**.

- **Client documents** card grid (each card: icon, title, subtitle, **Create** button): Commercial proposal ("Pricing for work and materials"), Contract ("Template for 3D printing work"), Payment receipt ("Simple receipt without a cash register"), Invoice ("Bank details, amount, VAT"), Delivery note ("For shipping goods"), Certificate of completion ("Closes the deal with a business client"). Universal transfer document is Russia-specific: **[SKIP]**.
- **Minimal replica:** implement Proposal (quote), Invoice, Receipt, Delivery note as PDFs. Contract and Completion act can be generic templates **[optional]**.
- Document numbering: `QT-YYYY-NNNN` for quotes (e.g. `QT-2026-0001`); use `INV-`, `RC-`, `DN-`, `CT-`, `AC-` prefixes **[DECISION]**; counter resets per year.
- Create flow: choose client + order (prefills lines from the order), set date, items table (name, qty, price, VAT %), totals, preview, download PDF.
- **DOCUMENT FOLDERS** list below: filters (type, client, date from/to), grouped by client with counts; table columns Type, Document number, Created, Amount, Orders, Actions (open, download, delete).
- **Company details tab:** logo upload, signature upload (PNG/JPG up to 10 MB), General (Company name, INN/tax ID, KPP, OKPO, Address, Phone, Email, Signer, Signer title), Bank (Bank name, Bank INN, Bank KPP, BIC, Bank account, Correspondent account). **[DECISION]** keep Company name, tax ID, address, phone, email, signer, signer title, bank name, BIC, account.
- Storage-provider links (Yandex Disk, Google Drive): **[SKIP]**.

### 6.13 Analytics `/en/analytics` (tabs via `?tab=finance|production|customers`)

Implement as defined in 5.11. Common header: period buttons Day / Week / Month / Year, prev/next arrows with label ("October 2026"), calendar icon, caption `N orders in period`. Overview hero card has a big orange gradient (today's profit). `/en/finance` redirects to the Finance tab.

### 6.14 Settings `/en/settings`

Top tabs: **General**, **Integrations**, **Delivery**, **Sync**, **Backups**, **About**. Minimal replica builds General, Sync, About and a simple Backups.

**General** has sub-tabs (pill buttons): **Calculations**, **Catalogs**, **Taxes**, **Loyalty**, **Maintenance**.

- **Calculations:** blocks in order: Print technology (Both | FDM | SLA), Electricity (mode Single tariff | Day/Night, switch "Include electricity in calculations", tariff in currency/kWh), Labor (operator, modeling, painting rates), Markup (Default markup %, "MARKUP BASE: WHAT'S INCLUDED" with the 7 switches and descriptions: Material, Labor, Warehouse, Packaging and delivery, Electricity, Printer and dryer amortization, Consumables and post-processing), Mandatory deductions (Taxes, Marketplace commission, Acquiring; each "adds ... on the current base"), Manufacturing complexity markup (Simple %, Medium %, Complex %), Defects & rounding (Defect allowance %, Rounding mode).
- **Catalogs:** grouped lists (Filaments: brands, material types, modifiers; Resins: brands, types, modifiers) as editable chips with counts; add/remove.
- **Taxes:** "Tax systems and rates" list with Add; seeded rates; Payment processing (acquiring) with switch "Include acquiring fee in calculations" and a percent field.
- **Loyalty:** "LOYALTY PROGRAM" description, **Add tier** rows (orders threshold, discount %), Save.
- **Maintenance:** per printer line showing total hours (`430.07 h (32.8 auto + 397.27 manual)`) and a link to configure intervals on the printer page.
- **Integrations / Delivery:** **[SKIP]**. Show a "Not available in this version" notice or hide the tabs.
- **Sync:** Export settings as JSON (markup, rates, catalogs; no orders/clients/warehouse), Import (JSON file, replaces settings, adds orders/clients), "Need a full data backup? See the Backup section".
- **Backups:** **[NOT OBSERVED: route 404]**. Implement "Download full backup (JSON)" and "Restore from backup".
- **About:** app name, version, account name/email, plan badge, links (Privacy, Terms), contact email.

### 6.15 Profile `/en/profile`

Tabs: **Profile** (name, email read-only with hint "To change your email, open the Security tab", avatar upload, Save), **Security** (change password), **Notifications** (toggles for e.g. low filament, overdue orders; email only), **Danger zone** (delete account). Storage card (`59 MB of 5 GB`) and "My generations" are **[SKIP]**.

### 6.16 Top-bar tools menu (optional extras)

Original has ~24 free tools (3D viewer, spool calc, G-code analyzer, lithophane, lamp shades, vases, printer picker, converter, boxes, Gridfinity, molds, QR plates, SKÅDIS, nameplates, keychains, pet tag, terrain map, garden marker, text flip, electricity, overhangs, STL repair, documents). **[SKIP]** all but a simple **Spool calc** and **Electricity cost calculator** if time permits.

### 6.17 Team `/en/team`

Original: paid feature (Members, Invite, Roles & access; built-in roles Owner, Co-owner, Operator, Storekeeper; per-section View/Create/Edit/Delete permissions plus a "See money" permission). **[OUT OF SCOPE]**. Show the Team page as a single member (the owner) with "Delete workshop" in a danger area, or hide it.

### 6.18 Marketplaces `/en/marketplaces`

**[OUT OF SCOPE]** (Ozon, Wildberries, Yandex Market, Avito). Only keep a *"Calculator commissions"* mini-form inside Settings (name, commission %, fixed fee) used by the calculator's "Marketplace" select.

---

## 7. API surface (suggested REST, JSON)

```
POST   /api/auth/register | login | logout
GET    /api/me                         PATCH /api/me
GET/PUT /api/settings
CRUD   /api/printers, /api/dryers, /api/filaments, /api/clients, /api/models, /api/model-groups
CRUD   /api/orders                     PATCH /api/orders/:id/status  (applies 5.1/5.2)
POST   /api/orders/:id/repeat | recalculate
GET    /api/orders/:id/public/:token   (read-only client view)
POST   /api/calculator/compute         (pure function: input form -> breakdown; no side effects)
POST   /api/calculator/parse-slicer-file
CRUD   /api/calculator/templates, /api/calculator/drafts
CRUD   /api/shelves, /api/finished-goods, /api/write-offs
CRUD   /api/events
CRUD   /api/documents                  GET /api/documents/:id/pdf
GET/PUT /api/company-details
GET    /api/analytics/overview|finance|production|customers?from=&to=
GET    /api/dashboard
GET    /api/search?q=
GET    /api/export (full JSON)         POST /api/import
```

Put the cost math in a **single pure module** (`lib/pricing.ts`) used by both the browser (live panel) and the server (saving). Cover it with the fixtures in 5.3.1.

---

## 8. Permissions and plans **[DECISION]**

The original has plan tiers (Lite, Basic, Pro, Web Plus, Web Team) with limits. The replica has **no plans**: all features unlocked, single owner. Show a static "Web Plus" style badge only if you want visual parity (optional).

---

## 9. Non-functional requirements

- Responsive: sidebar collapses to icons; works down to about 390 px width (tables scroll horizontally, Kanban scrolls horizontally).
- Live updates: after saving, the calculator panel, orders list and dashboard reflect changes without full reload (TanStack Query invalidation).
- Performance: analytics queries paginate or cap at 5000 orders; show a warning "totals may be incomplete" above the cap.
- Accessibility: keyboard focus rings, aria-labels on icon buttons, colour is never the only status indicator (badge text always present).
- Dates in `dd.mm.yyyy` for detail headers and `MM/DD/YYYY` in documents/tables as observed; use one date formatting util and a setting later.
- Security: hash passwords, CSRF-safe cookies, validate all input with zod, authorize every record by `workshopId`.

### 9.1 Mobile and interaction requirements

- **Mobile-first.** Every screen is usable one-handed at 390 px. Below 768 px tables switch to the card view automatically (the view toggle still works), and the sidebar becomes a bottom tab bar with the five most-used modules (Dashboard, Calculator, Orders, Kanban, Clients) plus a "More" sheet for the rest.
- **Touch targets** are at least 44x44 px. Dialogs render as bottom sheets below 768 px.
- **Calculator on mobile:** the COST BREAKDOWN panel collapses into a sticky bottom bar showing Total cost / Sale price / Profit; tapping it expands the full panel.
- **Kanban on mobile:** horizontal snap-scroll between columns. Drag works by touch (dnd-kit `PointerSensor`), and every card also carries a status dropdown as the non-drag fallback, so the board is never drag-only.
- **Dynamic feedback:** the cost panel recalculates on every input with no "Calculate" button; mutations are optimistic with rollback on error; loading states use skeletons, not spinners; destructive actions show a 5 s undo toast instead of a confirm dialog, except order delete, which confirms.
- **Inputs:** numeric fields set `inputMode="decimal"`. Money and gram fields accept both `.` and `,` as the decimal separator.
- **Motion:** 150 to 200 ms transitions, and respect `prefers-reduced-motion`.

---

## 10. Quality checks (global)

1. Unit tests for `lib/pricing.ts` with fixtures from 5.3.1.
2. Integration test: create filament, printer, client; compute and save an order; move it to Printing; verify stock decreased by exactly the grams; move to Cancelled; verify stock restored; repeat transitions to confirm no double deduction.
3. Visual check: dark theme, orange accent, Kanban columns, order stepper.
4. Every sidebar link resolves, no dead routes.
5. Responsive pass at 390 px: no horizontal page scroll, bottom tab bar present, Kanban reachable without a mouse, calculator totals readable without scrolling past the form.

---

## 11. Seed data (so the UI is populated)

Use this to create a demo workshop (names are from the observed account; amounts in EUR).

**Settings:** electricity 0.17 €/kWh, default markup 30%, tax regime IVA 23%, other values per section 4.1.

**Printer:** `Bambu Lab A1 mini`: FDM, 200 W, price 150, lifetime 10 000 h, hours used 430.07 (32.8 auto + 397.27 manual), maintenance alert active.

**Filaments (11):**

| Name | Brand | Type | Spool price | Stock g |
| --- | --- | --- | --- | --- |
| PLA Basic Bambu Green · 10501 | Bambu Lab | PLA | 13.43 | 1000 |
| PLA Basic Beige · 10201 | Bambu Lab | PLA | 11.41 | 1000 |
| PLA Basic Cocoa Brown · 10802 | Bambu Lab | PLA | 13.43 | 982 |
| PLA Basic Cyan · 10603 | Bambu Lab | PLA | 13.43 | 1000 |
| PLA Basic Gray · 10103 | Bambu Lab | PLA | 13.43 | 968 |
| PLA Basic Jade White · 10100 | Bambu Lab | PLA | 13.43 | 950 |
| PLA Basic Pink · 10203 | Bambu Lab | PLA | 11.41 | 1000 |
| PLA Basic Pumpkin Orange · 10301 | Bambu Lab | PLA | 13.43 | 901 |
| PLA Basic Sunflower Yellow · 10402 | Bambu Lab | PLA | 13.43 | 954 |
| Preto Lab Professional | lab professional | PLA | 15.00 | 141 |
| Vermelho China | china | PLA | 15.00 | 830 |

**Clients (7):** Angela Gama Gym, Avó Carma (phone 967-690-757), Diogo Matos, Joana Rodrigues, Lara Ribas Gym, Mariana VS Gym, Soraia Almeida Gym.

**Models (10, FDM):** Altere 20kg Verm E Preto (9.2 g, 1 h 10 min, 3 €), Anilha Personalizada (Colada) (5.67 g, 37 min, 3 €), Anilha Personalizada Em Amarelo (5.7 g, 37 min), Barra Com Anilhas Removiveis (8.29 g, 56 min, 3 €), Cao Branco (8 g, 55 min), Dragão (175 g, 10 h 7 min), ketlebell 24kg red (5.2 g, 59 min, 3 €), Kettlebell 24kg Grey (5.2 g, 59 min), Penny Wise (72 g, 5 h), Porta chaves (6 g, 44 min, 3 €).

**Orders (10, source direct), newest first:**

| Name | Date | Status | Paid | Client | Cost | Price |
| --- | --- | --- | --- | --- | --- | --- |
| Charmander na janela | 2026-10-27 | Packing | No | Joana Rodrigues | 2.70 | 14 (+2 tips) |
| Penny Wise | 2026-10-26 | Done | Yes | Diogo Matos | ~1 | 5 |
| Dragão | 2026-10-26 | Done | Yes | Diogo Matos | ~3 | 13 |
| Kettlebell 24kg Grey | 2026-10-23 | Delivery | Yes | Soraia Almeida Gym | ~0.2 | 3 |
| Cao Branco | 2026-10-23 | Delivery | No | Avó Carma | ~0.4 | 3 |
| Anilha Personalizada Em Amarelo | 2026-10-23 | Done | Yes | Mariana VS Gym | ~0.2 | 3 |
| Altere 20kg Verm E Preto | 2026-10-17 | Done | Yes | Soraia Almeida Gym | ~0.2 | 3 |
| Anilha Personalizada (Colada) | 2026-10-16 | Done | Yes | Lara Ribas Gym | ~0.1 | 3 |
| ketlebell 24kg red | 2026-10-16 | Done | Yes | Angela Gama Gym | ~0.1 | 3 |
| maria Carmo porta chaves | 2026-10-09 | Done | Yes | Avó Carma | ~0.3 | 3.5 |

**Warehouse shelves:** Filaments (11 pcs, 128 €), Keychain rings (1 pc, 8 €), Paints (coming soon), Finished models (6 pcs, 6 €).

**Templates:** "altere 20kg", "Anilha Personalizada (Colada)", "kettlebell verm e preto".

**Expected dashboard (October 2026, for sanity):** In progress 0, Revenue ≈ 24 with +167% badge, Profit ≈ 19 with +123%, Clients 7; funnel Negotiation 0, Confirmed 0, Printing 0, Packing 1, Done 7, Delivery 2; Analytics (month): Revenue ≈ 37, Net profit ≈ 31, Margin ≈ 84.5%.

---

## 12. Build phases and acceptance checks

**Phase 1: Foundation.**
Auth, app shell (sidebar, top bar, theme/accent, currency), Settings (all General sub-tabs), seed script.
*Accept:* log in, switch theme/accent/currency, edit settings, values persist; all sidebar links route (pages may be empty states).

**Phase 2: Equipment and materials.**
Printers (list, create, detail, hours, maintenance), Dryers, Filaments (list, create, CSV import, summary, "Lasts ~N d" logic), Catalogs.
*Accept:* seeded printer and 11 filaments shown; summary reads `9.7 kg · 11 spools · worth 128 €`; per-kg price shows `13 €/kg`.

**Phase 3: Calculator.**
`lib/pricing.ts`, calculator form and live cost panel, services, complexity, price modes, taxes, discount, templates, drafts, slicer file parsing, save order / save to warehouse / write off.
*Accept:* both fixtures in 5.3.1 reproduce exactly; draft survives a page reload; template loads; saving an order redirects to its page.

**Phase 4: Orders and production.**
Orders list (filters, columns, CSV, grouping), order detail (stepper, KPIs, cost, paid toggles, QR, repeat, recalculate, share link), Kanban (drag, hotkeys, by-printer), stock deduction rules.
*Accept:* integration test in section 10 passes; Kanban drag changes status and dates; client share link opens read-only.

**Phase 5: CRM and catalog.**
Clients (list, dialog, detail tabs, levels, loyalty banner), Model Catalog (create, file auto-fill, "To calculator"), Warehouse (shelves, finished goods, write-offs).
*Accept:* client counts and completed totals match orders; "To calculator" prefills grams, time, price.

**Phase 6: Insight.**
Dashboard, Analytics (4 tabs, period selector, CSV), global search, Calendar (month view + events + orders by due date).
*Accept:* seeded data yields the sanity numbers in section 11; changing the period updates charts; search finds an order, client and filament.

**Phase 7: Documents and polish.**
Company details, quote / invoice / receipt / delivery note PDFs with numbering, document folders list, backups/export-import, responsive pass, empty states, toasts.
*Accept:* quote `QT-2026-0001` downloads as a PDF with logo, items, totals; export then import restores data.

---

## 13. Explicitly out of scope (do not build unless asked)

- Marketplaces (Ozon, Wildberries, Yandex Market, Avito, Megamarket): listing wizards, shipments, returns, finance, AI card text.
- Team plan, roles, "See money" permission, invitations.
- Integrations: MoySklad, YooKassa, CDEK, Yandex Delivery, Google/Apple Calendar, webhooks, access tokens, slicer plugin, Telegram bot and notifications, Bambu/Anycubic cloud, Klipper/OctoPrint monitoring agent.
- Billing: plans (Lite, Basic, Pro, Web Plus, Web Team), lifetime licence, storage packs, referral programme, tips to developer.
- Public site: landing page, masters directory (workshops by city), blog, help center, public demo calculator, changelog page, mobile apps.
- Free tools (24 generators/converters) except optional spool and electricity calculators.
- Russia-specific features: UPD, Chestny ZNAK marking codes, RU tax regimes beyond seeded names.
- AI features: assistant widget, AI calculation review, AI product text, AI insights, weekly digest.
- Multi-language UI (only English), 11-language emails.
- Cloud storage sync (Yandex Disk, Google Drive), storage quotas.

---

## 14. Known gaps in the source analysis (use the stated default)

| Item | What to do |
| --- | --- |
| Settings > Backups route returned 404 | Build simple full-backup download/restore. |
| Dryers creation form not opened | Use name, power W, price, lifetime h, hours used. |
| Kanban "By printer" and "TV mode" not opened | Implement as lanes per printer / large read-only board. |
| Model detail page not opened | Reuse the New model dialog as an edit page. |
| Client Orders and Documents tabs not opened | List the client's orders and documents in simple tables. |
| Printer Maintenance, Cloud, Prints tabs not opened | Maintenance: interval hours/days + last done. Skip Cloud. Prints: derive from orders. |
| Document PDF layout not seen | Use a clean one-page layout: logo and company block top left, document number/date top right, client block, items table, totals, signature at bottom. |
| Calendar week/day views not opened | Implement Month; Week/Day are optional. |
| Exact level thresholds for clients | Use Beginner / Regular / Pro as in 5.7. |
| Printer "Pays off in ~N h" formula | Optional; payback % = earned profit / price is enough. |
| "Net profit" exact formula | Use revenue (incl. tips) − cost − tax − fees, as in 5.4. |
| Rounding mode options | Use the list in 4.1. |

---

## 15. Definition of done

- All 7 phases pass their acceptance checks.
- Both numeric fixtures (5.3.1) pass as automated tests.
- The seeded app visually matches the original structure: dark navy theme, orange accent, left sidebar with the 11 modules, top bar with search/theme/currency/profile.
- A user can complete this flow end to end: add a filament and a printer, calculate a print from a G-code file, save it as an order for a new client, drag it through Kanban to Done, see revenue and profit on the Dashboard and Analytics, and download a quote PDF.
