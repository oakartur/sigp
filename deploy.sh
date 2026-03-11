#!/bin/bash
set -e  # Para imediatamente se qualquer comando falhar

# Script de Deploy - SIGP (Sistema de Quantificação e Recebimento)
# Destinado a rodar na VM Ubuntu 22.04

echo "🚀 Iniciando o deploy do SIGP..."

# 1. Parar serviços em execução (se houver) e remover redes/volumes órfãos
echo "📦 Parando serviços em execução..."
docker compose down || true

# 2. Subir apenas os serviços de infraestrutura (Banco de Dados e Redis)
echo "🗄️  Iniciando PostgreSQL e Redis..."
docker compose up -d postgres-db redis-queue

# 3. Aguardar o banco de dados aceitar conexões
echo "⏳ Aguardando o start do PostgreSQL (15 segundos)..."
sleep 15

# 4. Construir as imagens locais e rodar as Migrações do Prisma
echo "🔄 Construindo imagem do backend..."
docker compose build api-server

echo "🔄 Executando migrações do Prisma..."
docker compose run --rm api-server npx prisma migrate deploy

# 5. Subir o restante da stack (API, Worker, Frontend, Backup)
echo "🏗️  Construindo e iniciando todos os serviços..."
docker compose up -d --build

# 6. Limpar imagens soltas e recursos não utilizados
echo "🧹 Limpando imagens docker órfãs..."
docker image prune -f

echo ""
echo "✅ Deploy concluído com sucesso!"
echo "➡️  Acesse o Frontend (via Nginx Proxy): http://<IP_DA_VM>:1180/sigp/"
echo "➡️  Acesse a API (via Nginx Proxy): http://<IP_DA_VM>:1180/sigp-api/"
echo "⚠️  As portas originais 8080 e 3000 provavelmente estão bloqueadas pelo firewall da rede."
echo ""
echo "📋 Status dos containers:"
docker compose ps
