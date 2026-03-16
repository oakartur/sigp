#!/usr/bin/env bash
set -euo pipefail

source /opt/sigp-backup/scripts/common.sh

ensure_dirs
require_tools

if ! db_ready; then
  log "ERROR" "Banco indisponivel para restore test."
  exit 1
fi

latest_backup="$(ls -1t "${BACKUP_WEEKLY_DIR}"/sigp_*.dump "${BACKUP_DAILY_DIR}"/sigp_*.dump 2>/dev/null | head -n1 || true)"
if [[ -z "${latest_backup}" ]]; then
  log "ERROR" "Nenhum backup encontrado para restore test."
  exit 1
fi

verify_checksum_if_present "${latest_backup}"

started_at="$(date +%s)"
test_db="${PGDATABASE}_restore_test"

psql "${DB_ARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${test_db}' AND pid <> pg_backend_pid();" >/dev/null
psql "${DB_ARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${test_db}\";" >/dev/null
psql "${DB_ARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${test_db}\";" >/dev/null

pg_restore "${DB_ARGS[@]}" -d "${test_db}" --no-owner --no-privileges "${latest_backup}" >/dev/null

project_table_ok="$(psql "${DB_ARGS[@]}" -d "${test_db}" -tAc "SELECT to_regclass('public.\"Project\"') IS NOT NULL;")"
requisition_table_ok="$(psql "${DB_ARGS[@]}" -d "${test_db}" -tAc "SELECT to_regclass('public.\"Requisition\"') IS NOT NULL;")"
item_table_ok="$(psql "${DB_ARGS[@]}" -d "${test_db}" -tAc "SELECT to_regclass('public.\"RequisitionItem\"') IS NOT NULL;")"

if [[ "${project_table_ok}" != "t" || "${requisition_table_ok}" != "t" || "${item_table_ok}" != "t" ]]; then
  log "ERROR" "Restore test falhou: tabelas criticas ausentes."
  exit 1
fi

projects_count="$(psql "${DB_ARGS[@]}" -d "${test_db}" -tAc "SELECT COUNT(*) FROM \"Project\";")"
requisitions_count="$(psql "${DB_ARGS[@]}" -d "${test_db}" -tAc "SELECT COUNT(*) FROM \"Requisition\";")"
items_count="$(psql "${DB_ARGS[@]}" -d "${test_db}" -tAc "SELECT COUNT(*) FROM \"RequisitionItem\";")"

psql "${DB_ARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${test_db}\";" >/dev/null

duration=$(( $(date +%s) - started_at ))
report_file="${RESTORE_TEST_DIR}/restore_test_$(date +"%Y%m%d_%H%M%S").json"
cat > "${report_file}" <<EOF
{
  "backupFile": "$(basename "${latest_backup}")",
  "testedAtUtc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "durationSeconds": ${duration},
  "counts": {
    "projects": ${projects_count:-0},
    "requisitions": ${requisitions_count:-0},
    "items": ${items_count:-0}
  },
  "status": "ok"
}
EOF

update_state_epoch "last_successful_restore_test"
log "INFO" "Restore test concluido em ${duration}s usando $(basename "${latest_backup}")."
