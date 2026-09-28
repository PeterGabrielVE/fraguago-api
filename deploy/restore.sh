#!/bin/sh
# Restaura un backup (pg_dump -Fc) REEMPLAZANDO los datos actuales.
# Uso (desde deploy/):  sh restore.sh backups/ARCHIVO.dump
set -e

DUMP="$1"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Uso: $0 backups/ARCHIVO.dump" >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"
DB="${POSTGRES_DB:-fraguago}"
psql_admin() { $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }

printf 'Esto reemplaza TODOS los datos de "%s" con %s. ¿Continuar? [s/N] ' "$DB" "$DUMP"
read -r answer
[ "$answer" = "s" ] || [ "$answer" = "S" ] || { echo "Cancelado."; exit 1; }

$COMPOSE stop api

# Las tablas tienen FORCE ROW LEVEL SECURITY: el dueño (fraguago) no podría
# insertar filas de todos los gimnasios sin BYPASSRLS durante la restauración.
psql_admin -c 'ALTER ROLE fraguago BYPASSRLS;'
restore_status=0
$COMPOSE exec -T postgres pg_restore -U postgres -d "$DB" \
  --clean --if-exists --no-owner --role=fraguago --exit-on-error < "$DUMP" || restore_status=$?
psql_admin -c 'ALTER ROLE fraguago NOBYPASSRLS;'

$COMPOSE start api

if [ "$restore_status" -ne 0 ]; then
  echo "pg_restore terminó con errores (código $restore_status). Revisa la salida de arriba." >&2
  exit "$restore_status"
fi
echo "Restauración completada."
