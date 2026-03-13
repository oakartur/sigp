-- Catalog templates (Local -> Operation -> Equipment) and requisition item quantity fields.

CREATE TABLE IF NOT EXISTS "LocalCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocalCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OperationCatalog" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EquipmentCatalog" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "baseQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoConfigFieldId" TEXT,
    "autoMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipmentCatalog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EquipmentCatalog"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RequisitionItem"
  ADD COLUMN IF NOT EXISTS "equipmentCatalogId" TEXT;

ALTER TABLE "RequisitionItem"
  ADD COLUMN IF NOT EXISTS "localName" TEXT;

ALTER TABLE "RequisitionItem"
  ADD COLUMN IF NOT EXISTS "operationName" TEXT;

ALTER TABLE "RequisitionItem"
  ADD COLUMN IF NOT EXISTS "equipmentCode" TEXT;

ALTER TABLE "RequisitionItem"
  ADD COLUMN IF NOT EXISTS "manualQuantity" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "OperationCatalog_localId_idx" ON "OperationCatalog"("localId");
CREATE INDEX IF NOT EXISTS "EquipmentCatalog_operationId_idx" ON "EquipmentCatalog"("operationId");
CREATE INDEX IF NOT EXISTS "EquipmentCatalog_autoConfigFieldId_idx" ON "EquipmentCatalog"("autoConfigFieldId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OperationCatalog_localId_fkey'
  ) THEN
    ALTER TABLE "OperationCatalog"
      ADD CONSTRAINT "OperationCatalog_localId_fkey"
      FOREIGN KEY ("localId") REFERENCES "LocalCatalog"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentCatalog_operationId_fkey'
  ) THEN
    ALTER TABLE "EquipmentCatalog"
      ADD CONSTRAINT "EquipmentCatalog_operationId_fkey"
      FOREIGN KEY ("operationId") REFERENCES "OperationCatalog"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EquipmentCatalog_autoConfigFieldId_fkey'
  ) THEN
    ALTER TABLE "EquipmentCatalog"
      ADD CONSTRAINT "EquipmentCatalog_autoConfigFieldId_fkey"
      FOREIGN KEY ("autoConfigFieldId") REFERENCES "ProjectHeaderField"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RequisitionItem_equipmentCatalogId_fkey'
  ) THEN
    ALTER TABLE "RequisitionItem"
      ADD CONSTRAINT "RequisitionItem_equipmentCatalogId_fkey"
      FOREIGN KEY ("equipmentCatalogId") REFERENCES "EquipmentCatalog"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
