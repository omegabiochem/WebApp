// prisma/seed.ts
import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient({
  datasources:{
    db: { url: process.env.DIRECT_URL?? process.env.DATABASE_URL! }
  }
});
const ADMIN: UserRole = "ADMIN";

async function main() {
  const passwordHash = await bcrypt.hash("Admin@123", 10);

  await prisma.user.upsert({
    where: { email: "admin@lab.test" },
    update: {
      role: ADMIN,
      userId: "admin", // ensure lower-case
    },
    create: {
      email: "admin@lab.test",
      userId: "admin", // 👈 add this
      name: "Admin",
      role: ADMIN,
      passwordHash,
      active: true,
      mustChangePassword: false,
      passwordVersion: 1,
      // inviteToken: omit (it's optional)
    },
  });

  console.log('Seeded/updated admin: userId="admin" / password="Admin@123"');
}

main().catch((e) => { console.error(e); process.exit(1); })
       .finally(() => prisma.$disconnect());
