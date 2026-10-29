-- Paints "coming soon" shelf is gone
DELETE FROM "WarehouseShelf" WHERE "kind" = 'paints';

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CalendarEvent";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'negotiation',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "advanceReceived" REAL NOT NULL DEFAULT 0,
    "advanceReceivedOn" BOOLEAN NOT NULL DEFAULT false,
    "tips" REAL NOT NULL DEFAULT 0,
    "tipsReceived" BOOLEAN NOT NULL DEFAULT false,
    "trackingNumber" TEXT NOT NULL DEFAULT '',
    "saleDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'direct',
    "personalUse" BOOLEAN NOT NULL DEFAULT false,
    "printerId" TEXT,
    "dryerId" TEXT,
    "modelId" TEXT,
    "printTimeMin" REAL NOT NULL DEFAULT 0,
    "quantity" REAL NOT NULL DEFAULT 1,
    "assemblyQuantity" REAL NOT NULL DEFAULT 1,
    "costMaterial" REAL NOT NULL DEFAULT 0,
    "costElectricity" REAL NOT NULL DEFAULT 0,
    "costPrinter" REAL NOT NULL DEFAULT 0,
    "costDryer" REAL NOT NULL DEFAULT 0,
    "costLabor" REAL NOT NULL DEFAULT 0,
    "costConsumables" REAL NOT NULL DEFAULT 0,
    "costPostprocessing" REAL NOT NULL DEFAULT 0,
    "costPackaging" REAL NOT NULL DEFAULT 0,
    "costDelivery" REAL NOT NULL DEFAULT 0,
    "costWarehouse" REAL NOT NULL DEFAULT 0,
    "costOther" REAL NOT NULL DEFAULT 0,
    "totalCost" REAL NOT NULL DEFAULT 0,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "taxRegimeId" TEXT,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "marketplaceFeeId" TEXT,
    "marketplaceFee" REAL NOT NULL DEFAULT 0,
    "acquiringFee" REAL NOT NULL DEFAULT 0,
    "salePrice" REAL NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0,
    "profit" REAL NOT NULL DEFAULT 0,
    "netProfit" REAL NOT NULL DEFAULT 0,
    "marginPct" REAL NOT NULL DEFAULT 0,
    "materialDeducted" BOOLEAN NOT NULL DEFAULT false,
    "statusDates" TEXT NOT NULL DEFAULT '{}',
    "slicerFileUrl" TEXT,
    "calcInput" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_dryerId_fkey" FOREIGN KEY ("dryerId") REFERENCES "Dryer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("acquiringFee", "advanceReceived", "advanceReceivedOn", "assemblyQuantity", "calcInput", "clientId", "costConsumables", "costDelivery", "costDryer", "costElectricity", "costLabor", "costMaterial", "costOther", "costPackaging", "costPostprocessing", "costPrinter", "costWarehouse", "createdAt", "discountAmount", "discountPct", "dryerId", "dueDate", "id", "marginPct", "marketplaceFee", "marketplaceFeeId", "materialDeducted", "modelId", "name", "netProfit", "notes", "number", "paid", "personalUse", "printTimeMin", "printerId", "profit", "quantity", "revenue", "saleDate", "salePrice", "slicerFileUrl", "source", "status", "statusDates", "tags", "taxAmount", "taxRegimeId", "tips", "tipsReceived", "totalCost", "trackingNumber", "updatedAt", "workshopId") SELECT "acquiringFee", "advanceReceived", "advanceReceivedOn", "assemblyQuantity", "calcInput", "clientId", "costConsumables", "costDelivery", "costDryer", "costElectricity", "costLabor", "costMaterial", "costOther", "costPackaging", "costPostprocessing", "costPrinter", "costWarehouse", "createdAt", "discountAmount", "discountPct", "dryerId", "dueDate", "id", "marginPct", "marketplaceFee", "marketplaceFeeId", "materialDeducted", "modelId", "name", "netProfit", "notes", "number", "paid", "personalUse", "printTimeMin", "printerId", "profit", "quantity", "revenue", "saleDate", "salePrice", "slicerFileUrl", "source", "status", "statusDates", "tags", "taxAmount", "taxRegimeId", "tips", "tipsReceived", "totalCost", "trackingNumber", "updatedAt", "workshopId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_WarehouseShelf" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workshopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WarehouseShelf_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WarehouseShelf" ("builtIn", "createdAt", "hidden", "icon", "id", "kind", "link", "name", "photoUrl", "sort", "updatedAt", "workshopId") SELECT "builtIn", "createdAt", "hidden", "icon", "id", "kind", "link", "name", "photoUrl", "sort", "updatedAt", "workshopId" FROM "WarehouseShelf";
DROP TABLE "WarehouseShelf";
ALTER TABLE "new_WarehouseShelf" RENAME TO "WarehouseShelf";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

