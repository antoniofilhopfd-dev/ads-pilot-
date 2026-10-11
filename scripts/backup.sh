#!/usr/bin/env bash
# Backup lógico do banco do AdsPilot (MySQL/MariaDB) com verificação de integridade do arquivo.
# Uso:  DB_NAME=adspilot DB_USER=... DB_PASSWORD=... [DB_HOST=127.0.0.1 DB_PORT=3306] [KEEP=14] scripts/backup.sh [diretório]
# Guarde TAMBÉM a ENCRYPTION_KEY (cofre separado): sem ela os tokens da Meta do backup ficam ilegíveis.
set -euo pipefail
DIR="${1:-./backups}"; KEEP="${KEEP:-14}"
: "${DB_NAME:?defina DB_NAME}"
mkdir -p "$DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"; OUT="$DIR/adspilot-$DB_NAME-$TS.sql.gz"
ARGS=(--single-transaction --routines --triggers --hex-blob --default-character-set=utf8mb4)
[ -n "${DB_HOST:-}" ] && ARGS+=(-h "$DB_HOST" -P "${DB_PORT:-3306}")
[ -n "${DB_USER:-}" ] && ARGS+=(-u "$DB_USER")
[ -n "${DB_PASSWORD:-}" ] && export MYSQL_PWD="$DB_PASSWORD"
DUMP="$(command -v mariadb-dump || command -v mysqldump)"
"$DUMP" "${ARGS[@]}" "$DB_NAME" | gzip -9 > "$OUT"
gzip -t "$OUT"                                   # arquivo íntegro?
(cd "$DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
zcat "$OUT" | tail -n 3 | grep -q "Dump completed" # dump terminou (não foi cortado)?
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
# retenção: mantém os KEEP mais recentes
ls -1t "$DIR"/adspilot-"$DB_NAME"-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$OUT"
