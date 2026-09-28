# Despliegue gratuito con servicios gestionados

| Pieza | Servicio |
|---|---|
| Web (Next.js) | **Vercel** |
| API (NestJS) | **Render** (web service free) |
| Postgres | **Neon** (free) |
| Redis | No hace falta con una sola instancia del API |

La web en Vercel hace de **proxy** de `/api/*` hacia Render (`API_PROXY_URL`). El navegador ve un solo dominio, así que la cookie de sesión funciona sin problemas de cookies entre dominios.

## Límites a tener en cuenta

- **Render free se duerme** tras 15 min sin tráfico y tarda ~1 min en despertar. El paso 5 lo evita con un ping.
- **Render free bloquea los puertos SMTP 25/465/587.** Para enviar correos usa el puerto **2525** (Brevo, Mailgun y SendGrid lo soportan).
- **Neon free tiene 0.5 GB.** Las fotos de comprobantes de pago se guardan en la base, así que vigila el espacio.
- **Vercel Hobby es para uso no comercial.** Si cobras a gimnasios, corresponde el plan Pro.
- **Los streams en tiempo real pueden cortarse** al pasar por el proxy de Vercel. Si pasa, la web cae a actualizar cada 15 s, así que el aforo y los retos siguen funcionando.
- Los límites cambian; revisa las páginas de precios de cada servicio.

---

## 1. Neon (Postgres)

1. Crea una cuenta en <https://neon.tech> y un **proyecto** nuevo.
   - Región: **AWS US West 2 (Oregon)**, la misma que Render en `render.yaml`.
   - Postgres 16 o superior.
2. **Crea el rol `fraguago_auth` desde la consola**: *Branches → main → Roles & Databases → Add role*.
   - Tiene que ser desde la consola, porque así recibe `BYPASSRLS`, que lo necesita para login y registro.
   - Guarda la contraseña que te muestra.
3. Abre el **SQL Editor** (rol `neondb_owner`, base `neondb`) y ejecuta [`neon/1-como-neondb_owner.sql`](neon/1-como-neondb_owner.sql), cambiando `CAMBIA_ESTA_CLAVE` por una clave larga.
   - Crea el rol `fraguago`, que es el del API: solo ve los datos de su gimnasio y es el dueño de las tablas.
   - La consulta final debe mostrar **`fraguago_auth | t`** y **`fraguago | f`**. Si `fraguago_auth` sale `f`, detente: el login no funcionaría.
4. En *Dashboard → Connect*, **desactiva "Connection pooling"** y copia el host directo (el que **no** tiene `-pooler`). Arma las dos URLs:

   ```
   DATABASE_URL=postgresql://fraguago:CLAVE_FRAGUAGO@HOST_DIRECTO/neondb?sslmode=require
   AUTH_DATABASE_URL=postgresql://fraguago_auth:CLAVE_AUTH@HOST_DIRECTO/neondb?sslmode=require
   ```

5. Ejecuta [`neon/2-como-fraguago.sql`](neon/2-como-fraguago.sql) **conectado como `fraguago`**. Con Docker, desde la carpeta `fraguago-api`:

   ```bash
   docker run --rm -i postgres:16-alpine psql "PEGA_AQUI_DATABASE_URL" < deploy/neon/2-como-fraguago.sql
   ```

## 2. Render (API)

1. Sube a GitHub los cambios del API, incluido `render.yaml`.
2. En <https://dashboard.render.com> ve a **New → Blueprint**, conecta el repo `fraguago-api` y elige la rama.
3. Render lee [`render.yaml`](../render.yaml) y te pide las variables marcadas como secretas:
   - `DATABASE_URL` y `AUTH_DATABASE_URL`: las del paso 1.4.
   - `FRONTEND_URL`: por ahora pon `https://example.com`; la corriges en el paso 4.
   - Opcionales (SMTP, Gemini, PostHog, WhatsApp): déjalos vacíos si no los usas.
   - `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` se generan solos.
4. Espera el deploy. Al arrancar aplica las migraciones y crea todas las tablas en Neon.
5. Comprueba que responde (cambia `fraguago-api` por el nombre que te asignó Render):

   ```bash
   curl https://fraguago-api.onrender.com/api/health
   # {"status":"ok",...}
   ```

## 3. Vercel (web)

1. Sube a GitHub los cambios de la web (`next.config.mjs` con el proxy).
2. En <https://vercel.com/new> importa el repo `fraguago-web`. Detecta Next.js y pnpm solo.
3. En **Environment Variables** agrega:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `/api` |
   | `API_PROXY_URL` | `https://fraguago-api.onrender.com` (tu URL de Render, sin `/api`) |
   | `NEXT_PUBLIC_ENABLE_REGISTRATION` | `false` |

4. Haz el deploy y anota la URL (p. ej. `https://fraguago.vercel.app`).

> Estas variables se leen **al construir**. Si las cambias, haz *Redeploy* en Vercel.

## 4. Conectar web y API

En Render ve a **fraguago-api → Environment**, cambia `FRONTEND_URL` por la URL de Vercel y guarda. Render se redesplegará solo.

## 5. Mantener despierto el API

1. En <https://cron-job.org>, que es gratis, crea un job que haga `GET` cada **10 minutos** a:

   ```
   https://fraguago-api.onrender.com/api/health
   ```

2. Render da 750 h gratis al mes, suficientes para un servicio encendido todo el mes.
3. Así también corre el job diario de retención (mensajes automáticos) a las 9:00.

## 6. Crear el primer gimnasio

El registro en la web está desactivado. Créalo con:

```bash
curl -X POST https://fraguago.vercel.app/api/auth/register-gym \
  -H 'Content-Type: application/json' \
  -d '{"gymName":"Mi Gym","ownerName":"Nombre Apellido","ownerEmail":"tu@correo.com","ownerPassword":"UnaClaveSegura123"}'
```

Luego entra en `https://fraguago.vercel.app/login`.

- Si falla con un error de *row-level security*, el rol `fraguago_auth` no tiene `BYPASSRLS`: revisa el paso 1.3.
- ⚠️ Este endpoint es público: cualquiera que lo conozca puede crear gimnasios.

## Backups

Neon guarda un historial corto para restaurar, pero conviene hacer copias propias:

```bash
docker run --rm postgres:16-alpine pg_dump -Fc "PEGA_AQUI_AUTH_DATABASE_URL" > fraguago-$(date +%F).dump
```

- Usa `AUTH_DATABASE_URL`, porque con `DATABASE_URL` el RLS dejaría el backup sin datos.
- La imagen debe ser de la **misma versión mayor** que tu proyecto Neon, o una más nueva: `postgres:17-alpine` si el proyecto es Postgres 17.

## Actualizar

- Haz push a la rama conectada: Render y Vercel redesplegan solos.
- Las migraciones nuevas se aplican al arrancar el API.
