# Despliegue en Oracle Cloud (Always Free)

Todo FraguaGo corre en una sola VM gratuita con Docker Compose:

```
Internet ──443──> Caddy (HTTPS automático)
                    ├── /api/*  → api (NestJS)  ──> postgres, redis
                    └── resto   → web (Next.js)
                  backup (pg_dump diario → deploy/backups/)
```

Web y API comparten dominio, así que no hay problemas de CORS ni de cookies entre dominios.

---

## 1. Crear la VM

1. Crea una cuenta en <https://cloud.oracle.com>. Pide tarjeta para verificar, pero no cobra dentro de los límites Always Free.
   - Elige bien la **Home Region**: no se puede cambiar, y los recursos gratis solo existen ahí.
2. Ve a **Compute → Instances → Create instance**:
   - **Image**: Canonical Ubuntu 24.04 (la versión *aarch64*).
   - **Shape**: `VM.Standard.A1.Flex` (Ampere ARM), con **4 OCPU y 24 GB de RAM**, el máximo gratis.
     - Si sale *"Out of capacity"*, reintenta más tarde o prueba otro *Availability Domain*.
   - **Networking**: VCN nueva con subred pública y *Assign a public IPv4 address*.
   - **SSH keys**: sube tu clave pública, o descarga la que genera Oracle.
   - **Boot volume**: 50–100 GB (el límite gratis total es 200 GB).
3. Anota la **IP pública** de la instancia.

> ⚠️ Oracle puede reclamar instancias Always Free que considere "inactivas" (uso de CPU muy bajo durante 7 días).
> Para evitarlo, pasa la cuenta a **Pay As You Go**. Lo que esté dentro de los límites Always Free sigue siendo gratis, pero pon una alerta de presupuesto por si acaso.

## 2. Abrir los puertos 80 y 443

Hay que abrirlos en **dos lugares**:

**a) En Oracle Cloud:** ve a *Networking → Virtual Cloud Networks → tu VCN → Security Lists → Default Security List → Add Ingress Rules*:

| Source CIDR | Protocolo | Puerto destino |
|---|---|---|
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |
| 0.0.0.0/0 | UDP | 443 (HTTP/3, opcional) |

**b) Dentro de la VM:** las imágenes Ubuntu de Oracle traen iptables bloqueando todo menos SSH.

```bash
ssh ubuntu@TU_IP
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Dominio

Caddy necesita un dominio para obtener el certificado HTTPS.

- **Con dominio propio**: crea un registro **A** (p. ej. `fraguago.tudominio.com`) apuntando a la IP de la VM.
- **Gratis**: usa un subdominio de <https://www.duckdns.org>, por ejemplo `fraguago.duckdns.org`, y apúntalo a la IP.

Comprueba que el dominio ya apunta a la VM antes de seguir:

```bash
ping fraguago.tudominio.com
```

## 4. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # vuelve a entrar por SSH para que tome el grupo docker
```

## 5. Código y configuración

```bash
mkdir -p ~/fraguago && cd ~/fraguago
git clone https://github.com/PeterGabrielVE/fraguago-api.git
git clone https://github.com/PeterGabrielVE/fraguago-web.git

cd fraguago-api/deploy
cp .env.example .env
nano .env
```

En `.env`, completa:

- `DOMAIN`.
- Cada contraseña y secreto. Genera uno distinto para cada campo con:

  ```bash
  openssl rand -hex 32
  ```

- Los opcionales (SMTP, WhatsApp, Gemini, PostHog), si los usas.

> `deploy/.env` está en `.gitignore` y en `.dockerignore`: nunca se sube al repo ni entra en las imágenes.

## 6. Levantar todo

```bash
cd ~/fraguago/fraguago-api/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

- El primer build tarda varios minutos.
- Al arrancar, el API aplica las migraciones pendientes (`prisma migrate deploy`).
- Caddy obtiene el certificado HTTPS solo.

Revisa que todo esté bien:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api caddy
```

Abre `https://TU_DOMINIO`.

## 7. Crear el primer gimnasio

El registro en la web está desactivado (`NEXT_PUBLIC_ENABLE_REGISTRATION=false`). Crea el gimnasio y su dueño con:

```bash
curl -X POST https://TU_DOMINIO/api/auth/register-gym \
  -H 'Content-Type: application/json' \
  -d '{"gymName":"Mi Gym","ownerName":"Nombre Apellido","ownerEmail":"tu@correo.com","ownerPassword":"UnaClaveSegura123"}'
```

> ⚠️ El endpoint `POST /api/auth/register-gym` es público aunque la web oculte el registro. Cualquiera que lo conozca puede crear gimnasios.
> Si no quieres registro abierto, conviene protegerlo en el API (por ejemplo, con un token de invitación).

## Operación

### Actualizar a una nueva versión

```bash
cd ~/fraguago/fraguago-web && git pull
cd ~/fraguago/fraguago-api && git pull
cd deploy && docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f   # limpia imágenes viejas
```

### Backups

- El servicio `backup` hace un `pg_dump` al arrancar y luego cada 24 h.
- Los guarda en `deploy/backups/` y conserva los últimos `BACKUP_KEEP_DAYS` días.
- **Cópialos fuera de la VM** de vez en cuando: si se pierde la VM, se pierden con ella. Puedes usar Oracle Object Storage (20 GB gratis) o descargarlos con `scp`:

  ```bash
  scp ubuntu@TU_IP:~/fraguago/fraguago-api/deploy/backups/*.dump .
  ```

Para restaurar un backup (**reemplaza los datos actuales**):

```bash
cd ~/fraguago/fraguago-api/deploy
sh restore.sh backups/ARCHIVO.dump
```

El script `restore.sh` hace lo siguiente:

1. Detiene el API.
2. Da BYPASSRLS temporal al rol `fraguago`, porque las tablas tienen RLS forzado.
3. Restaura con `fraguago` como dueño.
4. Quita el permiso y vuelve a arrancar el API.

### Llevar los datos de tu PC al servidor (opcional)

**En tu PC:**

```bash
docker exec fraguago-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > local.dump
scp local.dump ubuntu@TU_IP:~/fraguago/fraguago-api/deploy/backups/
```

**En el servidor:** usa el comando de restaurar de arriba con `ARCHIVO.dump` = `local.dump`.

### Logs y consola

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d fraguago
```

### Si cambias `DOMAIN`

La URL del API se incrusta en la web al construirla. Después de cambiar `DOMAIN`, reconstruye:

```bash
docker compose -f docker-compose.prod.yml up -d --build web api
```
