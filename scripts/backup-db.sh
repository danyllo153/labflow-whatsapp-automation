#!/bin/bash
# Backup diario do banco labflow (pg_dump em formato compactado).
# Roda no servidor, pelo cron. Ver docs/scripts.md.
#
# O dump e feito pelo administrador do banco (POSTGRES_USER do conteiner, "evolution"), nao pelo labflow_app:
# desde a migration 050 o app tem o schema "app" (credenciais etc.) que o labflow_app nao le, e o pg_dump
# falhava com "permission denied for schema app" (backups vazios de 21/10/2026).
set -euo pipefail
umask 077  # backup com todos os dados do bot e do app: so o dono le

DESTINO="/home/dan/labflow/backups"
ARQ="$DESTINO/labflow_$(date +%F_%H%M).dump"

# falhou ou ficou vazio: nao deixa arquivo vazio para tras (parecia um backup bom na listagem)
falhou() {
  rm -f "$ARQ"
  echo "$(date '+%F %T') ERRO: backup falhou"
  exit 1
}
trap falhou ERR

/usr/bin/docker exec labflow-postgres pg_dump -U evolution -d labflow -Fc > "$ARQ"

# arquivo vazio, ou sem a lista de tabelas, = backup falhou
TABELAS=$(/usr/bin/docker exec -i labflow-postgres pg_restore -l < "$ARQ" | grep -c "TABLE DATA" || true)
if [ ! -s "$ARQ" ] || [ "${TABELAS:-0}" -lt 1 ]; then
  falhou
fi

# apaga backups com mais de 14 dias
find "$DESTINO" -name 'labflow_*.dump' -mtime +14 -delete

echo "$(date '+%F %T') ok $(du -h "$ARQ" | cut -f1) $ARQ"
