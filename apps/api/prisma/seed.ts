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
    where: { email: 'admin@lab.test' },
    update: { role: 'ADMIN', userId: 'admin' },
    create: {
      email: 'admin@lab.test',
      userId: 'admin',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash,
      active: true,
      mustChangePassword: false,
      passwordVersion: 1,
    },
  });
}

async function seedM2M() {
  const clientId = process.env.M2M_CLIENT_ID || 'scan-watcher';
  const plaintext = (process.env.M2M_CLIENT_SECRET ?? '').trim();
  const preHashed = (process.env.BCRYPT_HASH ?? '').trim();
  if (!plaintext && !preHashed) {
    throw new Error(
      'Set M2M_CLIENT_SECRET (plaintext) or BCRYPT_HASH (bcrypt) in your env before seeding.'
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



// // prisma/seed.ts
// import { PrismaClient, type UserRole } from "@prisma/client";
// import bcrypt from "bcrypt";

// const prisma = new PrismaClient({
//   datasources:{
//     db: { url: process.env.DIRECT_URL?? process.env.DATABASE_URL! }
//   }
// });
// const ADMIN: UserRole = "ADMIN";

// async function main() {
//   const passwordHash = await bcrypt.hash("Admin@123", 10);

//   await prisma.user.upsert({
//     where: { email: "admin@lab.test" },
//     update: {
//       role: ADMIN,
//       userId: "admin", // ensure lower-case
//     },
//     create: {
//       email: "admin@lab.test",
//       userId: "admin", // 👈 add this
//       name: "Admin",
//       role: ADMIN,
//       passwordHash,
//       active: true,
//       mustChangePassword: false,
//       passwordVersion: 1,
//       // inviteToken: omit (it's optional)
//     },
//   });

//   console.log('Seeded/updated admin: userId="admin" / password="Admin@123"');
// }

// main().catch((e) => { console.error(e); process.exit(1); })
//        .finally(() => prisma.$disconnect());
