// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const clientId = process.env.M2M_CLIENT_ID || 'scan-watcher';

  // Prefer plaintext, fall back to hash
  const plaintext = (process.env.M2M_CLIENT_SECRET || '').trim();
  const providedHash = (process.env.BCRYPT_HASH || '').trim();

  if (!plaintext && !providedHash) {
    throw new Error('Set M2M_CLIENT_SECRET (plaintext) or BCRYPT_HASH (bcrypt).');
  }

  const secretHash = plaintext ? bcrypt.hashSync(plaintext, 10) : providedHash;

  const scopes = ['reports.read', 'attachments.write'];

  await prisma.machineClient.upsert({
    where: { clientId },
    update: { secretHash, scopes, isActive: true, lastUsedAt: null },
    create: { clientId, secretHash, scopes, isActive: true },
  });

  console.log('✅ Upserted machine client:', clientId);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
