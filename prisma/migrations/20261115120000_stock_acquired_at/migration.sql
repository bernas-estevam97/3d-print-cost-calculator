-- AlterTable
ALTER TABLE "Filament" ADD COLUMN "acquiredAt" DATETIME;
ALTER TABLE "ShelfItem" ADD COLUMN "acquiredAt" DATETIME;

-- existing stock was bought when it was added
UPDATE "Filament" SET "acquiredAt" = "createdAt";
UPDATE "ShelfItem" SET "acquiredAt" = "createdAt";
