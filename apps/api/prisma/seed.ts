import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@lab.test' },
    update: {},
    create: { email: 'admin@lab.test', name: 'Admin', role: 'admin', passwordHash },
  });
  console.log('Seeded admin: admin@lab.test / Admin@123');
}
main().finally(() => prisma.$disconnect());
