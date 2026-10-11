#!/usr/bin/env bash
# Restaura um backup em um banco (CRIA o banco de destino; recusa sobrescrever um banco que já tem tabelas).
# Uso:  DB_USER=root [DB_PASSWORD=...] [DB_HOST=...] scripts/restore.sh arquivo.sql.gz NOME_DO_BANCO_DESTINO
set -euo pipefail
FILE="${1:?arquivo .sql.gz}"; TARGET="${2:?banco de destino}"
[ -f "$FILE.sha256" ] && (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256")
gzip -t "$FILE"
ARGS=()
[ -n "${DB_HOST:-}" ] && ARGS+=(-h "$DB_HOST" -P "${DB_PORT:-3306}")
[ -n "${DB_USER:-}" ] && ARGS+=(-u "$DB_USER")
[ -n "${DB_PASSWORD:-}" ] && export MYSQL_PWD="$DB_PASSWORD"
CLI="$(command -v mariadb || command -v mysql)"
EXISTING="$("$CLI" "${ARGS[@]}" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TARGET'")"
[ "$EXISTING" = "0" ] || { echo "ERRO: o banco '$TARGET' já tem $EXISTING tabela(s). Restaure em um banco vazio e troque depois." >&2; exit 2; }
"$CLI" "${ARGS[@]}" -e "CREATE DATABASE IF NOT EXISTS \`$TARGET\` CHARACTER SET utf8mb4"
zcat "$FILE" | "$CLI" "${ARGS[@]}" "$TARGET"
echo "restauração concluída em '$TARGET'"
