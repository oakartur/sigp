import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_FIELDS = [
  'Loja',
  'Versão',
  'Bandeira',
  'Obra',
  'Regional',
  'Cidade',
  'Metragem',
  'Data Recebimento Projeto Arquitetônico',
  'Número Base Projeto Arquitetônico',
  'Data de Entrega PREVISTA',
  'Data de Entrega REALIZADA',
  'Data da COMPATIBILIZAÇÃO',
  'Número da Requisição',
  'Projeto Enviado',
  'Data Envio Pedido (ENXOVAL TI)',
  'Data Inauguração/Reinauguração UNIDADE',
  'Status da Requisição',
  'PDV - Varejo',
  'PDV - Rápido',
  'PDV - Atacado',
  'PDV - Televendas',
  'PDV - Lanche da Hora',
  'PDV - PitStop',
  'PDV - Touch (Restaurante), Café, Adega ou Flores',
  'PDV - Provisório',
  'CPD - Tecnologia da Telefonia',
  'CPD - Máquina para o CONC',
  'Quantidade de Freezer (Stepin)',
  'SELF CHECKOUT - Quantidade de PDV',
  'Loja possuí Farmácia?',
  'Loja possui Açougue?',
  'Loja possui Açougue 5.1?',
  'Loja possui Padaria?',
  'Loja possui Ifood Delivery?',
  'Loja possui Ifood Restaurante?',
];

async function main() {
  console.log('🌱 Seeding campos do cabeçalho de projeto...');

  for (let i = 0; i < DEFAULT_FIELDS.length; i++) {
    const label = DEFAULT_FIELDS[i];

    // Upsert baseado no label para idempotência
    const existing = await prisma.projectHeaderField.findFirst({
      where: { label },
    });

    if (!existing) {
      await prisma.projectHeaderField.create({
        data: {
          label,
          sortOrder: i,
          isActive: true,
        },
      });
      console.log(`  ✅ Criado: "${label}" (ordem: ${i})`);
    } else {
      console.log(`  ⏭️  Já existe: "${label}"`);
    }
  }

  console.log('🌱 Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
