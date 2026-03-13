-- Add project configuration field types, dropdown options, computed formula,
-- and auto formula expression for equipment catalog.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectHeaderFieldType') THEN
    CREATE TYPE "ProjectHeaderFieldType" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'COMPUTED');
  END IF;
END $$;

ALTER TABLE "ProjectHeaderField"
  ADD COLUMN IF NOT EXISTS "type" "ProjectHeaderFieldType" NOT NULL DEFAULT 'TEXT';

ALTER TABLE "ProjectHeaderField"
  ADD COLUMN IF NOT EXISTS "options" JSONB;

ALTER TABLE "ProjectHeaderField"
  ADD COLUMN IF NOT EXISTS "defaultValue" TEXT;

ALTER TABLE "ProjectHeaderField"
  ADD COLUMN IF NOT EXISTS "formulaExpression" TEXT;

ALTER TABLE "EquipmentCatalog"
  ADD COLUMN IF NOT EXISTS "autoFormulaExpression" TEXT;
