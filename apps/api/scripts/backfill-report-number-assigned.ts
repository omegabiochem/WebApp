import {
  PrismaClient,
  ChemistryReportStatus,
  ReportStatus,
  FormType,
} from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = false;

function displayActor(
  u: { name: string | null; userId: string | null; email: string } | null,
) {
  if (!u) return 'Unknown';
  return u.name?.trim() || u.userId?.trim() || u.email?.trim() || 'Unknown';
}

async function getActorLabel(userId: string | null | undefined) {
  if (!userId) return 'Unknown';

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      userId: true,
      email: true,
    },
  });

  return displayActor(actor);
}

async function backfillChemistryReports() {
  const reports = await prisma.chemistryReport.findMany({
    where: {
      reportNumber: { not: null },
      OR: [{ ReportnumberAssignedAt: null }, { ReportnumberAssignedBy: null }],
    },
    select: {
      id: true,
      formNumber: true,
      reportNumber: true,
      formType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      ReportnumberAssignedAt: true,
      ReportnumberAssignedBy: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `\n[CHEMISTRY] Found ${reports.length} report(s) needing backfill`,
  );

  let updatedCount = 0;
  let skippedCount = 0;

  for (const report of reports) {
    const firstUnderTesting =
      await prisma.chemistryReportStatusHistory.findFirst({
        where: {
          chemistryId: report.id,
          to: ChemistryReportStatus.UNDER_TESTING_REVIEW,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          userId: true,
        },
      });

    let assignedAt: Date | null = null;
    let assignedBy: string | null = null;

    if (firstUnderTesting) {
      assignedAt = firstUnderTesting.createdAt;
      assignedBy = await getActorLabel(firstUnderTesting.userId);
    } else {
      assignedAt = report.updatedAt ?? report.createdAt;
      assignedBy =
        report.ReportnumberAssignedBy ?? 'Backfilled (history missing)';
    }

    const nextAssignedAt = report.ReportnumberAssignedAt ?? assignedAt;
    const nextAssignedBy = report.ReportnumberAssignedBy ?? assignedBy;

    if (!nextAssignedAt && !nextAssignedBy) {
      skippedCount++;
      console.log(
        `[CHEMISTRY] Skipped ${report.formNumber} (${report.reportNumber}) - no usable source`,
      );
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `[CHEMISTRY][DRY RUN] Would update ${report.formNumber} (${report.reportNumber}) -> assignedAt=${nextAssignedAt?.toISOString() ?? 'null'}, assignedBy=${nextAssignedBy ?? 'null'}`,
      );
    } else {
      await prisma.chemistryReport.update({
        where: { id: report.id },
        data: {
          ReportnumberAssignedAt: nextAssignedAt,
          ReportnumberAssignedBy: nextAssignedBy,
        },
      });

      console.log(
        `[CHEMISTRY] Updated ${report.formNumber} (${report.reportNumber}) -> assignedAt=${nextAssignedAt?.toISOString() ?? 'null'}, assignedBy=${nextAssignedBy ?? 'null'}`,
      );
    }

    updatedCount++;
  }

  console.log(
    `[CHEMISTRY] Done. ${DRY_RUN ? 'Dry run only. ' : ''}Updated: ${updatedCount}, Skipped: ${skippedCount}`,
  );
}

function targetMicroStatus(formType: FormType): ReportStatus {
  if (formType === 'STERILITY') return ReportStatus.UNDER_TESTING_REVIEW;
  return ReportStatus.UNDER_PRELIMINARY_TESTING_REVIEW;
}

async function backfillMicroReports() {
  const reports = await prisma.report.findMany({
    where: {
      formType: {
        in: [FormType.MICRO_MIX, FormType.MICRO_MIX_WATER, FormType.STERILITY],
      },
      reportNumber: { not: null },
      OR: [{ ReportnumberAssignedAt: null }, { ReportnumberAssignedBy: null }],
    },
    select: {
      id: true,
      formNumber: true,
      reportNumber: true,
      formType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      ReportnumberAssignedAt: true,
      ReportnumberAssignedBy: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n[MICRO] Found ${reports.length} report(s) needing backfill`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const report of reports) {
    const targetStatus = targetMicroStatus(report.formType);

    const firstAssignedStatus = await prisma.statusHistory.findFirst({
      where: {
        reportId: report.id,
        to: targetStatus,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        userId: true,
      },
    });

    let assignedAt: Date | null = null;
    let assignedBy: string | null = null;

    if (firstAssignedStatus) {
      assignedAt = firstAssignedStatus.createdAt;
      assignedBy = await getActorLabel(firstAssignedStatus.userId);
    } else {
      assignedAt = report.updatedAt ?? report.createdAt;
      assignedBy =
        report.ReportnumberAssignedBy ?? 'Backfilled (history missing)';
    }

    const nextAssignedAt = report.ReportnumberAssignedAt ?? assignedAt;
    const nextAssignedBy = report.ReportnumberAssignedBy ?? assignedBy;

    if (!nextAssignedAt && !nextAssignedBy) {
      skippedCount++;
      console.log(
        `[MICRO] Skipped ${report.formNumber} (${report.reportNumber}) - no usable source`,
      );
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `[MICRO][DRY RUN] Would update ${report.formNumber} (${report.reportNumber}) [${report.formType}] -> assignedAt=${nextAssignedAt?.toISOString() ?? 'null'}, assignedBy=${nextAssignedBy ?? 'null'}`,
      );
    } else {
      await prisma.report.update({
        where: { id: report.id },
        data: {
          ReportnumberAssignedAt: nextAssignedAt,
          ReportnumberAssignedBy: nextAssignedBy,
        },
      });

      console.log(
        `[MICRO] Updated ${report.formNumber} (${report.reportNumber}) [${report.formType}] -> assignedAt=${nextAssignedAt?.toISOString() ?? 'null'}, assignedBy=${nextAssignedBy ?? 'null'}`,
      );
    }

    updatedCount++;
  }

  console.log(
    `[MICRO] Done. ${DRY_RUN ? 'Dry run only. ' : ''}Updated: ${updatedCount}, Skipped: ${skippedCount}`,
  );
}

async function main() {
  console.log(`Starting backfill... DRY_RUN=${DRY_RUN}`);
  await backfillChemistryReports();
  await backfillMicroReports();
  console.log('\nBackfill finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
