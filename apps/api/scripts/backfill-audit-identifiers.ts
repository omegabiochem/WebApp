import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting audit trail backfill...');

  const audits = await prisma.auditTrail.findMany({
    where: {
      entityId: { not: null },
      OR: [
        { formNumber: null },
        { reportNumber: null },
        { formType: null },
      ],
    },
    select: {
      id: true,
      entity: true,
      entityId: true,
    },
    take: 10000,
  });

  console.log(`Found ${audits.length} audit rows to inspect`);

  let updated = 0;
  let skipped = 0;

  for (const row of audits) {
    if (!row.entityId) {
      skipped++;
      continue;
    }

    // 1) Try Report
    const report = await prisma.report.findUnique({
      where: { id: row.entityId },
      select: {
        formNumber: true,
        reportNumber: true,
        formType: true,
        clientCode: true,
      },
    });

    if (report) {
      await prisma.auditTrail.update({
        where: { id: row.id },
        data: {
          formNumber: report.formNumber,
          reportNumber: report.reportNumber,
          formType: report.formType,
          clientCode: report.clientCode ?? undefined,
        },
      });
      updated++;
      continue;
    }

    // 2) Try ChemistryReport
    const chem = await prisma.chemistryReport.findUnique({
      where: { id: row.entityId },
      select: {
        formNumber: true,
        reportNumber: true,
        formType: true,
        clientCode: true,
      },
    });

    if (chem) {
      await prisma.auditTrail.update({
        where: { id: row.id },
        data: {
          formNumber: chem.formNumber,
          reportNumber: chem.reportNumber,
          formType: chem.formType,
          clientCode: chem.clientCode ?? undefined,
        },
      });
      updated++;
      continue;
    }

    skipped++;
  }

  console.log(`Backfill complete. Updated=${updated}, Skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });