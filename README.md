# SIGP — Sistema Integrado de Gestão de Projetos

> **Sistema de Quantificação e Recebimento de Materiais** para obras e projetos de construção civil.

---

## 📋 Índice

1. [Visão Geral](#-visão-geral)
2. [Arquitetura](#-arquitetura)
3. [Pré-requisitos](#-pré-requisitos)
4. [Configuração de Ambiente](#-configuração-de-ambiente)
5. [Instalação e Deploy](#-instalação-e-deploy)
6. [Estrutura do Projeto](#-estrutura-do-projeto)
7. [Papéis e Permissões (RBAC)](#-papéis-e-permissões-rbac)
8. [Referência da API](#-referência-da-api)
9. [Banco de Dados](#-banco-de-dados)
10. [Frontend](#-frontend)
11. [Filas Assíncronas (BullMQ)](#-filas-assíncronas-bullmq)
12. [Desenvolvimento Local](#-desenvolvimento-local)
13. [Testes](#-testes)

---

## 🎯 Visão Geral

O SIGP é uma aplicação web full-stack que gerencia o ciclo de vida completo de requisições de materiais em projetos de obras:

- **Quantificação**: Criação e preenchimento de requisições com cálculo automático via fórmulas configuráveis.
- **Versionamento/Snapshot**: Toda requisição fechada pode gerar uma nova versão (snapshot), preservando o histórico.
- **Recebimento**: Gerentes registram o recebimento físico de cada item com observações.
- **Override Administrativo**: Administradores podem sobrescrever valores calculados.
- **Exportação Excel**: Geração automática de planilhas no formato Nimbi para integração ERP.
- **Notificações por E-mail**: Envio automático de e-mails via fila BullMQ.
- **Controle de Concorrência**: Bloqueio otimista (optimistic locking) em requisições e itens para evitar conflitos.

---

## 🏗️ Arquitetura

```
                        ┌─────────────────────┐
                        │  Usuário / Browser  │
                        └──────────┬──────────┘
                                   │ :1180
                        ┌──────────▼──────────┐
                        │   Nginx (Proxy VM)  │
                        │  nginx-sigp.conf    │
                        └──────┬──────────────┘
                               │
               ┌───────────────┼──────────────────┐
               │ /sigp/        │                  │ /sigp-api/
      ┌────────▼──────┐   ┌────▼────────────────┐
      │  Frontend     │   │  API (NestJS)        │
      │  React/Vite   │   │  quant_api  :3000    │
      │  quant_frontend│  └────┬────────────────┘
      │  :8080        │       │
      └───────────────┘  ┌────▼──────────────────┐
                         │  Queue Worker (BullMQ) │
                         │  quant_worker          │
                         └────┬──────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼────┐  ┌───────▼──────┐  ┌────▼───────────┐
     │ PostgreSQL  │  │    Redis 7   │  │  Backup Sidecar │
     │ quant_db    │  │  quant_redis │  │  quant_db_backup│
     └─────────────┘  └─────────────┘  └────────────────┘
```

### Stack Tecnológica

| Camada       | Tecnologia                                  |
|--------------|---------------------------------------------|
| **Backend**  | NestJS 11, TypeScript, Passport JWT, bcryptjs |
| **ORM**      | Prisma 5, PostgreSQL 15                    |
| **Cache/Fila** | Redis 7, BullMQ                          |
| **E-mail**   | Nodemailer (SMTP)                          |
| **Excel**    | ExcelJS                                    |
| **Fórmulas** | mathjs (sandbox)                           |
| **Frontend** | React 18, Vite, Material UI (MUI), React Router v6 |
| **Infra**    | Docker, Docker Compose, Nginx              |

---

## ✅ Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= 2.20 (já incluso no Docker Desktop)
- Acesso ao servidor SMTP da intranet (para notificações por e-mail)
- Nginx instalado na VM host (para reverse proxy)

---

## ⚙️ Configuração de Ambiente

Copie o arquivo `.env` (já presente na raiz) e ajuste os valores conforme o ambiente:

```bash
cp .env .env.local   # Opcional: para overrides locais
```

### Variáveis de Ambiente

| Variável        | Descrição                                     | Padrão              |
|-----------------|-----------------------------------------------|---------------------|
| `DB_USER`       | Usuário do PostgreSQL                         | `postgres`          |
| `DB_PASSWORD`   | Senha do PostgreSQL                           | `postgres`          |
| `DB_NAME`       | Nome do banco de dados                        | `sigp`              |
| `REDIS_HOST`    | Hostname do Redis (interno ao Docker)         | `redis-queue`       |
| `REDIS_PORT`    | Porta do Redis                                | `6379`              |
| `SMTP_HOST`     | Servidor SMTP para envio de e-mails           | `mail.comper.com.br` |
| `SMTP_PORT`     | Porta SMTP (ex: 465 para SSL, 587 STARTTLS)   | `465`               |
| `SMTP_USER`     | Usuário de autenticação SMTP                  | —                   |
| `SMTP_PASS`     | Senha de autenticação SMTP                    | —                   |
| `JWT_SECRET`    | Chave secreta para assinatura dos tokens JWT  | `SIGP_SUPER_SECRET_KEY` ⚠️ |

> ⚠️ **IMPORTANTE**: Altere o `JWT_SECRET` para uma string longa e aleatória antes de colocar em produção!

---

## 🚀 Instalação e Deploy

### Deploy Completo (Produção)

O script `deploy.sh` orquestra todo o processo na VM Ubuntu:

```bash
chmod +x deploy.sh
./deploy.sh
```

O script executa os seguintes passos:
1. Para todos os containers em execução
2. Inicia PostgreSQL e Redis
3. Aguarda 15 segundos para o banco aceitar conexões
4. Build da imagem do backend
5. Executa as migrações do Prisma (`prisma migrate deploy`)
6. Build e inicialização de toda a stack
7. Limpeza de imagens Docker órfãs

**URLs de acesso após o deploy** (via Nginx Proxy):
- **Frontend**: `http://<IP_DA_VM>:1180/sigp/`
- **API REST**: `http://<IP_DA_VM>:1180/sigp-api/`

### Configuração do Nginx (VM Host)

Copie o arquivo de configuração para o Nginx da VM:

```bash
sudo cp nginx-sigp.conf /etc/nginx/conf.d/sigp.conf
sudo nginx -t && sudo systemctl reload nginx
```

O Nginx escuta na porta **1180** e faz proxy para:
- `/sigp/` → Frontend React (porta 8080)
- `/sigp-api/` → API NestJS (porta 3000)

### Registro do Primeiro Administrador

Após o deploy, registre o primeiro usuário administrador:

```bash
curl -X POST http://<IP_DA_VM>:1180/sigp-api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@empresa.com", "password": "SenhaForte123!", "role": "ADMIN"}'
```

> ⚠️ O endpoint `/auth/register` não é protegido — ele é destinado apenas ao setup inicial. Considere adicionar proteção ou desativá-lo após o cadastro inicial.

---

## 📁 Estrutura do Projeto

```
SIGP/
├── .env                     # Variáveis de ambiente da stack
├── docker-compose.yml       # Orquestração de todos os serviços
├── nginx-sigp.conf          # Configuração do Nginx (VM host)
├── deploy.sh                # Script de deploy para produção
│
├── backend/                 # API NestJS
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma    # Definição completa do banco de dados
│   └── src/
│       ├── main.ts          # Bootstrap da aplicação NestJS
│       ├── app.module.ts    # Módulo raiz + importações globais
│       ├── auth/            # Autenticação (JWT + bcrypt)
│       │   ├── auth.controller.ts   # POST /auth/login, POST /auth/register
│       │   ├── auth.service.ts      # validateUser, login, registerUser
│       │   ├── jwt.strategy.ts      # Validação do token JWT
│       │   ├── roles.guard.ts       # Guard de autorização por papel
│       │   └── roles.decorator.ts   # @Roles() decorator
│       ├── projects/        # Gestão de Projetos
│       │   ├── projects.controller.ts
│       │   └── projects.service.ts
│       ├── requisitions/    # Requisições e Itens
│       │   ├── requisitions.controller.ts
│       │   └── requisitions.service.ts  # Toda a lógica de negócio
│       ├── formulas/        # Motor de Fórmulas (mathjs sandbox)
│       │   ├── formulas.controller.ts
│       │   └── formulas.service.ts
│       ├── tasks/           # Tarefas Assíncronas (BullMQ)
│       │   ├── tasks.controller.ts    # Disparo de jobs
│       │   ├── tasks.service.ts       # Enfileiramento
│       │   ├── email.processor.ts     # Worker: envio de e-mail
│       │   └── excel.processor.ts    # Worker: geração de Excel
│       └── prisma/
│           └── prisma.service.ts    # Singleton do PrismaClient
│
└── frontend/                # SPA React + Vite
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx          # Roteamento principal (basename="/sigp")
        ├── context/
        │   └── AuthContext  # Contexto global de autenticação
        ├── components/
        │   └── PrivateRoute.tsx  # Proteção de rotas no frontend
        └── pages/
            ├── Login.tsx            # Formulário de login
            ├── Dashboard.tsx        # Lista de projetos
            ├── ProjectRequisitions.tsx  # Requisições de um projeto
            └── RequisitionGrid.tsx  # Grid de itens da requisição
```

---

## 👥 Papéis e Permissões (RBAC)

O sistema implementa **Role-Based Access Control** com 4 papéis:

| Papel          | Descrição                                                                 |
|----------------|---------------------------------------------------------------------------|
| `QUANTIFIER`   | Cria projetos, requisições e adiciona itens; enfileira exports Excel       |
| `MANAGER`      | Recebe itens fisicamente; enfileira exports Excel                         |
| `AUDITOR`      | Acesso somente leitura a projetos e fórmulas                             |
| `ADMIN`        | Acesso total: override de valores, gerenciamento de fórmulas, e-mails    |

### Matriz de Permissões por Endpoint

| Endpoint                              | QUANTIFIER | MANAGER | AUDITOR | ADMIN |
|---------------------------------------|:----------:|:-------:|:-------:|:-----:|
| `POST /auth/login`                    | ✅         | ✅      | ✅      | ✅   |
| `POST /auth/register`                 | ✅         | ✅      | ✅      | ✅   |
| `POST /projects`                      | ✅         | —       | —       | ✅   |
| `GET /projects`                       | ✅         | ✅      | ✅      | ✅   |
| `GET /projects/:id`                   | ✅         | ✅      | ✅      | ✅   |
| `POST /requisitions/project/:id`      | ✅         | —       | —       | ✅   |
| `POST /requisitions/:id/snapshot`     | ✅         | —       | —       | ✅   |
| `PUT /requisitions/:id/complete`      | ✅         | —       | —       | ✅   |
| `POST /requisitions/:id/items`        | ✅         | —       | —       | ✅   |
| `PUT /requisitions/items/:id/override`| —          | —       | —       | ✅   |
| `PUT /requisitions/items/:id/receive` | —          | ✅      | —       | ✅   |
| `POST /formulas`                      | —          | —       | —       | ✅   |
| `GET /formulas`                       | ✅         | —       | ✅      | ✅   |
| `PUT /formulas/:id`                   | —          | —       | —       | ✅   |
| `POST /tasks/excel/:reqId`            | ✅         | ✅      | —       | ✅   |
| `POST /tasks/email`                   | —          | —       | —       | ✅   |

---

## 📡 Referência da API

Todos os endpoints (exceto `/auth/*`) requerem o header:

```
Authorization: Bearer <access_token>
```

O `access_token` é obtido via `POST /auth/login`.

---

### 🔐 Autenticação (`/auth`)

#### `POST /auth/login`

Autentica um usuário e retorna o token JWT.

**Request Body:**
```json
{
  "email": "usuario@empresa.com",
  "password": "SenhaForte123!"
}
```

**Response `200 OK`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-do-usuario",
    "email": "usuario@empresa.com",
    "role": "ADMIN"
  }
}
```

**Erros:** `401 Unauthorized` — Credenciais inválidas.

---

#### `POST /auth/register`

Registra um novo usuário. Destinado apenas ao setup inicial.

**Request Body:**
```json
{
  "email": "novo@empresa.com",
  "password": "SenhaForte123!",
  "role": "QUANTIFIER"
}
```
> Valores de `role`: `QUANTIFIER`, `MANAGER`, `AUDITOR`, `ADMIN`.

**Response `201 Created`:** Objeto do usuário criado (sem o hash da senha).

**Erros:** `400 Bad Request` — E-mail já registrado.

---

### 📁 Projetos (`/projects`)

#### `POST /projects`
Cria um novo projeto. (Roles: `QUANTIFIER`, `ADMIN`)

**Request Body:** `{ "name": "Nome do Projeto" }`

**Response `201`:** Objeto do projeto criado.

---

#### `GET /projects`
Lista todos os projetos. (Todos os roles)

**Response `200`:**
```json
[
  { "id": "uuid", "name": "Obra Alpha", "requisitions": [...] }
]
```

---

#### `GET /projects/:id`
Busca um projeto pelo ID com suas requisições. (Todos os roles)

---

### 📋 Requisições (`/requisitions`)

#### `POST /requisitions/project/:projectId`
Cria a requisição inicial (V.1) de um projeto. (Roles: `QUANTIFIER`, `ADMIN`)

**Response `201`:**
```json
{
  "id": "uuid",
  "projectId": "uuid-do-projeto",
  "version": 1,
  "status": "PENDING",
  "isReadOnly": false,
  "versionLock": 1
}
```

---

#### `POST /requisitions/:id/snapshot`
Cria uma nova versão (V+1) a partir de uma requisição `COMPLETED`. Todos os itens são clonados com status `PENDING`. (Roles: `QUANTIFIER`, `ADMIN`)

**Erros:** `400` — Requisição não encontrada ou não está no status `COMPLETED`.

---

#### `PUT /requisitions/:id/complete`
Fecha (congela) uma requisição, marcando como `COMPLETED` e `isReadOnly: true`. Usa controle de concorrência otimista. (Roles: `QUANTIFIER`, `ADMIN`)

**Request Body:** `{ "currentLock": 1 }`

**Erros:** `409 Conflict` — Outro usuário modificou a requisição. Recarregue a tela.

---

#### `POST /requisitions/:reqId/items`
Adiciona um item à requisição. Se uma fórmula e variáveis forem fornecidas, o `calculatedValue` é calculado automaticamente pelo backend. (Roles: `QUANTIFIER`, `ADMIN`)

**Request Body:**
```json
{
  "equipmentName": "Ar-Condicionado Split 12k",
  "formulaId": "uuid-da-formula",
  "variables": {
    "area": 50,
    "consumo_por_m2": 0.8,
    "fator_perda": 1.1
  }
}
```

**Response `201`:** Objeto do item criado com `calculatedValue` calculado.

**Erros:** `400` — Requisição está em modo somente leitura.

---

#### `PUT /requisitions/items/:itemId/override`
Sobrescreve o valor calculado de um item. O `overrideValue` tem prioridade sobre `calculatedValue` na exportação Excel. (Role: `ADMIN` apenas)

**Request Body:** `{ "overrideValue": 150.5, "currentLock": 1 }`

**Erros:** `409 Conflict` — Conflito de edição no item.

---

#### `PUT /requisitions/items/:itemId/receive`
Marca um item como recebido fisicamente pelo gerente. (Roles: `MANAGER`, `ADMIN`)

**Request Body:**
```json
{
  "observation": "Recebido com defeito na embalagem.",
  "currentLock": 1
}
```

**Erros:** `409 Conflict` — O item foi editado por outro usuário.

---

### 🔢 Fórmulas (`/formulas`)

#### `POST /formulas`
Cria uma nova fórmula de cálculo. (Role: `ADMIN`)

**Request Body:**
```json
{
  "name": "Cálculo de AR-Condicionado",
  "expression": "area * consumo_por_m2 * fator_perda"
}
```
> O campo `expression` é avaliado via **mathjs** em sandbox. Suporta operações matemáticas padrão e variáveis nomeadas.

---

#### `GET /formulas`
Lista todas as fórmulas ativas. (Roles: `ADMIN`, `QUANTIFIER`, `AUDITOR`)

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "name": "Cálculo de AR-Condicionado",
    "expression": "area * consumo_por_m2 * fator_perda",
    "isActive": true
  }
]
```

---

#### `PUT /formulas/:id`
Atualiza nome, expressão ou status ativo de uma fórmula. (Role: `ADMIN`)

**Request Body:** `{ "name": "Novo Nome", "expression": "nova * expressao", "isActive": false }`

---

### ⚙️ Tarefas Assíncronas (`/tasks`)

#### `POST /tasks/excel/:requisitionId`
Enfileira a geração do arquivo Excel da requisição. O processo ocorre de forma assíncrona. (Roles: `ADMIN`, `QUANTIFIER`, `MANAGER`)

**Response `201`:** Confirmação do enfileiramento do job.

---

#### `POST /tasks/email`
Enfileira o envio de um e-mail. (Role: `ADMIN`)

**Request Body:**
```json
{
  "to": "destinatario@empresa.com",
  "subject": "Assunto do E-mail",
  "body": "<h1>Corpo HTML do e-mail</h1>"
}
```

---

## 🗄️ Banco de Dados

O banco relacional é **PostgreSQL 15**, gerenciado via **Prisma ORM**.

### Schema de Entidades

```
┌─────────────┐       ┌───────────────┐       ┌─────────────────┐
│    User     │       │    Formula    │       │ RequisitionItem │
│─────────────│       │───────────────│       │─────────────────│
│ id (UUID)   │       │ id (UUID)     │  ┌───→│ id (UUID)       │
│ email       │       │ name          │  │    │ requisitionId   │
│ passwordHash│       │ expression    │  │    │ equipmentName   │
│ role        │       │ isActive      │  │    │ formulaId?      │
└─────────────┘       └───────┬───────┘  │    │ variablesPayload│
                              │items     │    │ calculatedValue │
┌─────────────┐       ┌───────▼───────┐  │    │ overrideValue?  │
│   Project   │       │  Requisition  │  │    │ status          │
│─────────────│       │───────────────│  │    │ receivedAt?     │
│ id (UUID)   │──────→│ id (UUID)     │──┘    │ receivedById?   │
│ name        │       │ projectId     │       │ observation?    │
└─────────────┘       │ version (Int) │       │ versionLock     │
                      │ status        │       └─────────────────┘
                      │ isReadOnly    │
                      │ versionLock   │
                      └───────────────┘
```

### Enums

| Enum         | Valores                                           |
|--------------|---------------------------------------------------|
| `Role`       | `QUANTIFIER`, `MANAGER`, `AUDITOR`, `ADMIN`       |
| `ReqStatus`  | `PENDING`, `FILLING`, `COMPLETED`                 |
| `ItemStatus` | `PENDING`, `RECEIVED`                             |

### Controle de Concorrência Otimista

O campo `versionLock` (inteiro) é presente tanto em `Requisition` quanto em `RequisitionItem`. A cada operação de escrita:
1. O cliente envia o `currentLock` que está vendo na tela.
2. O servidor compara com o valor no banco.
3. Se diferente, retorna `409 Conflict` — o cliente deve recarregar e tentar novamente.
4. Se igual, incrementa o lock e aplica a mudança atomicamente.

### Comandos Prisma Úteis

```bash
# Rodar dentro do container api-server:
docker compose exec api-server npx prisma migrate dev --name <nome_da_migracao>
docker compose exec api-server npx prisma studio  # Interface gráfica do banco
docker compose exec api-server npx prisma db seed # Seed (se configurado)
```

### Backup Automático

O serviço `db-backup` (container `quant_db_backup`) executa backups automáticos do PostgreSQL com a seguinte política:
- **Frequência**: Diária (`@daily`)
- **Retenção diária**: 7 dias
- **Retenção semanal**: 4 semanas
- **Localização**: Volume Docker `db_backups`

---

## 🖥️ Frontend

A interface web é uma **SPA (Single-Page Application)** construída com **React 18 + Vite**, servida via Nginx no container `quant_frontend`.

### Rotas

| Rota                          | Componente               | Acesso     |
|-------------------------------|--------------------------|------------|
| `/sigp/login`                 | `Login.tsx`              | Público    |
| `/sigp/`                      | `Dashboard.tsx`          | Autenticado|
| `/sigp/project/:projectId`    | `ProjectRequisitions.tsx`| Autenticado|
| `/sigp/requisition/:reqId`    | `RequisitionGrid.tsx`    | Autenticado|

### Contexto de Autenticação

O `AuthContext` gerencia o estado global da sessão do usuário, incluindo o `access_token` JWT e os dados do usuário logado. Rotas privadas são protegidas pelo componente `PrivateRoute.tsx`.

### Tema

O frontend utiliza o **Material UI (MUI)** com tema escuro personalizado:
- **Fundo padrão**: `#121212`
- **Cor primária**: `#6C63FF` (roxo vibrante)
- **Cor secundária**: `#FF6584` (rosa para destaques)
- **Tipografia**: Inter / Roboto

### Build e Configuração

A URL da API é injetada em **build-time** pelo Vite via a variável:
```
VITE_API_URL=/sigp-api
```
Esta é configurada no `docker-compose.yml` como `args` de build do serviço `web-frontend`.

---

## 📬 Filas Assíncronas (BullMQ)

O sistema usa **BullMQ + Redis** para processar tarefas de forma assíncrona e com resiliência a falhas.

### Filas Disponíveis

| Fila          | Worker              | Função                                      |
|---------------|---------------------|---------------------------------------------|
| `emailQueue`  | `EmailProcessor`    | Envia e-mails via SMTP (concorrência: 5)    |
| `excelQueue`  | `ExcelProcessor`    | Gera planilhas `.xlsx` no formato Nimbi     |

### Comportamento do Worker de E-mail

- Concorrência: **5 jobs simultâneos**
- Retries automáticos com **exponential backoff** configurado pelo BullMQ
- Em caso de esgotamento de tentativas, o erro é registrado no log do container
- Remetente padrão: `"Equipe Obras/Quantificação" <no-reply@empresa.com>`

### Exportação Excel (Formato Nimbi)

O Excel gerado contém a planilha `ExportNimbi` com as colunas:

| Coluna              | Descrição                                                 |
|---------------------|-----------------------------------------------------------|
| `Projeto`           | Nome do projeto                                          |
| `Versao`            | Número da versão da requisição                           |
| `Equipamento`       | Nome do equipamento                                      |
| `QuantidadeAprovada`| `overrideValue` (se existir) ou `calculatedValue`        |

Os arquivos são salvos em `backend/exports/req_<id>_v<versao>.xlsx`.

---

## 💻 Desenvolvimento Local

```bash
# 1. Subir apenas a infraestrutura (Banco + Redis)
docker compose up -d postgres-db redis-queue

# 2. Backend (modo watch)
cd backend
npm install
cp .env ../.env  # Certifique-se que DATABASE_URL aponta para localhost
# Ajuste DATABASE_URL no backend/.env para: postgresql://postgres:postgres@localhost:5432/sigp
npx prisma migrate dev
npm run start:dev

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev
```

> Em desenvolvimento, o frontend Vite estará disponível em `http://localhost:5173` e a API em `http://localhost:3000`.

---

## 🧪 Testes

```bash
# Rodar todos os testes unitários
cd backend
npm run test

# Testes com cobertura
npm run test:cov

# Testes E2E
npm run test:e2e

# Modo watch (desenvolvimento)
npm run test:watch
```

Os testes usam **Jest + NestJS Testing Module** com mocks dos serviços de dependência.

---

## 📚 Arquivos de Referência

| Arquivo                                                      | Propósito                                     |
|--------------------------------------------------------------|-----------------------------------------------|
| [`docker-compose.yml`](./docker-compose.yml)                 | Orquestração completa da stack                |
| [`nginx-sigp.conf`](./nginx-sigp.conf)                       | Configuração do proxy reverso Nginx           |
| [`deploy.sh`](./deploy.sh)                                   | Script de deploy para produção (Ubuntu 22.04) |
| [`backend/prisma/schema.prisma`](./backend/prisma/schema.prisma) | Schema completo do banco de dados         |
| [`.env`](./.env)                                             | Variáveis de ambiente (não comitar em produção!) |
| [`ops/backup/README.md`](./ops/backup/README.md)             | Operação de backup/restore local (mesma VM)      |

---

*Documentação gerada em março de 2026.*
