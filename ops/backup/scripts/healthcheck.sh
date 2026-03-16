#!/usr/bin/env bash
set -euo pipefail

source /opt/sigp-backup/scripts/common.sh

ensure_dirs

now_epoch="$(date +%s)"
last_backup_epoch="$(read_state_epoch "last_successful_backup")"
last_restore_epoch="$(read_state_epoch "last_successful_restore_test")"
status=0
messages=()

if [[ -z "${last_backup_epoch}" ]]; then
  messages+=("Nenhum backup concluido ainda.")
  status=1
else
  backup_age_hours=$(( (now_epoch - last_backup_epoch) / 3600 ))
  if (( backup_age_hours > BACKUP_MAX_AGE_HOURS )); then
    messages+=("Ultimo backup tem ${backup_age_hours}h (limite ${BACKUP_MAX_AGE_HOURS}h).")
    status=1
  fi
fi

disk_usage="$(df -P "${BACKUP_BASE_DIR}" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ -n "${disk_usage}" ]] && (( disk_usage > MAX_DISK_USAGE_PERCENT )); then
  messages+=("Uso de disco em ${BACKUP_BASE_DIR} = ${disk_usage}% (limite ${MAX_DISK_USAGE_PERCENT}%).")
  status=1
fi

if [[ -n "${last_restore_epoch}" ]]; then
  restore_age_days=$(( (now_epoch - last_restore_epoch) / 86400 ))
  if (( restore_age_days > 8 )); then
    messages+=("Ultimo restore test tem ${restore_age_days} dias (limite 8 dias).")
    status=1
  fi
fi

if (( status == 0 )); then
  log "INFO" "Healthcheck backup OK."
else
  for msg in "${messages[@]}"; do
    log "ERROR" "${msg}"
  done
fi

exit "${status}"
