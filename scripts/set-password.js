// =====================================================================
// Cambiar la contraseña de un usuario
// =====================================================================
//
// Uso (desde fraguago-api/):
//   node scripts/set-password.js <email> [nueva-clave]
//
// Sin clave genera una aleatoria segura y la muestra UNA vez. Revoca todos
// los refresh tokens del usuario (cierra sus sesiones abiertas).
//
// Conexión: AUTH_DATABASE_URL de deploy/.env (o ENV_FILE=ruta/.env).
// =====================================================================

const path = require("path");
const { randomBytes } = require("crypto");
require("dotenv").config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE || "deploy/.env") });
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const [email, given] = process.argv.slice(2);
if (!email) {
  console.error("Uso: node scripts/set-password.js <email> [nueva-clave]");
  process.exit(1);
}
const password = given || randomBytes(12).toString("base64url");
if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
  console.error("La clave debe tener entre 8 caracteres y 72 bytes.");
  process.exit(1);
}

// "postgresql:postgresql://..." → "postgresql://..." (typo frecuente en el .env)
const url = (process.env.AUTH_DATABASE_URL || "").replace(/^postgresql:(?=postgres(ql)?:\/\/)/, "");
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("AUTH_DATABASE_URL no está definida o no es válida.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const users = await prisma.user.findMany({ where: { email }, include: { gym: { select: { name: true } } } });
  if (users.length === 0) {
    console.error(`No existe ningún usuario ${email}.`);
    process.exit(1);
  }
  if (users.length > 1) {
    console.error(`Hay ${users.length} usuarios con el email ${email}; resuélvelo a mano:`);
    for (const u of users) console.error(`  - ${u.id} en "${u.gym.name}" (${u.role})`);
    process.exit(1);
  }
  const [user] = users;
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
  ]);
  console.log(`Contraseña actualizada para ${email} (${user.role} en "${user.gym.name}").`);
  if (!given) console.log(`Nueva clave: ${password}\nGuárdala ahora: no se vuelve a mostrar.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
