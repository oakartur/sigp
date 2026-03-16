#!/usr/bin/env bash
set -euo pipefail

source /opt/sigp-backup/scripts/common.sh

ensure_dirs
touch "${LOG_DIR}/backup.log" "${LOG_DIR}/cron.log" "${LOG_DIR}/health.log"

# Garante baseline de backup logo no boot do servico.
/opt/sigp-backup/scripts/backup_local.sh || true

exec crond -f -l 8
