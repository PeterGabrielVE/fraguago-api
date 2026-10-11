-- Roles múltiples por usuario: al iniciar sesión elige con cuál entrar.
ALTER TABLE "User" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];

-- Los usuarios existentes conservan su único rol.
UPDATE "User" SET "roles" = ARRAY["role"];
