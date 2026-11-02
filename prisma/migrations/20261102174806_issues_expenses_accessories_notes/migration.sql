-- CreateTable
CREATE TABLE "ModelAccessory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "shelfItemId" TEXT NOT NULL,
    "qty" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "ModelAccessory_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModelAccessory_shelfItemId_fkey" FOREIGN KEY ("shelfItemId") REFERENCES "ShelfItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "total" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockPurchase_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Filament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'PLA Basic',
    "brand" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'PLA',
    "modifier" TEXT,
    "purchaseLink" TEXT,
    "spoolPrice" REAL NOT NULL DEFAULT 0,
    "spoolWeightG" REAL NOT NULL DEFAULT 1000,
    "spoolCount" REAL NOT NULL DEFAULT 1,
    "usedFromSpoolG" REAL NOT NULL DEFAULT 0,
    "colors" TEXT NOT NULL DEFAULT '[]',
    "photoUrl" TEXT,
    "lowStockThresholdG" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Filament_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Filament" ("brand", "colors", "createdAt", "id", "lowStockThresholdG", "modifier", "name", "photoUrl", "purchaseLink", "spoolCount", "spoolPrice", "spoolWeightG", "type", "updatedAt", "usedFromSpoolG", "workshopId") SELECT "brand", "colors", "createdAt", "id", "lowStockThresholdG", "modifier", "name", "photoUrl", "purchaseLink", "spoolCount", "spoolPrice", "spoolWeightG", "type", "updatedAt", "usedFromSpoolG", "workshopId" FROM "Filament";
DROP TABLE "Filament";
ALTER TABLE "new_Filament" RENAME TO "Filament";
CREATE TABLE "new_ShelfItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "pricePaid" REAL NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShelfItem_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShelfItem_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "WarehouseShelf" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShelfItem" ("createdAt", "id", "name", "quantity", "shelfId", "unitCost", "updatedAt", "workshopId") SELECT "createdAt", "id", "name", "quantity", "shelfId", "unitCost", "updatedAt", "workshopId" FROM "ShelfItem";
DROP TABLE "ShelfItem";
ALTER TABLE "new_ShelfItem" RENAME TO "ShelfItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Tips now count only while "Tip" is on; existing tips were already in revenue, so switch them on
UPDATE "Order" SET "tipsReceived" = true WHERE "tips" > 0;
