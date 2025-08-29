// scripts/checkLogin.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USER_ID = process.argv[2] || 'admin';
const PASS = process.argv[3] || 'Admin@123';

async function main() {
  const uid = USER_ID.trim().toLowerCase();
  console.log(`🔎 Looking up userId="${uid}" ...`);

  const user = await prisma.user.findFirst({
    where: { userId: uid },
    select: { id: true, email: true, userId: true, active: true, passwordHash: true }
  });
  console.log('➡️  DB user row:', user);

  if (!user) {
    console.error('❌ No user with that userId');
    return;
  }
  if (!user.active) {
    console.error('❌ User is not active');
    return;
  }

  const ok = await bcrypt.compare(PASS, user.passwordHash);
  console.log('➡️  Password match:', ok);
}

main()
  .catch((e) => console.error('Script error:', e))
  .finally(() => prisma.$disconnect());
