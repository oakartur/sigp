CREATE TABLE IF NOT EXISTS "BackofficeScaleAreaCatalog" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackofficeScaleAreaCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RequisitionBackofficeScaleArea" (
  "id" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "versionLock" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequisitionBackofficeScaleArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequisitionBackofficeScaleArea_requisitionId_areaId_key"
  ON "RequisitionBackofficeScaleArea"("requisitionId", "areaId");

CREATE INDEX IF NOT EXISTS "RequisitionBackofficeScaleArea_requisitionId_idx"
  ON "RequisitionBackofficeScaleArea"("requisitionId");

CREATE INDEX IF NOT EXISTS "RequisitionBackofficeScaleArea_areaId_idx"
  ON "RequisitionBackofficeScaleArea"("areaId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RequisitionBackofficeScaleArea_requisitionId_fkey'
  ) THEN
    ALTER TABLE "RequisitionBackofficeScaleArea"
      ADD CONSTRAINT "RequisitionBackofficeScaleArea_requisitionId_fkey"
      FOREIGN KEY ("requisitionId")
      REFERENCES "Requisition"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RequisitionBackofficeScaleArea_areaId_fkey'
  ) THEN
    ALTER TABLE "RequisitionBackofficeScaleArea"
      ADD CONSTRAINT "RequisitionBackofficeScaleArea_areaId_fkey"
      FOREIGN KEY ("areaId")
      REFERENCES "BackofficeScaleAreaCatalog"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;
