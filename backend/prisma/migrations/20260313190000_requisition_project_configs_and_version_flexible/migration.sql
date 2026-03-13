-- Make requisition version editable/flexible and add project configs bound to each requisition.

ALTER TABLE "Requisition"
  ALTER COLUMN "version" TYPE TEXT USING "version"::TEXT;

ALTER TABLE "Requisition"
  ALTER COLUMN "version" SET DEFAULT 'V1';

ALTER TABLE "Requisition"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Requisition"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "Requisition_projectId_version_key";

CREATE TABLE IF NOT EXISTS "RequisitionProjectConfig" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequisitionProjectConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequisitionProjectConfig_requisitionId_fieldId_key"
  ON "RequisitionProjectConfig"("requisitionId", "fieldId");

CREATE INDEX IF NOT EXISTS "RequisitionProjectConfig_requisitionId_idx"
  ON "RequisitionProjectConfig"("requisitionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RequisitionProjectConfig_requisitionId_fkey'
  ) THEN
    ALTER TABLE "RequisitionProjectConfig"
      ADD CONSTRAINT "RequisitionProjectConfig_requisitionId_fkey"
      FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RequisitionProjectConfig_fieldId_fkey'
  ) THEN
    ALTER TABLE "RequisitionProjectConfig"
      ADD CONSTRAINT "RequisitionProjectConfig_fieldId_fkey"
      FOREIGN KEY ("fieldId") REFERENCES "ProjectHeaderField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
