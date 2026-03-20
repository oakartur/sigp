#!/bin/bash
set -euo pipefail

ENV_FILE=".env.hml"

echo "========================================"
echo " Iniciando deploy do SIGP (HML)        "
echo "========================================"

if [ ! -f "$ENV_FILE" ]; then
  echo "Erro: Arquivo $ENV_FILE não encontrado."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

wait_for_health() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0

  echo "Aguardando healthcheck de '${service}'..."
  while true; do
    local container_id
    container_id="$(docker compose -p "${COMPOSE_PROJECT_NAME}" ps -q "${service}" 2>/dev/null | head -n1)"
    if [[ -z "${container_id}" ]]; then
      sleep 3
      elapsed=$((elapsed + 3))
      if [[ ${elapsed} -ge ${timeout_seconds} ]]; then
        echo "Timeout aguardando container de '${service}'."
        docker compose -p "${COMPOSE_PROJECT_NAME}" ps
        exit 1
      fi
      continue
    fi

    local status
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"

    if [[ "${status}" == "healthy" ]]; then
      echo "Servico '${service}' saudavel."
      break
    fi

    sleep 5
    elapsed=$((elapsed + 5))
    if [[ ${elapsed} -ge ${timeout_seconds} ]]; then
      echo "Timeout aguardando '${service}' ficar healthy."
      docker compose -p "${COMPOSE_PROJECT_NAME}" ps
      exit 1
    fi
  done
}

echo "Parando stack HML..."
docker compose -p "${COMPOSE_PROJECT_NAME}" down --remove-orphans || true

echo "Buildando imagens..."
docker compose -p "${COMPOSE_PROJECT_NAME}" build api-server api-migrate queue-worker web-frontend db-maintenance

echo "Subindo banco, redis e manutencao..."
docker compose -p "${COMPOSE_PROJECT_NAME}" up -d postgres-db redis-queue db-maintenance

wait_for_health postgres-db 180
wait_for_health redis-queue 120
wait_for_health db-maintenance 300

echo "Executando migracoes Prisma (job dedicado)..."
docker compose -p "${COMPOSE_PROJECT_NAME}" run --rm --build api-migrate

echo "Validando consistencia de migracoes..."
docker compose -p "${COMPOSE_PROJECT_NAME}" run --rm --build api-migrate npx prisma migrate status

echo "Subindo API, worker e frontend..."
docker compose -p "${COMPOSE_PROJECT_NAME}" up -d api-server queue-worker web-frontend

wait_for_health api-server 180
wait_for_health web-frontend 180

echo "Limpando imagens dangling..."
docker image prune -f

echo ""
echo "Deploy HML concluido com sucesso."
echo "Frontend: http://<IP_DA_VM>:1181/sigp/"
echo "API:      http://<IP_DA_VM>:1181/sigp-api/"
echo ""
docker compose -p "${COMPOSE_PROJECT_NAME}" ps
