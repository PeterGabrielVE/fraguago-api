#!/bin/sh
# Solo corre la primera vez que se crea el volumen de Postgres.
# Replica los roles de desarrollo:
#   fraguago       -> dueño de las tablas, usado por el API (RLS forzado)
#   fraguago_auth  -> BYPASSRLS, solo para login/registro/jobs de sistema
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE fraguago LOGIN PASSWORD '${APP_DB_PASSWORD}';
CREATE ROLE fraguago_auth LOGIN BYPASSRLS PASSWORD '${AUTH_DB_PASSWORD}';

ALTER DATABASE "${POSTGRES_DB}" OWNER TO fraguago;
ALTER SCHEMA public OWNER TO fraguago;
GRANT USAGE, CREATE ON SCHEMA public TO fraguago_auth;

-- Las tablas las crean las migraciones (como fraguago); fraguago_auth
-- necesita acceso a todas, incluidas las de migraciones futuras.
ALTER DEFAULT PRIVILEGES FOR ROLE fraguago IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO fraguago_auth;
ALTER DEFAULT PRIVILEGES FOR ROLE fraguago IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO fraguago_auth;
EOSQL
