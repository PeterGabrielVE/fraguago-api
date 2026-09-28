-- Paso 1 — ejecutar en el SQL Editor de Neon (rol neondb_owner, base neondb).
-- Reemplaza CAMBIA_ESTA_CLAVE por una clave larga (openssl rand -hex 24).
--
-- "fraguago" se crea por SQL A PROPÓSITO: así NO pertenece a neon_superuser y
-- NO puede saltarse el RLS. Es el rol del API y el dueño de las tablas.
CREATE ROLE fraguago LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';
GRANT CONNECT ON DATABASE neondb TO fraguago;
GRANT USAGE, CREATE ON SCHEMA public TO fraguago;

-- fraguago_auth (creado desde la consola) necesita usar el esquema.
GRANT USAGE ON SCHEMA public TO fraguago_auth;

-- Verificación: fraguago_auth debe tener BYPASSRLS = t y fraguago = f.
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('fraguago', 'fraguago_auth');
