# Operacao de Backup Local (Mesma VM)

Este pacote implementa backup, retencao, teste de restore e healthcheck operacional
com foco em confiabilidade local (sem offsite nesta fase).

## Componentes

- Servico Docker: `db-maintenance`
- Scripts:
  - `backup_local.sh` (a cada 6h)
  - `backup_weekly.sh` (semanal)
  - `prune_backups.sh` (retencao)
  - `restore_test.sh` (teste de recuperacao semanal)
  - `healthcheck.sh` (validacao horaria)

## Diretórios no volume `db_backups`

- `/backups/daily` backups logicos diários
- `/backups/weekly` backups semanais
- `/backups/wal` arquivos WAL arquivados (PITR local)
- `/backups/manifests` estados de sucesso
- `/backups/restore-tests` relatorios de restore
- `/backups/logs` logs operacionais

## Politicas default

- Backup local: a cada 6 horas
- Backup semanal: domingo 00:15
- Restore test: domingo 00:45
- Retencao diária: 14 dias
- Retencao semanal: 8 semanas
- Retencao WAL: 7 dias

## Variáveis de ambiente

- `BACKUP_KEEP_DAYS` (default: `14`)
- `BACKUP_KEEP_WEEKS` (default: `8`)
- `WAL_KEEP_DAYS` (default: `7`)
- `BACKUP_MAX_AGE_HOURS` (default: `8`)
- `MAX_DISK_USAGE_PERCENT` (default: `80`)
- `TZ` (default: `America/Cuiaba`)

## Operacao

### Verificar status dos serviços

```bash
docker compose ps
```

### Ver logs do backup

```bash
docker compose logs -f db-maintenance
```

### Rodar backup manual

```bash
docker compose exec db-maintenance /opt/sigp-backup/scripts/backup_local.sh
```

### Rodar restore test manual

```bash
docker compose exec db-maintenance /opt/sigp-backup/scripts/restore_test.sh
```

### Validar healthcheck manual

```bash
docker compose exec db-maintenance /opt/sigp-backup/scripts/healthcheck.sh
```

## Limitação conhecida desta fase

Como todos os backups estão na mesma VM, perda total da VM/disco implica perda dos backups.
Offsite deve ser implementado na fase seguinte.
