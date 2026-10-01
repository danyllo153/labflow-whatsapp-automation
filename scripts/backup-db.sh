#!/bin/bash
# Backup diario do banco labflow (pg_dump em formato compactado).
# Roda no servidor, pelo cron. Ver docs/scripts.md.
set -euo pipefail
umask 077  # backup com todos os dados do bot: so o dono le

DESTINO="/home/dan/labflow/backups"
ARQ="$DESTINO/labflow_$(date +%F_%H%M).dump"

/usr/bin/docker exec labflow-postgres pg_dump -U labflow_app -d labflow -Fc > "$ARQ"

# arquivo vazio = backup falhou
if [ ! -s "$ARQ" ]; then
  echo "$(date '+%F %T') ERRO: backup vazio"
  rm -f "$ARQ"
  exit 1
fi

# apaga backups com mais de 14 dias
find "$DESTINO" -name 'labflow_*.dump' -mtime +14 -delete

echo "$(date '+%F %T') ok $(du -h "$ARQ" | cut -f1) $ARQ"
