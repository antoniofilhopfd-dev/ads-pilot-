#!/usr/bin/env bash
# Teste ponta a ponta de backup → restauração → verificação (banco local de desenvolvimento, usuário root por socket).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=adspilot_dev; DST=adspilot_restore_test; DIR=./backups
mariadb -uroot -e "DROP DATABASE IF EXISTS $DST"
EMAIL="$(node --env-file=.env --import tsx scripts/seed-restore-test.ts | tail -1)"
FILE="$(DB_NAME=$SRC DB_USER=root scripts/backup.sh $DIR | tail -1)"
DB_USER=root scripts/restore.sh "$FILE" "$DST"
# segunda restauração no mesmo destino deve ser RECUSADA (não sobrescreve)
if DB_USER=root scripts/restore.sh "$FILE" "$DST" 2>/dev/null; then echo "FALHA: sobrescreveu banco existente"; exit 1; else echo "✔ restaurar sobre banco existente é recusado"; fi
# arquivo adulterado deve ser recusado
cp "$FILE" "$DIR/adulterado.sql.gz"; cp "$FILE.sha256" "$DIR/adulterado.sql.gz.sha256"; sed -i 's#adspilot-.*\.sql\.gz#adulterado.sql.gz#' "$DIR/adulterado.sql.gz.sha256"; printf 'x' >> "$DIR/adulterado.sql.gz"
if DB_USER=root scripts/restore.sh "$DIR/adulterado.sql.gz" ${DST}_2 >/dev/null 2>&1; then echo "FALHA: aceitou backup adulterado"; exit 1; else echo "✔ backup adulterado é recusado"; fi
rm -f "$DIR"/adulterado.sql.gz*; mariadb -uroot -e "DROP DATABASE IF EXISTS ${DST}_2"
mariadb -uroot -e "GRANT ALL ON $DST.* TO 'adspilot'@'localhost'"
# migrações sobre o banco restaurado = nada a fazer
DATABASE_URL="mysql://adspilot:adspilot_dev_pw@localhost:3306/$DST" node --import tsx scripts/migrate.ts >/dev/null && echo "✔ migrações aplicadas sobre o restaurado sem erro (idempotentes)"
EMAIL="$EMAIL" PASSWORD=SenhaRestore2026 EXPECT_TOKEN=EAAB-token-de-teste-restore \
  SOURCE_URL="mysql://adspilot:adspilot_dev_pw@localhost:3306/$SRC" RESTORE_URL="mysql://adspilot:adspilot_dev_pw@localhost:3306/$DST" \
  node --env-file=.env --import tsx scripts/verify-restore.ts
echo "BACKUP/RESTAURAÇÃO OK  ($FILE)"
