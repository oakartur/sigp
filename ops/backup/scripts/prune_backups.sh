#!/usr/bin/env bash
set -euo pipefail

source /opt/sigp-backup/scripts/common.sh

ensure_dirs

daily_removed=0
weekly_removed=0
wal_removed=0

remove_backup_bundle() {
  local file="$1"
  rm -f "${file}" "${file}.sha256" "${file}.json"
}

while IFS= read -r -d '' old_file; do
  remove_backup_bundle "${old_file}"
  daily_removed=$((daily_removed + 1))
done < <(find "${BACKUP_DAILY_DIR}" -maxdepth 1 -type f -name 'sigp_*.dump' -mtime +"$((BACKUP_KEEP_DAYS - 1))" -print0)

weekly_max_days=$((BACKUP_KEEP_WEEKS * 7))
while IFS= read -r -d '' old_file; do
  remove_backup_bundle "${old_file}"
  weekly_removed=$((weekly_removed + 1))
done < <(find "${BACKUP_WEEKLY_DIR}" -maxdepth 1 -type f -name 'sigp_*.dump' -mtime +"$((weekly_max_days - 1))" -print0)

while IFS= read -r -d '' old_file; do
  rm -f "${old_file}"
  wal_removed=$((wal_removed + 1))
done < <(find "${WAL_DIR}" -maxdepth 1 -type f -mtime +"$((WAL_KEEP_DAYS - 1))" -print0)

log "INFO" "Prune concluido. daily=${daily_removed} weekly=${weekly_removed} wal=${wal_removed}"
