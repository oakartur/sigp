CREATE TABLE IF NOT EXISTS "ComputerAreaCatalog" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComputerAreaCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RequisitionComputerArea" (
  "id" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "versionLock" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequisitionComputerArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequisitionComputerArea_requisitionId_areaId_key"
  ON "RequisitionComputerArea"("requisitionId", "areaId");

CREATE INDEX IF NOT EXISTS "RequisitionComputerArea_requisitionId_idx"
  ON "RequisitionComputerArea"("requisitionId");

CREATE INDEX IF NOT EXISTS "RequisitionComputerArea_areaId_idx"
  ON "RequisitionComputerArea"("areaId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RequisitionComputerArea_requisitionId_fkey'
  ) THEN
    ALTER TABLE "RequisitionComputerArea"
      ADD CONSTRAINT "RequisitionComputerArea_requisitionId_fkey"
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
    WHERE conname = 'RequisitionComputerArea_areaId_fkey'
  ) THEN
    ALTER TABLE "RequisitionComputerArea"
      ADD CONSTRAINT "RequisitionComputerArea_areaId_fkey"
      FOREIGN KEY ("areaId")
      REFERENCES "ComputerAreaCatalog"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;
