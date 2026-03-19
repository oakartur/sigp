# SIGP - Documentacao Funcional Completa

## 1. Objetivo do sistema
O SIGP e um sistema web para levantamento de materiais de obras (redes, TI, CFTV e infraestrutura), com foco em:

- padronizacao por catalogo tecnico (Local -> Operacao -> Equipamentos),
- versionamento por requisicao de projeto,
- preenchimento manual + preenchimento automatico por formulas,
- exportacao operacional (Excel) e portabilidade de configuracoes (JSON),
- governanca por perfil de usuario.

## 2. Arquitetura geral

### 2.1 Visao em camadas
- Frontend: React + MUI + DataGrid (SPA com rota base `/sigp`).
- API: NestJS (REST) + Prisma (PostgreSQL) + JWT + RBAC.
- Persistencia: PostgreSQL (dados de negocio) + Redis (filas BullMQ).
- Assincrono: BullMQ para tarefas de exportacao Excel e envio de e-mail.
- Operacao: Docker Compose, migracoes Prisma no deploy, manutencao local de backup/retencao/restore-test.

### 2.2 Topologia de runtime (docker-compose)
- `web-frontend` (Nginx): porta 8080 interna/publica.
- `api-server` (Nest): porta 3000.
- `queue-worker` (Nest + BullMQ workers).
- `postgres-db` (PostgreSQL 15, com WAL archive local).
- `redis-queue` (Redis 7, AOF ligado).
- `db-maintenance` (cron de backup/retencao/healthcheck/restore-test).

### 2.3 Reverse proxy externo
Arquivo host VM: `nginx-sigp.conf` (porta 1180):
- `http://<host>:1180/sigp/` -> frontend
- `http://<host>:1180/sigp-api/` -> backend

## 3. Subsystems e responsabilidades

## 3.1 Autenticacao e autorizacao
- Login JWT em `/auth/login`.
- Registro publico opcional em `/auth/register` (bloqueado por default via `ALLOW_PUBLIC_REGISTER=false`).
- Token enviado em `Authorization: Bearer ...`.
- Guardas:
  - `AuthGuard('jwt')` valida sessao.
  - `RolesGuard` valida papel (`QUANTIFIER`, `MANAGER`, `AUDITOR`, `ADMIN`).
  - `ADMIN` tem override de permissoes no guard.

## 3.2 Gestao de usuarios
- CRUD de usuarios em `/users` (somente ADMIN).
- Regras de seguranca:
  - nao permite remover ultimo ADMIN,
  - ADMIN nao pode se auto-excluir,
  - ADMIN nao pode remover a propria permissao ADMIN.

## 3.3 Projetos e versoes (requisicoes)
- Projeto e container de requisicoes.
- Uma requisicao representa uma versao (`version` editavel e livre).
- E possivel:
  - criar versao inicial por projeto,
  - clonar snapshot de versao anterior,
  - editar versao textual,
  - excluir requisicao (ADMIN),
  - excluir projeto inteiro (ADMIN, com cascata manual de dados vinculados).

## 3.4 Configuracoes de Projeto (campos dinamicos)
- Catalogo de campos administraveis em `/project-header-fields`.
- Tipos suportados:
  - `TEXT`
  - `NUMBER`
  - `SELECT` (dropdown com opcoes)
  - `COMPUTED` (calculado por formula)
- Campos sao ordenaveis (`sortOrder`) e ativaveis/desativaveis.
- Cada requisicao recebe uma instancia de valor para cada campo ativo (`RequisitionProjectConfig`).
- Campo calculado:
  - e somente leitura no preenchimento da requisicao,
  - recalculado no backend por formula.

## 3.5 Catalogo tecnico (Local -> Operacao -> Equipamento)
- CRUD administrativo em `/catalog`.
- Equipamento possui:
  - `code` (codigo),
  - `description`,
  - `baseQuantity`,
  - regra de auto preenchimento por:
    - campo de configuracao + multiplicador, ou
    - formula completa (`autoFormulaExpression`).
- Importacao em lote:
  - endpoint `/catalog/import`,
  - suporta CSV/TXT/XLSX,
  - cabecalho minimo: `Local`, `Operacao`, `Descricao dos Equipamentos` (`Codigo Nimbi` opcional),
  - deduplica linhas repetidas no mesmo arquivo,
  - evita reimportar item identico (local+operacao+codigo+descricao).

## 3.6 Computadores por area e Balancas Retaguarda por area
- Dois catalogos separados:
  - `ComputerAreaCatalog` (`/computer-areas/catalog`)
  - `BackofficeScaleAreaCatalog` (`/backoffice-scales/catalog`)
- Cada requisicao cria linhas espelho para cada area ativa.
- Quantidades por area entram no contexto de formulas de auto preenchimento dos equipamentos.
- Exclusao de area e soft delete (`isActive=false`) no catalogo.

## 3.7 Requisicao operacional (tela de preenchimento)
Dentro de cada requisicao existem 4 blocos:

- Configuracoes de Projeto
- Balancas Retaguarda por Area
- Computadores por Area
- Grade de itens de catalogo (Local/Operacao/Equipamento)

Regras de preenchimento de item:
- `Qtd Auto` = resultado do motor de auto preenchimento.
- `Qtd Manual` = ajuste sobre a automatica (pode ser negativo).
- `Qtd Final` = `overrideValue` (se houver) senao `Qtd Auto + Qtd Manual`.

Origem da quantidade (`quantitySourceType`):
- `PURCHASE` (compra)
- `STOCK_AGP` (estoque), com detalhe textual em `quantitySourceNote`.

## 3.8 Motor de formulas
Motor baseado em `mathjs`, com normalizacao de sintaxe para estilo planilha/PT-BR.

Comandos reconhecidos (principais):
- `se(...)`, `if(...)`
- `ou(...)`, `or(...)`
- `e(...)`, `and(...)`
- `soma(...)`, `sum(...)`
- `arred(...)` (arredondamento com casas)
- `inteiro(...)`, `int(...)` (parte inteira)
- `concat(...)`, `concatenar(...)`, operador `&`
- `qtd(local, operacao, codigo)` para consultar quantidade final de outro item do catalogo

Referencias de variaveis:
- campos de projeto por `{Campo}` ou `{{Campo}}` (tambem por alias normalizado),
- areas de computadores:
  - `{{Computadores - Total}}`
  - `{{Computadores - Nome da Area}}`
- areas de balancas:
  - `{{Balancas Retaguarda - Total}}`
  - `{{Balancas Retaguarda - Nome da Area}}`

Tratamento de retorno de formula para equipamento:
- numero -> quantidade de compra,
- booleano -> 1/0,
- texto de estoque com quantidade entre parenteses (ou numero embutido):
  - `EST. AGP (06)`
  - `LOC. H2L (02)`
  - `COMD.EBT (01)`

## 3.9 Export/Import de configuracoes do sistema
- Tela em `/settings/system`.
- Exportacao seletiva (`/settings/export`) dos blocos:
  - catalogo (inclui areas de computadores e balancas),
  - configuracoes de projeto,
  - projetos e versoes ativas (nao concluidas).
- Importacao seletiva (`/settings/import`) com merge:
  - cria/atualiza por chaves funcionais,
  - tenta reconciliar IDs por label/aliases,
  - evita duplicar estrutura equivalente.

## 3.10 Tarefas assicronas
- `/tasks/excel/:requisitionId` enfileira exportacao de requisicao em Excel.
- `/tasks/email` enfileira envio de email (ADMIN).
- Processadores BullMQ:
  - `excelQueue`: gera arquivo em `backend/exports`.
  - `emailQueue`: envio SMTP com retry/backoff exponencial.

## 4. Modelo de dados e links entre subsistemas

## 4.1 Entidades nucleares
- `User` -> controle de acesso.
- `Project` -> agregador de `Requisition`.
- `Requisition` -> versao de levantamento.
- `RequisitionItem` -> linhas de materiais da versao.
- `ProjectHeaderField` -> definicao de campos dinamicos.
- `RequisitionProjectConfig` -> valor dos campos por requisicao.
- `LocalCatalog` -> `OperationCatalog` -> `EquipmentCatalog` (template tecnico).
- `ComputerAreaCatalog` + `RequisitionComputerArea`.
- `BackofficeScaleAreaCatalog` + `RequisitionBackofficeScaleArea`.

## 4.2 Viculacao entre subsistemas (fluxo principal)
1. ADMIN configura campos de projeto + catalogo tecnico.
2. Usuario cria projeto e requisicao.
3. Backend sincroniza automaticamente:
   - configs da requisicao com campos ativos,
   - itens da requisicao com catalogo ativo,
   - areas de computadores/balancas ativas.
4. Usuario preenche configuracoes e quantidades.
5. Backend recalcula formulas e auto preenchimento.
6. Usuario exporta para Excel ou conclui versao.

## 4.3 Matriz UI -> API -> tabelas (resumo)
- Dashboard -> `/projects` -> `Project`
- Versoes do projeto -> `/projects/:id`, `/requisitions/*` -> `Requisition`, `RequisitionItem`, `RequisitionProjectConfig`
- Config Projeto (admin) -> `/project-header-fields/*` -> `ProjectHeaderField`
- Catalogo -> `/catalog/*` -> `LocalCatalog`, `OperationCatalog`, `EquipmentCatalog`
- Computadores catalogo -> `/computer-areas/catalog` -> `ComputerAreaCatalog`
- Balancas catalogo -> `/backoffice-scales/catalog` -> `BackofficeScaleAreaCatalog`
- Requisicao grid -> `/requisitions/:id/*` -> `RequisitionItem`, `RequisitionProjectConfig`, `RequisitionComputerArea`, `RequisitionBackofficeScaleArea`
- Usuarios -> `/users/*` -> `User`
- System export/import -> `/settings/*` -> multiplas tabelas

## 5. Regras de negocio importantes

## 5.1 Estado da requisicao e campo "Status da Requisicao"
- Existe sincronizacao bidirecional entre:
  - `Requisition.status` (`PENDING`, `FILLING`, `COMPLETED`) e
  - valor do campo dinamico cujo label equivale a "Status da Requisicao".
- `COMPLETED` coloca requisicao em `isReadOnly=true`.
- Em modo somente leitura:
  - usuarios normais nao editam,
  - ADMIN pode alterar somente o campo de status para reabrir fluxo.

## 5.2 Sincronizacao automatica (sem botoes manuais)
- Alterou configuracao de projeto na tela -> debounce -> salva configs -> recalcula formulas -> atualiza itens.
- Alterou quantidade manual de item -> debounce -> salva ajuste -> recalcula auto formulas dependentes.
- Alterou quantidades de computadores/balancas -> debounce -> salva -> recalcula auto formulas dependentes.

## 5.3 Catalogo refletindo em requisicoes
- Ao carregar itens de requisicao, backend sincroniza com catalogo:
  - adiciona equipamentos novos,
  - atualiza labels/codigo/local/operacao,
  - remove itens obsoletos somente se requisicao estiver `PENDING`.

## 5.4 Concorrencia otimista
- Itens e linhas de area usam `versionLock`.
- Atualizacao com lock antigo gera erro de conflito e exige refresh.

## 6. Rotas principais da API (resumo)

## 6.1 Auth
- `POST /auth/login`
- `POST /auth/register` (depende de `ALLOW_PUBLIC_REGISTER`)

## 6.2 Projetos
- `POST /projects`
- `GET /projects`
- `GET /projects/:id`
- `DELETE /projects/:id` (ADMIN)

## 6.3 Requisicoes
- `POST /requisitions/project/:projectId`
- `POST /requisitions/:id/snapshot`
- `PUT /requisitions/:id/version`
- `PUT /requisitions/:id/complete`
- `GET /requisitions/:reqId/items`
- `GET /requisitions/:reqId/project-configs`
- `GET /requisitions/:reqId/computer-areas`
- `GET /requisitions/:reqId/backoffice-scale-areas`
- `PUT /requisitions/:reqId/project-configs`
- `POST /requisitions/:reqId/items`
- `POST /requisitions/:reqId/items/auto-fill`
- `PUT /requisitions/items/:itemId/quantity`
- `PUT /requisitions/computer-areas/:rowId/quantity`
- `PUT /requisitions/backoffice-scale-areas/:rowId/quantity`
- `PUT /requisitions/items/:itemId/override` (ADMIN)
- `PUT /requisitions/items/:itemId/receive` (MANAGER/ADMIN)
- `DELETE /requisitions/:id` (ADMIN)

## 6.4 Config projeto, catalogo e sistema
- `/project-header-fields/*` (ADMIN)
- `/catalog/*` (ADMIN)
- `/computer-areas/catalog/*` (ADMIN)
- `/backoffice-scales/catalog/*` (ADMIN)
- `/settings/export` (ADMIN)
- `/settings/import` (ADMIN)
- `/users/*` (ADMIN)
- `/tasks/excel/:requisitionId` (ADMIN/QUANTIFIER/MANAGER)
- `/tasks/email` (ADMIN)

## 7. Frontend: estrutura e navegacao

Rotas SPA (`/sigp`):
- `/login`
- `/` Dashboard
- `/project/:projectId` requisicoes do projeto
- `/requisition/:reqId` preenchimento da versao
- `/settings/system`
- `/settings/project`
- `/settings/catalogs`
- `/settings/catalogs/computer-areas`
- `/settings/catalogs/backoffice-scales`
- `/settings/users`

Controle de acesso no frontend:
- `PrivateRoute` exige token.
- Rotas de configuracao exigem `ADMIN`.

## 8. Operacao, deploy e backup

## 8.1 Deploy
Script oficial: `deploy.sh`
- derruba stack antiga,
- builda imagens (`api-server`, `api-migrate`, `queue-worker`, `web-frontend`, `db-maintenance`),
- sobe `postgres-db`, `redis-queue`, `db-maintenance`,
- espera healthchecks,
- executa migracoes Prisma (`api-migrate`),
- valida status das migracoes,
- sobe app (`api-server`, `queue-worker`, `web-frontend`),
- valida healthcheck final.

## 8.2 Migracoes de banco
Estado atual: 8 migracoes em `backend/prisma/migrations`:
- init,
- ajustes de campos de cabecalho,
- vinculo de configs por requisicao + versao flexivel,
- catalogo local/operacao/equipamentos,
- tipos de campo + formulas de catalogo,
- origem de quantidade em item,
- areas de computadores,
- areas de balancas retaguarda.

## 8.3 Backup local e retencao (mesma VM)
Servico `db-maintenance`:
- backup diario a cada 6h (`pg_dump -Fc`),
- backup semanal,
- prune por retencao (diario/semanal/WAL),
- teste semanal de restore automatizado,
- healthcheck horario com idade maxima de backup e limite de uso de disco.

Observacao critica:
- todo backup ainda esta na mesma VM; perda total da VM/disco implica perda de backup.

## 9. Particularidades e decisoes de implementacao

- `queue-worker` usa o mesmo entrypoint (`node dist/main`) do servidor API; na pratica sobe app Nest completo sem exposicao de porta externa.
- Motor de formulas tenta normalizar sintaxe de planilha PT-BR e resolver aliases, mas formulas malformadas ainda podem causar erros de avaliacao.
- Erros de formula em campo calculado de configuracao de projeto sao logados e nao derrubam o carregamento da requisicao.
- Erros de formula em auto preenchimento de item bloqueiam sincronizacao daquele fluxo e aparecem na UI.
- Exclusao de catalogo e destrutiva para templates; impacto em requisicoes depende do status (sincronizacao remove obsoletos apenas em `PENDING`).

## 10. Limites conhecidos e pontos para evolucao

1. Seguranca:
- JWT e credenciais precisam ser rigorosamente gerenciados por segredo forte e rotacao.
- Token no `localStorage` e pratico, mas aumenta superficie em caso de XSS.

2. Observabilidade:
- faltam dashboards consolidados (latencia API, filas, erros por endpoint, taxa de falha de formulas).

3. Confiabilidade:
- ainda sem backup offsite.
- restore test valida tabelas centrais, mas pode evoluir para suite mais completa de consistencia de negocio.

4. Modelo de formula:
- parser atual cobre muitos casos reais, mas nao e uma linguagem formal completa com tipagem forte e debug estruturado.

## 11. Referencias de implementacao
- Backend app: `backend/src/app.module.ts`
- Modelo de dados: `backend/prisma/schema.prisma`
- Regras de requisicao e formulas: `backend/src/requisitions/requisitions.service.ts`
- Catalogo/importacao/validador de formula: `backend/src/catalog/catalog.service.ts`
- Import/export de configuracoes: `backend/src/system-settings/system-settings.service.ts`
- Frontend requisicao: `frontend/src/pages/RequisitionGrid.tsx`
- Frontend catalogo: `frontend/src/pages/CatalogsConfig.tsx`
- Deploy: `deploy.sh`
- Orquestracao: `docker-compose.yml`
- Backup local: `ops/backup/*`

