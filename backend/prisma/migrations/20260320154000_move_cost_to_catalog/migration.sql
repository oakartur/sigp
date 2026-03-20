-- AlterTable
ALTER TABLE "EquipmentCatalog" ADD COLUMN "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- MigrateData
UPDATE "EquipmentCatalog" ec
SET cost = (
    SELECT euc.cost FROM "EquipmentUnitCost" euc
    WHERE euc.code = ec.code
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 FROM "EquipmentUnitCost" euc
    WHERE euc.code = ec.code
);

-- DropTable
DROP TABLE "EquipmentUnitCost";
