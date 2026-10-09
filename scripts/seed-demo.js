// =====================================================================
// Seed del gimnasio DEMO
// =====================================================================
//
// Crea (o regenera) el gym "Gym Demo" con datos 100% ficticios y mueve a él
// la cuenta demo, para que al entrar con esas credenciales NO se vean los
// datos de un gym real.
//
// Uso (desde fraguago-api/):
//   npm run seed:demo                         → demo@fraguago.com / demo123
//   node scripts/seed-demo.js <email-demo> [password]
//
//   - Si el usuario ya existe (en cualquier gym) se MUEVE al gym demo y
//     conserva su contraseña (salvo que se pase una nueva).
//   - Si no existe se crea como OWNER; en ese caso el password es obligatorio.
//   - Es idempotente: cada ejecución borra los datos del gym demo (excepto la
//     cuenta demo) y los vuelve a generar con fechas relativas a hoy.
//
// Conexión: usa AUTH_DATABASE_URL (rol fraguago_auth, BYPASSRLS) de
// deploy/.env, o de la variable de entorno si ya está definida.
// Para otro archivo: ENV_FILE=ruta/.env node scripts/seed-demo.js ...
// =====================================================================

const path = require("path");
const { randomUUID, randomBytes } = require("crypto");
require("dotenv").config({ path: path.resolve(__dirname, "..", process.env.ENV_FILE || "deploy/.env") });
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const DEMO_GYM = { name: "Gym Demo", slug: "gym-demo" };
// Dominio reservado (.test): nunca choca con emails reales en el login.
const FAKE_DOMAIN = "demo.fraguago.test";

// Por defecto, las credenciales del botón "Usar credenciales de demo" del
// login (fraguago-web/app/login/page.tsx). Si cambian allá, cambiarlas aquí.
const DEFAULT_DEMO = { email: "demo@fraguago.com", password: "demo123" };
const args = process.argv.slice(2);
const email = args[0] || DEFAULT_DEMO.email;
const password = args[0] ? args[1] : DEFAULT_DEMO.password;

// "postgresql:postgresql://..." → "postgresql://..." (typo frecuente en el .env)
const url = (process.env.AUTH_DATABASE_URL || "").replace(/^postgresql:(?=postgres(ql)?:\/\/)/, "");
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("AUTH_DATABASE_URL no está definida o no es válida.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

// ---------------------------------------------------------------------
// Aleatoriedad determinista: mismo resultado en cada ejecución.
// ---------------------------------------------------------------------
let seed = 20261009;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}
const round2 = (n) => Math.round(n * 100) / 100;

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const daysAgo = (n) => new Date(today.getTime() - n * DAY);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const at = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

// ---------------------------------------------------------------------
// Catálogos ficticios
// ---------------------------------------------------------------------
const FIRST = ["Andrea", "Carlos", "Valentina", "José", "María", "Luis", "Gabriela", "Miguel", "Daniela", "Alejandro",
  "Sofía", "Diego", "Camila", "Jesús", "Isabella", "Ricardo", "Mariana", "Fernando", "Paola", "Javier",
  "Lucía", "Andrés", "Natalia", "Eduardo", "Verónica", "Rafael", "Carolina", "Manuel", "Adriana", "Héctor",
  "Patricia", "Óscar", "Elena", "Simón", "Fabiola", "Gustavo", "Rosa", "Kevin", "Yesenia", "Samuel"];
const LAST = ["González", "Rodríguez", "Pérez", "Hernández", "García", "Martínez", "López", "Ramírez", "Torres", "Díaz",
  "Morales", "Rojas", "Castillo", "Mendoza", "Vargas", "Romero", "Suárez", "Medina", "Silva", "Contreras"];
const STREETS = ["Av. Principal de Las Mercedes", "Calle 5, Los Palos Grandes", "Av. Francisco de Miranda", "Urb. El Paraíso",
  "Calle Real de Sabana Grande", "Res. Los Samanes, Torre B", "Av. Bolívar Norte", "Urb. La Trigaleña"];
const RELATIONS = ["Madre", "Padre", "Hermano/a", "Esposo/a", "Pareja", "Amigo/a"];
const PHONE_PREFIX = ["0412", "0414", "0424", "0416", "0426"];
const BANKS = ["Banesco", "Mercantil", "Banco de Venezuela", "Provincial", "BNC"];
const phone = () => `${pick(PHONE_PREFIX)}-${String(int(1000000, 9999999))}`;
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PLANS = [
  { key: "DAILY", name: "Pase diario", type: "DAILY", price: 3, durationDays: 1 },
  { key: "MONTHLY", name: "Mensual", type: "MONTHLY", price: 25, durationDays: 30 },
  { key: "QUARTERLY", name: "Trimestral", type: "QUARTERLY", price: 65, durationDays: 90 },
  { key: "ANNUAL", name: "Anual", type: "ANNUAL", price: 220, durationDays: 365 },
];

const PRODUCTS = [
  { name: "Agua mineral 600ml", price: 1, stock: 120, sku: "BEB-001" },
  { name: "Bebida isotónica", price: 2, stock: 80, sku: "BEB-002" },
  { name: "Barra proteica", price: 2.5, stock: 60, sku: "SUP-001" },
  { name: "Proteína Whey 2lb", price: 45, stock: 12, sku: "SUP-002" },
  { name: "Creatina 300g", price: 30, stock: 10, sku: "SUP-003" },
  { name: "Toalla de microfibra", price: 8, stock: 25, sku: "ACC-001" },
  { name: "Guantes de entrenamiento", price: 15, stock: 14, sku: "ACC-002" },
  { name: "Shaker 700ml", price: 6, stock: 30, sku: "ACC-003" },
];

const EXERCISES = [
  ["Sentadilla con barra", "Piernas", "Barra"], ["Prensa de piernas", "Piernas", "Máquina"],
  ["Peso muerto rumano", "Isquiotibiales", "Barra"], ["Press de banca", "Pecho", "Barra"],
  ["Press inclinado con mancuernas", "Pecho", "Mancuernas"], ["Remo con barra", "Espalda", "Barra"],
  ["Jalón al pecho", "Espalda", "Polea"], ["Press militar", "Hombros", "Barra"],
  ["Elevaciones laterales", "Hombros", "Mancuernas"], ["Curl de bíceps", "Bíceps", "Mancuernas"],
  ["Extensión de tríceps en polea", "Tríceps", "Polea"], ["Plancha abdominal", "Core", "Peso corporal"],
  ["Zancadas", "Piernas", "Mancuernas"], ["Bicicleta estática", "Cardio", "Máquina"],
];

async function main() {
  // -------------------------------------------------------------------
  // 1. Gym demo + cuenta demo
  // -------------------------------------------------------------------
  const existingUsers = await prisma.user.findMany({
    where: { email },
    include: { gym: { select: { name: true, slug: true } }, member: { select: { id: true } }, trainer: { select: { id: true } } },
  });
  if (existingUsers.length > 1) {
    console.error(`Hay ${existingUsers.length} usuarios con el email ${email}:`);
    for (const u of existingUsers) console.error(`  - ${u.id} en "${u.gym.name}" (${u.role})`);
    console.error("Resuélvelo a mano antes de continuar.");
    process.exit(1);
  }
  let demoUser = existingUsers[0];
  if (!demoUser && !password) {
    console.error(`No existe ningún usuario ${email}: pasa un password para crearlo.`);
    process.exit(1);
  }
  if (demoUser && (demoUser.member || demoUser.trainer) && demoUser.gym.slug !== DEMO_GYM.slug) {
    console.error(`El usuario ${email} es socio/entrenador en "${demoUser.gym.name}". No se mueve automáticamente para no tocar datos reales.`);
    process.exit(1);
  }

  let gym = await prisma.gym.findUnique({ where: { slug: DEMO_GYM.slug } });
  if (!gym) {
    gym = await prisma.gym.create({
      data: { name: DEMO_GYM.name, slug: DEMO_GYM.slug, baseCurrency: "USD", maxCapacity: 60, avgVisitMinutes: 90 },
    });
    console.log(`Gym demo creado (${gym.id}).`);
  } else {
    // Seguro: solo se regenera si el gym contiene únicamente cuentas ficticias.
    const realUsers = await prisma.user.count({
      where: { gymId: gym.id, email: { not: email }, NOT: { email: { endsWith: `@${FAKE_DOMAIN}` } } },
    });
    if (realUsers > 0) {
      console.error(`El gym con slug "${DEMO_GYM.slug}" tiene ${realUsers} usuarios que no son de demo. Abortado.`);
      process.exit(1);
    }
    console.log(`Gym demo existente (${gym.id}): se regeneran sus datos.`);
  }
  const gymId = gym.id;

  await wipeGym(gymId, demoUser && demoUser.gymId === gymId ? demoUser.id : null);

  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  if (demoUser) {
    if (demoUser.gymId !== gymId) {
      console.log(`Moviendo ${email} de "${demoUser.gym.name}" al gym demo.`);
    }
    demoUser = await prisma.user.update({
      where: { id: demoUser.id },
      data: { gymId, ...(passwordHash && { passwordHash }) },
    });
    // Cierra sus sesiones: los refresh tokens viejos apuntaban al gym real.
    await prisma.refreshToken.deleteMany({ where: { userId: demoUser.id } });
    const profile = await prisma.profile.findUnique({ where: { userId: demoUser.id } });
    if (profile) await prisma.profile.update({ where: { id: profile.id }, data: { gymId } });
    else await prisma.profile.create({ data: { userId: demoUser.id, gymId, firstName: "Usuario", lastName: "Demo" } });
  } else {
    demoUser = await prisma.user.create({
      data: {
        gymId, email, passwordHash, role: "OWNER",
        profile: { create: { gymId, firstName: "Usuario", lastName: "Demo" } },
      },
    });
    console.log(`Usuario ${email} creado como OWNER.`);
  }

  // Hash inutilizable para las cuentas ficticias (nadie puede entrar con ellas).
  const fakeHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);

  // -------------------------------------------------------------------
  // 2. Configuración del gym
  // -------------------------------------------------------------------
  const plans = PLANS.map((p) => ({ id: randomUUID(), gymId, name: p.name, type: p.type, price: p.price, currency: "USD", durationDays: p.durationDays, createdAt: daysAgo(200) }));
  const planByType = Object.fromEntries(plans.map((p) => [p.type, p]));
  await prisma.membershipPlan.createMany({ data: plans });

  const conceptNames = [
    ["Alquiler", "EXPENSE"], ["Electricidad", "EXPENSE"], ["Agua", "EXPENSE"], ["Internet", "EXPENSE"],
    ["Nómina", "EXPENSE"], ["Mantenimiento de equipos", "EXPENSE"], ["Limpieza", "EXPENSE"], ["Compra de inventario", "EXPENSE"],
    ["Entrenamiento personal", "INCOME"], ["Evaluación física", "INCOME"],
  ];
  const concepts = conceptNames.map(([name, kind]) => ({ id: randomUUID(), gymId, name, kind, createdAt: daysAgo(200) }));
  const conceptBy = Object.fromEntries(concepts.map((c) => [c.name, c]));
  await prisma.concept.createMany({ data: concepts });

  await prisma.service.createMany({
    data: [
      { gymId, name: "Entrenamiento personal (sesión)", price: 15, description: "Sesión 1 a 1 de 60 minutos" },
      { gymId, name: "Evaluación física", price: 10, description: "Medidas, % de grasa y plan inicial" },
      { gymId, name: "Asesoría nutricional", price: 20, description: "Plan de alimentación mensual" },
    ],
  });

  // Tasa VES (Bs por 1 USD), semanal y en alza durante 6 meses.
  const rates = [];
  for (let w = 26; w >= 0; w--) {
    rates.push({ gymId, currency: "VES", rate: round2(190 + (26 - w) * 2.4 + rand() * 1.5), source: "BCV", effectiveAt: daysAgo(w * 7), createdAt: daysAgo(w * 7) });
  }
  await prisma.exchangeRate.createMany({ data: rates });
  const vesRateAt = (d) => {
    let r = rates[0].rate;
    for (const x of rates) if (x.effectiveAt <= d) r = x.rate;
    return r;
  };

  // -------------------------------------------------------------------
  // 3. Personal: entrenadores y recepción
  // -------------------------------------------------------------------
  const users = [];
  const profiles = [];
  const trainers = [];
  const staff = [
    ["Marcos", "Villalobos", "TRAINER", "Fuerza e hipertrofia"],
    ["Daniela", "Ochoa", "TRAINER", "Funcional y HIIT"],
    ["Ricardo", "Salazar", "TRAINER", "Spinning y cardio"],
    ["Karla", "Méndez", "STAFF", null],
  ];
  for (const [firstName, lastName, role, specialty] of staff) {
    const userId = randomUUID();
    users.push({ id: userId, gymId, email: `${strip(firstName)}.${strip(lastName)}@${FAKE_DOMAIN}`, passwordHash: fakeHash, role, createdAt: daysAgo(200) });
    profiles.push({ userId, gymId, firstName, lastName, phone: phone() });
    if (role === "TRAINER") trainers.push({ id: randomUUID(), gymId, userId, specialty, identificationNumber: `V-${int(12000000, 24000000)}`, createdAt: daysAgo(200) });
  }

  // -------------------------------------------------------------------
  // 4. Socios
  // -------------------------------------------------------------------
  const members = [];
  const usedIds = new Set();
  const usedEmails = new Set();
  const N_MEMBERS = 48;
  for (let i = 0; i < N_MEMBERS; i++) {
    const firstName = pick(FIRST);
    const lastName = pick(LAST);
    let mail = `${strip(firstName)}.${strip(lastName)}@${FAKE_DOMAIN}`;
    for (let k = 2; usedEmails.has(mail); k++) mail = `${strip(firstName)}.${strip(lastName)}${k}@${FAKE_DOMAIN}`;
    usedEmails.add(mail);
    let ci;
    do ci = `V-${int(14000000, 32000000)}`; while (usedIds.has(ci));
    usedIds.add(ci);

    const userId = randomUUID();
    const memberId = randomUUID();
    const joinedAt = i < 6 ? daysAgo(int(1, 20)) : daysAgo(int(25, 330));
    const shift = weighted([["MORNING", 4], ["AFTERNOON", 3], ["NIGHT", 3]]);
    users.push({ id: userId, gymId, email: mail, passwordHash: fakeHash, role: "MEMBER", createdAt: joinedAt });
    profiles.push({
      userId, gymId, firstName, lastName, phone: phone(), address: pick(STREETS),
      preferredTime: { MORNING: "6:00 - 9:00", AFTERNOON: "14:00 - 17:00", NIGHT: "18:00 - 21:00" }[shift],
      createdAt: joinedAt,
    });
    members.push({
      id: memberId, gymId, userId, identificationNumber: ci,
      // Los primeros cumplen años este mes (uno hoy) para lucir la campana y el
      // panel de cumpleañeros; el resto, al azar. Medianoche UTC, como la API.
      birthDate: i < 6
        ? new Date(Date.UTC(int(1975, 2005), today.getMonth(), Math.min(28, Math.max(1, today.getDate() + [0, 2, 5, -3, 10, -8][i]))))
        : new Date(Date.UTC(int(1972, 2007), int(0, 11), int(1, 28))),
      activityLevel: weighted([["BEGINNER", 4], ["INTERMEDIATE", 4], ["ADVANCED", 2]]),
      preferredShift: shift,
      primaryGoal: weighted([["MUSCLE_GAIN", 4], ["WEIGHT_LOSS", 4], ["GENERAL_WELLNESS", 3], ["PERFORMANCE_REHABILITATION", 1]]),
      status: "ACTIVE",
      externalId: String(i + 1).padStart(3, "0"),
      joinedAt, createdAt: joinedAt,
      // Auxiliares (no se guardan)
      _name: `${firstName} ${lastName}`,
      _freq: 0.25 + rand() * 0.5,
      _churnAt: chance(0.2) ? daysAgo(int(10, 120)) : null,
    });
  }
  await prisma.user.createMany({ data: users });
  await prisma.profile.createMany({ data: profiles });
  await prisma.trainer.createMany({ data: trainers });

  // -------------------------------------------------------------------
  // 5. Membresías + pagos (últimos 6 meses)
  // -------------------------------------------------------------------
  const memberships = [];
  const transactions = [];
  const historyStart = daysAgo(180);
  let refCounter = 100000;
  const payment = (amountUsd, date, memberId, note, createdById) => {
    const method = weighted([["PAGO_MOVIL", 4], ["CASH", 3], ["ZELLE", 2], ["CARD", 1], ["TRANSFER", 1]]);
    const tx = { id: randomUUID(), gymId, type: "INCOME", memberId, paymentMethod: method, note, date, createdAt: date, createdById, currency: "USD", amount: amountUsd, exchangeRate: 1, amountBase: amountUsd };
    if (method === "PAGO_MOVIL" || method === "TRANSFER") {
      const rate = vesRateAt(date);
      Object.assign(tx, { currency: "VES", exchangeRate: rate, amount: round2(amountUsd * rate), paymentReference: String(++refCounter + int(0, 9) * 1000000), paymentBank: pick(BANKS), payerPhone: phone() });
    } else if (method === "ZELLE") {
      tx.paymentReference = `ZL${++refCounter}`;
    }
    return tx;
  };

  for (const m of members) {
    const planType = weighted([["MONTHLY", 70], ["QUARTERLY", 18], ["ANNUAL", 7], ["DAILY", 5]]);
    const plan = planByType[planType];
    let start = m.joinedAt > historyStart ? m.joinedAt : addDays(historyStart, -int(0, plan.durationDays - 1));
    m._plan = planType;
    m._ranges = [];
    while (start <= today) {
      if (m._churnAt && start > m._churnAt) break;
      const end = addDays(start, plan.durationDays);
      const startAt = at(start, int(7, 19), int(0, 59));
      memberships.push({ id: randomUUID(), gymId, memberId: m.id, planId: plan.id, startDate: startAt, endDate: end, status: "ACTIVE", createdAt: startAt });
      m._ranges.push([start, end]);
      if (start >= historyStart) {
        transactions.push(payment(Number(plan.price), startAt, m.id, `Pago membresía: ${plan.name}`, pick([demoUser.id, users[3].id])));
      }
      // Pase diario: vienen algunas veces sueltas, no renuevan en continuo.
      start = planType === "DAILY" ? addDays(end, int(3, 15)) : end;
    }
    const last = m._ranges[m._ranges.length - 1];
    if (!last || last[1] < daysAgo(45)) m.status = "INACTIVE";
  }
  // Un par de membresías congeladas para mostrar el estado.
  memberships.filter((ms) => ms.endDate > today).slice(0, 2).forEach((ms) => (ms.status = "SUSPENDED"));

  // -------------------------------------------------------------------
  // 6. Asistencias (últimos 60 días) + puntos
  // -------------------------------------------------------------------
  const attendances = [];
  const SHIFT_HOURS = { MORNING: [6, 11], AFTERNOON: [12, 17], NIGHT: [18, 21] };
  const hasMembership = (m, d) => m._ranges.some(([s, e]) => d >= s && d < e);
  for (let n = 60; n >= 0; n--) {
    const d = daysAgo(n);
    if (d.getDay() === 0) continue; // domingo cerrado
    for (const m of members) {
      if (!hasMembership(m, d) || !chance(m._freq)) continue;
      const shift = chance(0.85) ? m.preferredShift : pick(["MORNING", "AFTERNOON", "NIGHT"]);
      const [h0, h1] = SHIFT_HOURS[shift];
      const checkedInAt = at(d, int(h0, h1), int(0, 59));
      if (checkedInAt > now) continue;
      const out = new Date(checkedInAt.getTime() + int(50, 120) * 60000);
      attendances.push({
        id: randomUUID(), gymId, memberId: m.id, checkedInAt, shift, passType: m._plan,
        // Los que entraron hace poco siguen dentro (aforo actual).
        checkedOutAt: out > now ? null : out,
      });
    }
  }

  // Ledger de puntos: 10 por asistencia, bonos por insignia y referidos.
  const badges = [
    { id: randomUUID(), gymId, name: "Primer paso", description: "Tu primera visita al gym", icon: "star", criteria: "ATTENDANCE_COUNT", threshold: 1, pointsReward: 10 },
    { id: randomUUID(), gymId, name: "Constante", description: "10 visitas acumuladas", icon: "flame", criteria: "ATTENDANCE_COUNT", threshold: 10, pointsReward: 30 },
    { id: randomUUID(), gymId, name: "Imparable", description: "30 visitas acumuladas", icon: "trophy", criteria: "ATTENDANCE_COUNT", threshold: 30, pointsReward: 80 },
    { id: randomUUID(), gymId, name: "Leyenda", description: "500 puntos históricos", icon: "crown", criteria: "LIFETIME_POINTS", threshold: 500, pointsReward: 50 },
    { id: randomUUID(), gymId, name: "Socio del mes", description: "Otorgada por el staff", icon: "medal", criteria: "MANUAL", threshold: null, pointsReward: 100 },
  ];
  const events = new Map(members.map((m) => [m.id, []]));
  for (const a of attendances) events.get(a.memberId).push({ at: a.checkedInAt, points: 10, source: "ATTENDANCE", reason: "Asistencia", referenceId: a.id });

  const memberBadges = [];
  for (const m of members) {
    const visits = events.get(m.id).slice().sort((x, y) => x.at - y.at);
    for (const b of badges.filter((b) => b.criteria === "ATTENDANCE_COUNT")) {
      if (visits.length >= b.threshold) {
        const awardedAt = visits[b.threshold - 1].at;
        const mb = { id: randomUUID(), gymId, memberId: m.id, badgeId: b.id, awardedAt, seenAt: chance(0.8) ? awardedAt : null };
        memberBadges.push(mb);
        events.get(m.id).push({ at: new Date(awardedAt.getTime() + 1000), points: b.pointsReward, source: "BADGE", reason: `Insignia: ${b.name}`, referenceId: mb.id });
      }
    }
  }
  // "Socio del mes" a los dos que más vinieron.
  const top = members.slice().sort((a, b) => events.get(b.id).length - events.get(a.id).length).slice(0, 2);
  for (const m of top) {
    const b = badges[4];
    const mb = { id: randomUUID(), gymId, memberId: m.id, badgeId: b.id, awardedAt: daysAgo(int(2, 8)), seenAt: null };
    memberBadges.push(mb);
    events.get(m.id).push({ at: mb.awardedAt, points: b.pointsReward, source: "BADGE", reason: `Insignia: ${b.name}`, referenceId: mb.id, createdById: demoUser.id });
  }

  // Referidos: socios recientes que llegaron por otro socio.
  const referrals = [];
  const recent = members.filter((m) => m.joinedAt > daysAgo(90)).slice(0, 4);
  const veterans = members.filter((m) => m.joinedAt < daysAgo(120) && m.status === "ACTIVE");
  recent.forEach((referred, i) => {
    const referrer = veterans[i % veterans.length];
    if (!referrer || referrer.id === referred.id) return;
    referrer.referralCode = referrer.referralCode || `${strip(referrer._name.split(" ")[0]).toUpperCase().slice(0, 5)}${int(10, 99)}`;
    const rewarded = referred._ranges.length > 0 && i < 3;
    const rewardedAt = rewarded ? at(referred._ranges[0][0], 12) : null;
    referrals.push({ id: randomUUID(), gymId, referrerId: referrer.id, referredId: referred.id, code: referrer.referralCode, status: rewarded ? "REWARDED" : "PENDING", referrerPoints: rewarded ? 100 : 0, referredPoints: rewarded ? 50 : 0, rewardedAt, createdById: users[3].id, createdAt: referred.joinedAt });
    if (rewarded) {
      events.get(referrer.id).push({ at: rewardedAt, points: 100, source: "REFERRAL", reason: `Referido: ${referred._name}` });
      events.get(referred.id).push({ at: rewardedAt, points: 50, source: "REFERRAL", reason: "Bienvenida por referido" });
    }
  });

  // Recompensas y canjes.
  const rewards = [
    { id: randomUUID(), gymId, name: "Batido de proteína gratis", type: "PRODUCT", pointsCost: 150, stock: 40, description: "Retíralo en recepción" },
    { id: randomUUID(), gymId, name: "10% de descuento en tu próxima mensualidad", type: "DISCOUNT_PERCENT", value: 10, pointsCost: 300 },
    { id: randomUUID(), gymId, name: "Sesión con entrenador personal", type: "SERVICE", pointsCost: 500, minLifetimePoints: 400 },
    { id: randomUUID(), gymId, name: "Toalla FraguaGo", type: "PRODUCT", pointsCost: 250, stock: 10 },
  ];
  const redemptions = [];
  for (const m of members) {
    const ev = events.get(m.id);
    const when = daysAgo(int(1, 15));
    // Solo puede canjear lo que ya tenía acumulado en esa fecha.
    const earned = ev.filter((e) => e.at < when).reduce((s, e) => s + e.points, 0);
    const reward = earned >= 500 && chance(0.5) ? rewards[1] : earned >= 250 && chance(0.4) ? rewards[0] : null;
    if (!reward) continue;
    const status = chance(0.6) ? "FULFILLED" : "PENDING";
    const r = { id: randomUUID(), gymId, memberId: m.id, rewardId: reward.id, pointsSpent: reward.pointsCost, code: randomBytes(4).toString("hex").toUpperCase(), status, createdAt: when, resolvedAt: status === "FULFILLED" ? addDays(when, 1) : null, resolvedById: status === "FULFILLED" ? users[3].id : null };
    redemptions.push(r);
    ev.push({ at: when, points: -reward.pointsCost, source: "REDEMPTION", reason: `Canje: ${reward.name}`, referenceId: r.id });
  }

  const pointsTx = [];
  for (const m of members) {
    let balance = 0;
    let lifetime = 0;
    for (const e of events.get(m.id).sort((x, y) => x.at - y.at)) {
      balance += e.points;
      if (e.points > 0) lifetime += e.points;
      pointsTx.push({ gymId, memberId: m.id, points: e.points, balanceAfter: balance, source: e.source, reason: e.reason, referenceId: e.referenceId || null, createdById: e.createdById || null, createdAt: e.at });
    }
    m.pointsBalance = balance;
    m.lifetimePoints = lifetime;
  }

  // Guarda socios (sin campos auxiliares) y lo que depende de ellos.
  await prisma.member.createMany({
    data: members.map(({ _name, _freq, _churnAt, _plan, _ranges, ...m }) => m),
  });
  await prisma.emergencyContact.createMany({
    data: members.map((m) => ({ gymId, memberId: m.id, name: `${pick(FIRST)} ${m._name.split(" ")[1]}`, phone: phone(), relationship: pick(RELATIONS) })),
  });
  await prisma.medicalProfile.createMany({
    data: members.map((m) => {
      const hasInjury = chance(0.15);
      const takesMedication = chance(0.12);
      return {
        gymId, memberId: m.id,
        hypertension: chance(0.08), diabetes: chance(0.05), heartProblems: chance(0.02), asthma: chance(0.07),
        hasInjury, injuryDescription: hasInjury ? pick(["Lesión de rodilla (menisco)", "Dolor lumbar crónico", "Tendinitis en hombro derecho"]) : null,
        takesMedication, medicationDescription: takesMedication ? pick(["Losartán 50mg", "Metformina", "Salbutamol (inhalador)"]) : null,
      };
    }),
  });
  await prisma.membership.createMany({ data: memberships });
  await prisma.attendance.createMany({ data: attendances });

  await prisma.tier.createMany({
    data: [
      { gymId, name: "Bronce", minPoints: 0, color: "#CD7F32", benefits: "Acceso a retos mensuales" },
      { gymId, name: "Plata", minPoints: 300, color: "#C0C0C0", benefits: "5% en tienda" },
      { gymId, name: "Oro", minPoints: 700, color: "#FFD700", benefits: "10% en tienda y evaluación física gratis" },
      { gymId, name: "Platino", minPoints: 1200, color: "#E5E4E2", benefits: "Sesión mensual con entrenador" },
    ],
  });
  await prisma.badge.createMany({ data: badges });
  await prisma.memberBadge.createMany({ data: memberBadges });
  await prisma.reward.createMany({ data: rewards });
  await prisma.rewardRedemption.createMany({ data: redemptions });
  await prisma.referral.createMany({ data: referrals });
  await prisma.pointsTransaction.createMany({ data: pointsTx });

  // -------------------------------------------------------------------
  // 7. Tienda: productos, ventas y movimientos de stock
  // -------------------------------------------------------------------
  const products = PRODUCTS.map((p) => ({ id: randomUUID(), gymId, ...p, currency: "USD", createdAt: daysAgo(90), _stock: p.stock + 0 }));
  const stockMoves = products.map((p) => ({ gymId, productId: p.id, change: p.stock, resultingStock: p.stock, reason: "Inventario inicial", createdById: demoUser.id, createdAt: daysAgo(90) }));
  const sales = [];
  const saleItems = [];
  for (let n = 45; n >= 0; n--) {
    const d = daysAgo(n);
    if (d.getDay() === 0) continue;
    for (let s = int(0, 3); s > 0; s--) {
      const soldAt = at(d, int(7, 21), int(0, 59));
      if (soldAt > now) continue;
      const lines = [];
      for (const p of [pick(products), ...(chance(0.3) ? [pick(products)] : [])]) {
        if (lines.some((l) => l.p === p) || p._stock < 1) continue;
        const qty = p.price < 5 ? int(1, 3) : 1;
        if (p._stock < qty) continue;
        lines.push({ p, qty });
      }
      if (!lines.length) continue;
      const saleId = randomUUID();
      const total = round2(lines.reduce((t, l) => t + l.qty * l.p.price, 0));
      const buyer = chance(0.7) ? pick(members).id : null;
      const tx = payment(total, soldAt, buyer, `Venta POS ${saleId}`, users[3].id);
      sales.push({ id: saleId, gymId, memberId: buyer, total, currency: "USD", paymentMethod: tx.paymentMethod, createdById: users[3].id, soldAt, createdAt: soldAt });
      for (const l of lines) {
        l.p._stock -= l.qty;
        saleItems.push({ gymId, saleId, productId: l.p.id, quantity: l.qty, unitPrice: l.p.price, subtotal: round2(l.qty * l.p.price) });
        stockMoves.push({ gymId, productId: l.p.id, change: -l.qty, resultingStock: l.p._stock, reason: `Venta ${saleId}`, createdById: users[3].id, createdAt: soldAt });
      }
      transactions.push({ ...tx, saleId });
    }
  }
  // Reposición de un producto que se agotó / quedó bajo.
  for (const p of products.filter((p) => p._stock < 8)) {
    const qty = 24;
    p._stock += qty;
    stockMoves.push({ gymId, productId: p.id, change: qty, resultingStock: p._stock, reason: "Reposición proveedor", createdById: demoUser.id, createdAt: daysAgo(3) });
  }
  await prisma.product.createMany({ data: products.map(({ _stock, ...p }) => ({ ...p, stock: _stock })) });
  await prisma.sale.createMany({ data: sales });
  await prisma.saleItem.createMany({ data: saleItems });
  await prisma.stockMovement.createMany({ data: stockMoves });

  // -------------------------------------------------------------------
  // 8. Gastos fijos y otros ingresos
  // -------------------------------------------------------------------
  const expense = (concept, amount, date, note) => ({
    id: randomUUID(), gymId, type: "EXPENSE", conceptId: conceptBy[concept].id, amount, currency: "USD", exchangeRate: 1, amountBase: amount,
    paymentMethod: pick(["TRANSFER", "ZELLE", "CASH"]), note, date, createdAt: date, createdById: demoUser.id,
  });
  for (let mth = 5; mth >= 0; mth--) {
    const first = new Date(today.getFullYear(), today.getMonth() - mth, 1);
    const on = (day) => new Date(first.getFullYear(), first.getMonth(), day, 10);
    const push = (t) => t.date <= now && transactions.push(t);
    push(expense("Alquiler", 450, on(1), "Alquiler del local"));
    push(expense("Nómina", 1200, on(15), "Nómina quincenal entrenadores y recepción"));
    push(expense("Nómina", 1200, on(28), "Nómina quincenal entrenadores y recepción"));
    push(expense("Electricidad", round2(70 + rand() * 30), on(5), "Factura Corpoelec"));
    push(expense("Agua", round2(15 + rand() * 10), on(6), "Factura Hidrocapital"));
    push(expense("Internet", 35, on(8), "Plan fibra 300 Mbps"));
    push(expense("Limpieza", round2(40 + rand() * 20), on(12), "Insumos de limpieza"));
    if (chance(0.6)) push(expense("Mantenimiento de equipos", round2(60 + rand() * 140), on(int(16, 26)), pick(["Cambio de cable de polea", "Mantenimiento de caminadoras", "Tapizado de bancos"])));
    if (chance(0.5)) push(expense("Compra de inventario", round2(150 + rand() * 200), on(int(2, 20)), "Pedido de suplementos y bebidas"));
    for (let k = int(2, 5); k > 0; k--) {
      const tx = payment(15, on(int(1, 27)), pick(members).id, "Entrenamiento personal", demoUser.id);
      if (tx.date <= now) transactions.push({ ...tx, conceptId: conceptBy["Entrenamiento personal"].id });
    }
  }
  await prisma.transaction.createMany({ data: transactions });

  // -------------------------------------------------------------------
  // 9. Horarios, rutinas, medidas y retos
  // -------------------------------------------------------------------
  const [tFuerza, tFuncional, tSpinning] = trainers;
  const schedules = [];
  for (const wd of [1, 3, 5]) schedules.push({ gymId, trainerId: tSpinning.id, title: "Spinning", weekday: wd, startTime: "07:00", endTime: "08:00", capacity: 15 });
  for (const wd of [2, 4]) schedules.push({ gymId, trainerId: tFuncional.id, title: "Funcional HIIT", weekday: wd, startTime: "18:30", endTime: "19:30", capacity: 20 });
  for (const wd of [1, 3]) schedules.push({ gymId, trainerId: tFuncional.id, title: "Yoga & movilidad", weekday: wd, startTime: "19:30", endTime: "20:30", capacity: 12 });
  for (const wd of [2, 4, 6]) schedules.push({ gymId, trainerId: tFuerza.id, title: "Clínica de fuerza", weekday: wd, startTime: "09:00", endTime: "10:00", capacity: 8 });
  await prisma.schedule.createMany({ data: schedules });

  const exercises = EXERCISES.map(([name, muscleGroup, equipment]) => ({ id: randomUUID(), gymId, name, muscleGroup, equipment, createdAt: daysAgo(150) }));
  const ex = Object.fromEntries(exercises.map((e) => [e.name, e]));
  await prisma.exercise.createMany({ data: exercises });

  const TEMPLATES = {
    MUSCLE_GAIN: { name: "Hipertrofia 3 días", days: [
      ["Press de banca", "Press inclinado con mancuernas", "Extensión de tríceps en polea"],
      ["Remo con barra", "Jalón al pecho", "Curl de bíceps"],
      ["Sentadilla con barra", "Prensa de piernas", "Peso muerto rumano"]] },
    WEIGHT_LOSS: { name: "Quema de grasa full body", days: [
      ["Bicicleta estática", "Zancadas", "Plancha abdominal"],
      ["Bicicleta estática", "Jalón al pecho", "Press militar"]] },
    GENERAL_WELLNESS: { name: "Acondicionamiento general", days: [
      ["Prensa de piernas", "Jalón al pecho", "Plancha abdominal"],
      ["Zancadas", "Elevaciones laterales", "Bicicleta estática"]] },
    PERFORMANCE_REHABILITATION: { name: "Readaptación y movilidad", days: [
      ["Bicicleta estática", "Plancha abdominal", "Elevaciones laterales"]] },
  };
  const routines = [];
  const routineExercises = [];
  const routineLogs = [];
  for (const m of members.filter((m) => m.status === "ACTIVE").slice(0, 16)) {
    const t = TEMPLATES[m.primaryGoal];
    const routineId = randomUUID();
    const createdAt = daysAgo(int(20, 60));
    routines.push({ id: routineId, gymId, memberId: m.id, trainerId: pick(trainers).id, name: t.name, description: `Rutina para ${m._name.split(" ")[0]}`, createdAt });
    t.days.forEach((names, di) => names.forEach((n, oi) => routineExercises.push({
      gymId, routineId, exerciseId: ex[n].id, day: di + 1, order: oi, sets: n === "Bicicleta estática" ? 1 : int(3, 4),
      reps: n === "Bicicleta estática" ? "20 min" : n === "Plancha abdominal" ? "45s" : pick(["8-10", "10-12", "12-15"]), restSeconds: pick([60, 90, 120]),
    })));
    const visits = attendances.filter((a) => a.memberId === m.id && a.checkedInAt > createdAt);
    for (const a of visits) if (chance(0.6)) routineLogs.push({ gymId, memberId: m.id, routineId, completedAt: new Date(a.checkedInAt.getTime() + 55 * 60000) });
  }
  await prisma.routine.createMany({ data: routines });
  await prisma.routineExercise.createMany({ data: routineExercises });
  await prisma.routineLog.createMany({ data: routineLogs });

  const measurements = [];
  for (const m of members.filter((m) => m.joinedAt < daysAgo(90)).slice(0, 18)) {
    const height = int(155, 188);
    let weight = int(58, 98) + rand();
    let fat = 18 + rand() * 14;
    const trend = m.primaryGoal === "WEIGHT_LOSS" ? -1.6 : m.primaryGoal === "MUSCLE_GAIN" ? 0.7 : -0.4;
    for (let k = 3; k >= 0; k--) {
      measurements.push({
        gymId, memberId: m.id, date: daysAgo(k * 30 + int(0, 4)), heightCm: height, weightKg: round2(weight), bodyFat: round2(fat),
        chestCm: round2(weight * 1.1 + 10), waistCm: round2(weight * 0.95 - 2 + fat * 0.3), armCm: round2(26 + weight * 0.08),
        notes: k === 3 ? "Evaluación inicial" : null,
      });
      weight += trend + (rand() - 0.5);
      fat += m.primaryGoal === "PERFORMANCE_REHABILITATION" ? 0 : -0.6 + (rand() - 0.5) * 0.4;
    }
  }
  await prisma.measurement.createMany({ data: measurements });

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const challenges = [
    { id: randomUUID(), gymId, name: "Reto del mes: 12 días", description: "Entrena al menos 12 días distintos este mes", metric: "ATTENDANCE_DAYS", goal: 12, startsAt: monthStart, endsAt: nextMonth, pointsReward: 120, maxParticipants: 30, createdById: demoUser.id, createdAt: monthStart },
    { id: randomUUID(), gymId, name: "20 rutinas completadas", description: "Completa 20 rutinas registradas", metric: "ROUTINE_COMPLETIONS", goal: 20, startsAt: prevMonth, endsAt: nextMonth, pointsReward: 150, createdById: demoUser.id, createdAt: prevMonth },
    { id: randomUUID(), gymId, name: "Maratón de verano", description: "30 asistencias en dos meses", metric: "ATTENDANCE_COUNT", goal: 30, startsAt: daysAgo(150), endsAt: daysAgo(90), pointsReward: 200, active: false, createdById: demoUser.id, createdAt: daysAgo(150) },
  ];
  await prisma.challenge.createMany({ data: challenges });
  const participants = [];
  const dayKey = (d) => d.toISOString().slice(0, 10);
  for (const m of members.filter((m) => m.status === "ACTIVE")) {
    if (chance(0.55)) {
      const c = challenges[0];
      const days = new Set(attendances.filter((a) => a.memberId === m.id && a.checkedInAt >= c.startsAt).map((a) => dayKey(a.checkedInAt)));
      participants.push({ gymId, challengeId: c.id, memberId: m.id, progress: days.size, completedAt: days.size >= c.goal ? now : null, joinedAt: c.startsAt });
    }
    if (routines.some((r) => r.memberId === m.id) && chance(0.7)) {
      const c = challenges[1];
      const done = routineLogs.filter((l) => l.memberId === m.id && l.completedAt >= c.startsAt).length;
      participants.push({ gymId, challengeId: c.id, memberId: m.id, progress: done, completedAt: done >= c.goal ? now : null, joinedAt: c.startsAt });
    }
  }
  await prisma.challengeParticipant.createMany({ data: participants });

  // -------------------------------------------------------------------
  // 10. Retención: mensajes automáticos e historial de envíos
  // -------------------------------------------------------------------
  const autoInactive = { id: randomUUID(), gymId, name: "Te extrañamos", trigger: "INACTIVITY", channel: "EMAIL", triggerDays: 7, cooldownDays: 14, subject: "¡Te extrañamos en {{gimnasio}}!", body: "Hola {{nombre}}, hace {{dias_inactivo}} días que no te vemos. ¡Vuelve a entrenar con nosotros!", lastRunAt: at(today, 8) };
  const autoExpiring = { id: randomUUID(), gymId, name: "Tu membresía vence pronto", trigger: "MEMBERSHIP_EXPIRING", channel: "EMAIL", triggerDays: 3, cooldownDays: 7, subject: "Tu plan {{plan}} vence el {{vence}}", body: "Hola {{nombre}}, tu membresía vence el {{vence}}. Renueva en recepción o por pago móvil.", lastRunAt: at(today, 8) };
  await prisma.automatedMessage.createMany({ data: [autoInactive, autoExpiring] });
  const logs = [];
  for (let k = 0; k < 14; k++) {
    const m = pick(members);
    const auto = chance(0.5) ? autoInactive : autoExpiring;
    logs.push({ gymId, memberId: m.id, automatedMessageId: auto.id, channel: "EMAIL", trigger: auto.trigger, recipient: users.find((u) => u.id === m.userId).email, subject: auto.subject.replace("{{gimnasio}}", DEMO_GYM.name).replace("{{plan}}", "Mensual").replace("{{vence}}", "pronto"), body: auto.body.replace("{{nombre}}", m._name.split(" ")[0]).replace("{{dias_inactivo}}", "9").replace("{{vence}}", "pronto"), status: weighted([["SENT", 8], ["SKIPPED", 1], ["FAILED", 1]]), createdAt: at(daysAgo(int(0, 30)), 8, int(0, 5)) });
  }
  await prisma.messageLog.createMany({ data: logs });

  console.log("\nGym demo listo:");
  console.log(`  socios: ${members.length}, membresías: ${memberships.length}, asistencias: ${attendances.length}`);
  console.log(`  transacciones: ${transactions.length}, ventas: ${sales.length}, rutinas: ${routines.length}, medidas: ${measurements.length}`);
  console.log(`  login: ${email} → "${DEMO_GYM.name}" (/registro/${DEMO_GYM.slug})`);
}

// Borra todo lo del gym demo salvo la cuenta demo (si ya vive ahí). El orden
// respeta las FK sin cascade (SaleItem→Product, RoutineExercise→Exercise,
// Membership→Plan, RewardRedemption→Reward).
async function wipeGym(gymId, keepUserId) {
  const where = { gymId };
  await prisma.$transaction([
    prisma.referral.deleteMany({ where }),
    prisma.challengeParticipant.deleteMany({ where }),
    prisma.challenge.deleteMany({ where }),
    prisma.routineLog.deleteMany({ where }),
    prisma.messageLog.deleteMany({ where }),
    prisma.automatedMessage.deleteMany({ where }),
    prisma.memberBadge.deleteMany({ where }),
    prisma.badge.deleteMany({ where }),
    prisma.rewardRedemption.deleteMany({ where }),
    prisma.reward.deleteMany({ where }),
    prisma.tier.deleteMany({ where }),
    prisma.pointsTransaction.deleteMany({ where }),
    prisma.paymentReceipt.deleteMany({ where }),
    prisma.transaction.deleteMany({ where }),
    prisma.saleItem.deleteMany({ where }),
    prisma.sale.deleteMany({ where }),
    prisma.stockMovement.deleteMany({ where }),
    prisma.product.deleteMany({ where }),
    prisma.routineExercise.deleteMany({ where }),
    prisma.routine.deleteMany({ where }),
    prisma.exercise.deleteMany({ where }),
    prisma.attendance.deleteMany({ where }),
    prisma.measurement.deleteMany({ where }),
    prisma.membership.deleteMany({ where }),
    prisma.membershipPlan.deleteMany({ where }),
    prisma.emergencyContact.deleteMany({ where }),
    prisma.medicalProfile.deleteMany({ where }),
    prisma.member.deleteMany({ where }),
    prisma.schedule.deleteMany({ where }),
    prisma.trainer.deleteMany({ where }),
    prisma.service.deleteMany({ where }),
    prisma.concept.deleteMany({ where }),
    prisma.exchangeRate.deleteMany({ where }),
    prisma.importJob.deleteMany({ where }),
    prisma.auditLog.deleteMany({ where }),
    prisma.profile.deleteMany({ where: keepUserId ? { gymId, userId: { not: keepUserId } } : where }),
    prisma.user.deleteMany({ where: keepUserId ? { gymId, id: { not: keepUserId } } : where }),
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
