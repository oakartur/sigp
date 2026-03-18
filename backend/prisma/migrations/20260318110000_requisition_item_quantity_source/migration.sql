DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuantitySourceType') THEN
    CREATE TYPE "QuantitySourceType" AS ENUM ('PURCHASE', 'STOCK_AGP');
  END IF;
END $$;

ALTER TABLE "RequisitionItem"
  ADD COLUMN IF NOT EXISTS "quantitySourceType" "QuantitySourceType" NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN IF NOT EXISTS "quantitySourceNote" TEXT;
