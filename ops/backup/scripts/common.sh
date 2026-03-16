#!/usr/bin/env bash
set -euo pipefail

BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/backups}"
BACKUP_DAILY_DIR="${BACKUP_BASE_DIR}/daily"
BACKUP_WEEKLY_DIR="${BACKUP_BASE_DIR}/weekly"
WAL_DIR="${BACKUP_BASE_DIR}/wal"
MANIFEST_DIR="${BACKUP_BASE_DIR}/manifests"
LOG_DIR="${BACKUP_BASE_DIR}/logs"
RESTORE_TEST_DIR="${BACKUP_BASE_DIR}/restore-tests"

BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_KEEP_WEEKS="${BACKUP_KEEP_WEEKS:-8}"
WAL_KEEP_DAYS="${WAL_KEEP_DAYS:-7}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-8}"
MAX_DISK_USAGE_PERCENT="${MAX_DISK_USAGE_PERCENT:-80}"

PGHOST="${PGHOST:-postgres-db}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-sigp}"

DB_ARGS=(-h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}")

ensure_dirs() {
  mkdir -p "${BACKUP_DAILY_DIR}" "${BACKUP_WEEKLY_DIR}" "${WAL_DIR}" "${MANIFEST_DIR}" "${LOG_DIR}" "${RESTORE_TEST_DIR}"
}

log() {
  local level="$1"
  shift
  local message="$*"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf "%s [%s] %s\n" "${ts}" "${level}" "${message}" | tee -a "${LOG_DIR}/backup.log"
}

db_ready() {
  pg_isready "${DB_ARGS[@]}" -d "${PGDATABASE}" >/dev/null 2>&1
}

require_tools() {
  local missing=0
  for tool in pg_dump pg_restore psql pg_isready sha256sum find awk df; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
      echo "Ferramenta obrigatoria nao encontrada: ${tool}" >&2
      missing=1
    fi
  done
  if [[ "${missing}" -eq 1 ]]; then
    exit 1
  fi
}

write_checksum() {
  local file="$1"
  sha256sum "${file}" > "${file}.sha256"
}

verify_checksum_if_present() {
  local file="$1"
  if [[ -f "${file}.sha256" ]]; then
    sha256sum -c "${file}.sha256" >/dev/null
  fi
}

write_metadata() {
  local file="$1"
  local backup_type="$2"
  local duration_seconds="$3"
  local size_bytes
  size_bytes="$(wc -c < "${file}")"
  cat > "${file}.json" <<EOF
{
  "file": "$(basename "${file}")",
  "type": "${backup_type}",
  "database": "${PGDATABASE}",
  "host": "${PGHOST}",
  "createdAtUtc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "durationSeconds": ${duration_seconds},
  "sizeBytes": ${size_bytes}
}
EOF
}

update_state_epoch() {
  local state_name="$1"
  date +%s > "${MANIFEST_DIR}/${state_name}.epoch"
}

read_state_epoch() {
  local state_name="$1"
  local state_file="${MANIFEST_DIR}/${state_name}.epoch"
  if [[ ! -f "${state_file}" ]]; then
    echo ""
    return 0
  fi
  cat "${state_file}"
}
