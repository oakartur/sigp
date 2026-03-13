-- Hotfix: em alguns ambientes a migration inicial foi marcada como aplicada,
-- mas a tabela "ProjectHeaderField" nao existe (drift de schema).
-- Esta migration e idempotente e recria a tabela quando necessario.

CREATE TABLE IF NOT EXISTS "ProjectHeaderField" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectHeaderField_pkey" PRIMARY KEY ("id")
);
