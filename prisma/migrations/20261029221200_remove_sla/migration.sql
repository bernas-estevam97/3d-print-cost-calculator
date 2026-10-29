-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Model" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "fileUrl" TEXT,
    "sourceLink" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "printTimeMin" REAL NOT NULL DEFAULT 0,
    "extraCosts" REAL NOT NULL DEFAULT 0,
    "pricePerPiece" REAL,
    "complexity" TEXT NOT NULL DEFAULT 'none',
    "sellAsProduct" BOOLEAN NOT NULL DEFAULT false,
    "productDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Model_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Model_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModelGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Model" ("complexity", "createdAt", "extraCosts", "fileUrl", "groupId", "id", "name", "photoUrl", "pricePerPiece", "printTimeMin", "productDescription", "sellAsProduct", "sourceLink", "updatedAt", "workshopId") SELECT "complexity", "createdAt", "extraCosts", "fileUrl", "groupId", "id", "name", "photoUrl", "pricePerPiece", "printTimeMin", "productDescription", "sellAsProduct", "sourceLink", "updatedAt", "workshopId" FROM "Model";
DROP TABLE "Model";
ALTER TABLE "new_Model" RENAME TO "Model";
CREATE TABLE "new_Printer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "internalName" TEXT NOT NULL DEFAULT '',
    "powerW" REAL NOT NULL DEFAULT 200,
    "price" REAL NOT NULL DEFAULT 0,
    "lifetimeH" REAL NOT NULL DEFAULT 5000,
    "initialHours" REAL NOT NULL DEFAULT 0,
    "hoursManual" REAL NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "photoUrl" TEXT,
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,
    "maintenanceIntervalHours" REAL,
    "maintenanceIntervalDays" INTEGER,
    "lastMaintenanceAt" DATETIME,
    "lastMaintenanceHours" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Printer_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Printer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PrinterGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Printer" ("createdAt", "favourite", "groupId", "hoursManual", "id", "initialHours", "internalName", "lastMaintenanceAt", "lastMaintenanceHours", "lifetimeH", "maintenanceIntervalDays", "maintenanceIntervalHours", "manufacturer", "model", "note", "photoUrl", "powerW", "price", "updatedAt", "workshopId") SELECT "createdAt", "favourite", "groupId", "hoursManual", "id", "initialHours", "internalName", "lastMaintenanceAt", "lastMaintenanceHours", "lifetimeH", "maintenanceIntervalDays", "maintenanceIntervalHours", "manufacturer", "model", "note", "photoUrl", "powerW", "price", "updatedAt", "workshopId" FROM "Printer";
DROP TABLE "Printer";
ALTER TABLE "new_Printer" RENAME TO "Printer";
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "electricityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "electricityMode" TEXT NOT NULL DEFAULT 'single',
    "electricityTariff" REAL NOT NULL DEFAULT 0.17,
    "operatorRate" REAL NOT NULL DEFAULT 0,
    "modelingRate" REAL NOT NULL DEFAULT 0,
    "paintingRate" REAL NOT NULL DEFAULT 0,
    "defaultMarkupPct" REAL NOT NULL DEFAULT 30,
    "mbMaterial" BOOLEAN NOT NULL DEFAULT true,
    "mbLabor" BOOLEAN NOT NULL DEFAULT true,
    "mbWarehouse" BOOLEAN NOT NULL DEFAULT true,
    "mbPackagingDelivery" BOOLEAN NOT NULL DEFAULT true,
    "mbElectricity" BOOLEAN NOT NULL DEFAULT true,
    "mbAmortization" BOOLEAN NOT NULL DEFAULT true,
    "mbConsumables" BOOLEAN NOT NULL DEFAULT true,
    "deductTaxes" BOOLEAN NOT NULL DEFAULT true,
    "deductMarketplace" BOOLEAN NOT NULL DEFAULT true,
    "deductAcquiring" BOOLEAN NOT NULL DEFAULT false,
    "acquiringPct" REAL NOT NULL DEFAULT 0,
    "complexitySimplePct" REAL NOT NULL DEFAULT 0,
    "complexityMediumPct" REAL NOT NULL DEFAULT 0,
    "complexityComplexPct" REAL NOT NULL DEFAULT 0,
    "defectAllowancePct" REAL NOT NULL DEFAULT 0,
    "roundingMode" TEXT NOT NULL DEFAULT 'none',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "accent" TEXT NOT NULL DEFAULT 'orange',
    "defaultTaxRegimeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settings_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("accent", "acquiringPct", "complexityComplexPct", "complexityMediumPct", "complexitySimplePct", "createdAt", "currency", "deductAcquiring", "deductMarketplace", "deductTaxes", "defaultMarkupPct", "defaultTaxRegimeId", "defectAllowancePct", "electricityEnabled", "electricityMode", "electricityTariff", "id", "mbAmortization", "mbConsumables", "mbElectricity", "mbLabor", "mbMaterial", "mbPackagingDelivery", "mbWarehouse", "modelingRate", "operatorRate", "paintingRate", "roundingMode", "theme", "updatedAt", "workshopId") SELECT "accent", "acquiringPct", "complexityComplexPct", "complexityMediumPct", "complexitySimplePct", "createdAt", "currency", "deductAcquiring", "deductMarketplace", "deductTaxes", "defaultMarkupPct", "defaultTaxRegimeId", "defectAllowancePct", "electricityEnabled", "electricityMode", "electricityTariff", "id", "mbAmortization", "mbConsumables", "mbElectricity", "mbLabor", "mbMaterial", "mbPackagingDelivery", "mbWarehouse", "modelingRate", "operatorRate", "paintingRate", "roundingMode", "theme", "updatedAt", "workshopId" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_workshopId_key" ON "Settings"("workshopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

