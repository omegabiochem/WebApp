const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

(async () => {
  console.log("DB =", process.env.DIRECT_URL || process.env.DATABASE_URL);
  console.log("M2M len =", (process.env.M2M_CLIENT_SECRET||"").length);
  const clientId = process.env.M2M_CLIENT_ID || "scan-watcher";
  const plaintext = (process.env.M2M_CLIENT_SECRET || "").trim();
  if (!plaintext) { throw new Error("M2M_CLIENT_SECRET missing"); }
  const secretHash = bcrypt.hashSync(plaintext, 10);

  const row = await prisma.machineClient.upsert({
    where: { clientId },
    update: { secretHash, scopes: ["reports.read", "attachments.write"], isActive: true, lastUsedAt: null },
    create: { clientId, secretHash, scopes: ["reports.read", "attachments.write"], isActive: true },
  });
  console.log("✅ upserted:", row.clientId);
})().catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
