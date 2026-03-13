/**
 * Script de seed para criação/recuperação do usuário admin.
 * Uso: npx ts-node prisma/seed-admin.ts
 * Ou via Docker: docker compose run --rm api-server npx ts-node prisma/seed-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@sigp.local';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, role: 'ADMIN' },
    create: { email: ADMIN_EMAIL, passwordHash, role: 'ADMIN' },
  });

  console.log('✅ Usuário admin criado/atualizado com sucesso:');
  console.log(`   Email: ${user.email}`);
  console.log(`   Role:  ${user.role}`);
  console.log(`   Senha: ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed-admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
