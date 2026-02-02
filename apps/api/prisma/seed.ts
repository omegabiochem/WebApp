// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs'; // JS-only; no native build pain

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL! },
  },
});

async function seedAdmin() {
  const passwordHash = bcrypt.hashSync('Admin@123', 10);
  await prisma.user.upsert({
    where: { userId: 'admin' },
    update: {
      email: 'admin@lab.test',
      role: 'ADMIN',
      name: 'Admin',
      active: true,
      mustChangePassword: false,
      passwordVersion: 1,
    },
    create: {
      email: 'admin@lab.test',
      userId: 'admin',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash,
      active: true,
      mustChangePassword: false,
      passwordVersion: 1,
      userIdSetAt: new Date(), // optional but good
    },
  });
}

async function seedM2M() {
  const clientId = process.env.M2M_CLIENT_ID || 'scan-watcher';
  const plaintext = (process.env.M2M_CLIENT_SECRET ?? '').trim();
  const preHashed = (process.env.BCRYPT_HASH ?? '').trim();
  if (!plaintext && !preHashed) {
    throw new Error(
      'Set M2M_CLIENT_SECRET (plaintext) or BCRYPT_HASH (bcrypt) in your env before seeding.',
    );
  }
  const secretHash = preHashed || bcrypt.hashSync(plaintext, 10);

  await prisma.machineClient.upsert({
    where: { clientId },
    update: {
      secretHash,
      scopes: ['reports.read', 'attachments.write'],
      isActive: true,
      lastUsedAt: null,
    },
    create: {
      clientId,
      secretHash,
      scopes: ['reports.read', 'attachments.write'],
      isActive: true,
    },
  });
}

async function main() {
  await seedAdmin();
  await seedM2M();
  console.log('✅ Seeded admin + M2M client');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
