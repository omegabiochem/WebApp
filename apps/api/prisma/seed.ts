// prisma/seed.ts
import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Type-safely bind the string value you want
const ADMIN: UserRole = "ADMIN";

async function main() {
  const passwordHash = await bcrypt.hash("Admin@123", 10);

  await prisma.user.upsert({
    where: { email: "admin@lab.test" },
    update: { role: ADMIN },
    create: {
      email: "admin@lab.test",
      name: "Admin",
      role: ADMIN,
      passwordHash,
      active: true,
      mustChangePassword: false,
    },
  });

  console.log("Seeded/updated admin: admin@lab.test / Admin@123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
