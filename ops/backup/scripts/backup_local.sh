#!/usr/bin/env bash
set -euo pipefail

source /opt/sigp-backup/scripts/common.sh

ensure_dirs
require_tools

if ! db_ready; then
  log "ERROR" "Banco indisponivel para backup local."
  exit 1
fi

started_at="$(date +%s)"
backup_file="${BACKUP_DAILY_DIR}/sigp_$(date +"%Y%m%d_%H%M%S").dump"

log "INFO" "Iniciando backup local: ${backup_file}"
pg_dump "${DB_ARGS[@]}" -Fc -Z 6 --no-owner --no-privileges -f "${backup_file}" "${PGDATABASE}"

duration=$(( $(date +%s) - started_at ))
write_checksum "${backup_file}"
write_metadata "${backup_file}" "daily" "${duration}"
update_state_epoch "last_successful_backup"

log "INFO" "Backup local concluido em ${duration}s: ${backup_file}"
