#!/usr/bin/env bash
# Monta um banco PostgreSQL de TESTE para a API do app (APP-002), igual ao do bot, com dados fictícios.
# Usado pelo GitHub Actions; também serve num Linux com PostgreSQL. NUNCA apontar para o banco do servidor.
#
# Uso: LABFLOW_DB_URL=postgresql://usuario:senha@host:5432/banco bash app/api/scripts/preparar_banco_teste.sh
#
# 1. Cria os papéis que as migrations do bot esperam (labflow_app e labflow_leitura), sem login.
# 2. Aplica TODAS as migrations de db/migrations, em ordem, parando no primeiro erro.
# 3. Carrega os dados fictícios de db/seeds (limites de exemplo, demo e placas demo).
set -euo pipefail

: "${LABFLOW_DB_URL:?Defina LABFLOW_DB_URL apontando para um banco de TESTE}"
raiz="$(cd "$(dirname "$0")/../../.." && pwd)"
psql_teste() { psql "$LABFLOW_DB_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql_teste <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_app') THEN CREATE ROLE labflow_app; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'labflow_leitura') THEN CREATE ROLE labflow_leitura; END IF;
END $$;
SQL

for arquivo in "$raiz"/db/migrations/[0-9][0-9][0-9]_*.sql; do
  case "$arquivo" in *_desfazer.sql) continue ;; esac
  echo "migration: $(basename "$arquivo")"
  psql_teste -f "$arquivo"
done

for semente in limites_nfc_exemplo.sql demo.sql demo_placas.sql; do
  echo "dados fictícios: $semente"
  psql_teste -f "$raiz/db/seeds/$semente"
done

echo "Banco de teste pronto."
