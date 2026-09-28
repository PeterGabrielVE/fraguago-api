-- Paso 2 — ejecutar CONECTADO COMO fraguago (no como neondb_owner), antes del
-- primer deploy. Las migraciones crean las tablas como fraguago; esto da a
-- fraguago_auth acceso a todas, incluidas las de migraciones futuras.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO fraguago_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO fraguago_auth;
