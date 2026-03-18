#!/bin/bash
set -euo pipefail

echo "Iniciando deploy do SIGP..."

wait_for_health() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0

  echo "Aguardando healthcheck de '${service}'..."
  while true; do
    local container_id
    container_id="$(docker compose ps -q "${service}" 2>/dev/null | head -n1)"
    if [[ -z "${container_id}" ]]; then
      sleep 3
      elapsed=$((elapsed + 3))
      if [[ ${elapsed} -ge ${timeout_seconds} ]]; then
        echo "Timeout aguardando container de '${service}'."
        docker compose ps
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
      docker compose ps
      exit 1
    fi
  done
}

echo "Parando stack atual..."
docker compose down --remove-orphans || true

echo "Buildando imagens de backend, migracao, frontend e manutencao..."
docker compose build api-server api-migrate queue-worker web-frontend db-maintenance

echo "Subindo banco, redis e manutencao..."
docker compose up -d postgres-db redis-queue db-maintenance

wait_for_health postgres-db 180
wait_for_health redis-queue 120
wait_for_health db-maintenance 300

echo "Executando migracoes Prisma (job dedicado)..."
docker compose run --rm --build api-migrate

echo "Validando consistencia entre banco e pasta prisma/migrations..."
docker compose run --rm --build api-migrate sh -lc 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-migrations prisma/migrations --exit-code'

echo "Subindo API, worker e frontend..."
docker compose up -d api-server queue-worker web-frontend

wait_for_health api-server 180
wait_for_health web-frontend 180

echo "Limpando imagens dangling..."
docker image prune -f

echo ""
echo "Deploy concluido com sucesso."
echo "Frontend: http://<IP_DA_VM>:1180/sigp/"
echo "API:      http://<IP_DA_VM>:1180/sigp-api/"
echo ""
docker compose ps
