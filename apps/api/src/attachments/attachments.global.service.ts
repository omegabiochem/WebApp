import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import * as path from 'path';
import { ChemistryAttachmentsService } from './chemistryattachments.service';
import { Readable } from 'stream';
import { PDFDocument } from 'pdf-lib';

type ReportType = 'MICRO' | 'MICRO_WATER' | 'STERILITY' | 'CHEMISTRY';

type ListArgs = {
  q?: string;
  kind?: string;
  fileType?: 'ALL' | 'image' | 'pdf' | 'other';
  createdBy?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  reportId?: string;
  reportType?: 'ALL' | ReportType;
  sort?: 'NEWEST' | 'OLDEST' | 'FILENAME_AZ' | 'FILENAME_ZA' | 'KIND';
  take: number;
  skip: number;
};

type UserLike = {
  role?: string;
  clientCode?: string | null;
};

function extType(filename: string): 'image' | 'pdf' | 'other' {
  const ext = (path.extname(filename) || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  return 'other';
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
    );
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function allowedTypesForRole(role: string | null): ReportType[] {
  return role === 'CHEMISTRY'
    ? ['CHEMISTRY']
    : role === 'MICRO'
      ? ['MICRO', 'MICRO_WATER', 'STERILITY']
      : role === 'CLIENT'
        ? ['CHEMISTRY', 'MICRO', 'MICRO_WATER', 'STERILITY']
        : ['CHEMISTRY', 'MICRO', 'MICRO_WATER', 'STERILITY'];
}

@Injectable()
export class AttachmentsGlobalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly micro: AttachmentsService,
    private readonly chem: ChemistryAttachmentsService,
  ) {}

  // ✅ IMPORTANT: accept user
  async listAll(args: ListArgs, user?: UserLike) {
    const take = Math.min(Math.max(args.take ?? 100, 1), 1000);
    const skip = Math.max(args.skip ?? 0, 0);

    const userRole = user?.role ?? null;
    const userClientCode = (user?.clientCode || '').trim() || null;

    // ✅ If client has no clientCode, safest: show nothing
    if (userRole === 'CLIENT' && !userClientCode) {
      return { items: [], total: 0 };
    }

    // ✅ If CLIENT: filter at DB level (best)
    const reportWhere =
      userRole === 'CLIENT' ? { report: { clientCode: userClientCode } } : {};

    const chemWhere =
      userRole === 'CLIENT' ? { report: { clientCode: userClientCode } } : {};

    const role = userRole;

    const allowedReportTypes: ReportType[] =
      role === 'CHEMISTRY'
        ? ['CHEMISTRY']
        : role === 'MICRO'
          ? ['MICRO', 'MICRO_WATER', 'STERILITY']
          : role === 'CLIENT'
            ? ['CHEMISTRY', 'MICRO', 'MICRO_WATER', 'STERILITY'] // or based on client ownership
            : ['CHEMISTRY', 'MICRO', 'MICRO_WATER', 'STERILITY']; // ADMIN/QA etc

    const canSeeMicro = userRole !== 'CHEMISTRY';
    const canSeeChem = userRole !== 'MICRO';

    const microWhereFinal: any = {
      ...(reportWhere as any),
      report: {
        ...(reportWhere as any)?.report,
        formType: { in: ['MICRO_MIX', 'MICRO_MIX_WATER', 'STERILITY'] }, // ✅ filter by report.formType
      },
    };

    const [microItems, chemItems] = await Promise.all([
      canSeeMicro
        ? this.prisma.attachment.findMany({
            where: microWhereFinal,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              reportId: true,
              kind: true,
              filename: true,
              pages: true,
              source: true,
              createdAt: true,
              createdBy: true,
              report: { select: { formType: true, clientCode: true } },
            },
            take: 5000,
          })
        : Promise.resolve([]),

      canSeeChem
        ? this.prisma.chemistryAttachment.findMany({
            where: chemWhere as any,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              chemistryId: true,
              kind: true,
              filename: true,
              pages: true,
              source: true,
              createdAt: true,
              createdBy: true,
              report: { select: { clientCode: true } },
            },
            take: 5000,
          })
        : Promise.resolve([]),
    ]);

    const merged: Array<{
      id: string;
      reportType: ReportType;
      reportId: string;
      filename: string;
      kind: any;
      createdAt: Date;
      createdBy: string | null;
      pages: number | null;
      source: string | null;
      clientCode: string | null;
    }> = [
      ...microItems.map((a) => ({
        id: a.id,
        reportType:
          a.report?.formType === 'MICRO_MIX_WATER'
            ? ('MICRO_WATER' as const)
            : a.report?.formType === 'STERILITY'
              ? ('STERILITY' as const)
              : ('MICRO' as const),
        reportId: a.reportId,
        filename: a.filename,
        kind: a.kind,
        createdAt: a.createdAt,
        createdBy: a.createdBy,
        pages: a.pages ?? null,
        source: a.source ?? null,
        clientCode: a.report?.clientCode ?? null,
      })),

      ...chemItems.map((a) => ({
        id: a.id,
        reportType: 'CHEMISTRY' as const,
        reportId: a.chemistryId,
        filename: a.filename,
        kind: a.kind,
        createdAt: a.createdAt,
        createdBy: a.createdBy,
        pages: a.pages ?? null,
        source: a.source ?? null,
        clientCode: a.report?.clientCode ?? null,
      })),
    ];

    // ---- your existing filtering (safe) ----
    const q = (args.q || '').trim().toLowerCase();
    const kind = args.kind && args.kind !== 'ALL' ? args.kind : null;
    const createdBy =
      args.createdBy && args.createdBy !== 'ALL' ? args.createdBy : null;
    const source = args.source && args.source !== 'ALL' ? args.source : null;
    const reportId = args.reportId ? String(args.reportId) : null;
    const reportType =
      args.reportType && args.reportType !== 'ALL' ? args.reportType : null;

    const dateFrom = args.dateFrom ? new Date(args.dateFrom).getTime() : null;
    const dateTo = args.dateTo ? new Date(args.dateTo).getTime() : null;

    let out = merged.filter((a) => {
      if (reportType && a.reportType !== reportType) return false;
      if (reportId && a.reportId !== reportId) return false;
      if (kind && String(a.kind) !== kind) return false;

      if (args.fileType && args.fileType !== 'ALL') {
        if (extType(a.filename) !== args.fileType) return false;
      }

      if (createdBy && (a.createdBy || '').trim() !== createdBy) return false;
      if (source && (a.source || '').trim() !== source) return false;

      const t = new Date(a.createdAt).getTime();
      if (dateFrom && t < dateFrom) return false;
      if (dateTo && t > dateTo) return false;

      if (q) {
        const hay = [
          a.filename,
          a.kind,
          a.createdBy || '',
          a.source || '',
          a.id,
          a.reportType,
          a.reportId,
          a.clientCode || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const sort = args.sort ?? 'NEWEST';
    out.sort((a, b) => {
      if (sort === 'NEWEST')
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === 'OLDEST')
        return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === 'FILENAME_AZ') return a.filename.localeCompare(b.filename);
      if (sort === 'FILENAME_ZA') return b.filename.localeCompare(a.filename);
      if (sort === 'KIND') return String(a.kind).localeCompare(String(b.kind));
      return 0;
    });

    const total = out.length;
    out = out.slice(skip, skip + take);

    return { items: out, total };
  }

  async streamByAnyId(id: string, user?: UserLike) {
    const userRole = user?.role ?? null;
    const userClientCode = (user?.clientCode || '').trim() || null;

    const allowed = allowedTypesForRole(userRole);

    // ✅ MICRO
    const micro = await this.prisma.attachment.findUnique({
      where: { id },
      select: {
        id: true,
        report: { select: { clientCode: true, formType: true } },
      },
    });

    if (micro) {
      // CLIENT ownership check
      if (userRole === 'CLIENT' && micro.report?.clientCode !== userClientCode)
        return null;

      // ✅ role-based type check
      const rt: ReportType =
        micro.report?.formType === 'MICRO_MIX_WATER'
          ? 'MICRO_WATER'
          : micro.report?.formType === 'STERILITY'
            ? 'STERILITY'
            : 'MICRO';

      if (!allowed.includes(rt)) return null;

      return this.micro.stream(id);
    }
    // ✅ CHEM
    const chem = await this.prisma.chemistryAttachment.findUnique({
      where: { id },
      select: { id: true, report: { select: { clientCode: true } } },
    });

    if (chem) {
      if (userRole === 'CLIENT' && chem.report?.clientCode !== userClientCode)
        return null;

      // ✅ role-based type check
      if (!allowed.includes('CHEMISTRY')) return null;

      return this.chem.stream(id);
    }

    return null;
  }

  async mergePdfByAnyIds(ids: string[], user?: UserLike): Promise<Uint8Array> {
    const outPdf = await PDFDocument.create();

    for (const id of ids) {
      const out = await this.streamByAnyId(id, user);
      if (!out)
        throw new BadRequestException(
          `Attachment not found or not allowed: ${id}`,
        );

      const { stream, mime, filename } = out;

      // ✅ only PDFs
      if (!/^application\/pdf/i.test(mime)) {
        throw new BadRequestException(`Not a PDF: ${filename} (${id})`);
      }

      const buf = await streamToBuffer(stream as any);
      let src: PDFDocument;

      try {
        src = await PDFDocument.load(buf, { ignoreEncryption: true });
      } catch {
        throw new BadRequestException(`Invalid PDF: ${filename} (${id})`);
      }

      const pages = await outPdf.copyPages(src, src.getPageIndices());
      pages.forEach((p) => outPdf.addPage(p));
    }

    return await outPdf.save();
  }

  async unreadResultsCount(user?: UserLike) {
    const userRole = user?.role ?? null;
    const userClientCode = (user?.clientCode || '').trim() || null;

    // ✅ If CLIENT has no clientCode → safest: 0
    if (userRole === 'CLIENT' && !userClientCode) return { count: 0 };

    // get last seen timestamp from DB
    // NOTE: userLike doesn't include id; controller will pass userId too
    // so we will implement in controller/service with userId param
  }

  async unreadResultsCountByUserId(userId: string, user?: UserLike) {
    const userRole = user?.role ?? null;
    const userClientCode = (user?.clientCode || '').trim() || null;

    if (userRole === 'CLIENT' && !userClientCode) return { count: 0 };

    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { resultsLastSeenAt: true },
    });

    const since = dbUser?.resultsLastSeenAt ?? new Date(0);

    const canSeeMicro = userRole !== 'CHEMISTRY';
    const canSeeChem = userRole !== 'MICRO';

    const microWhereFinal: any = {
      ...(userRole === 'CLIENT'
        ? { report: { clientCode: userClientCode } }
        : {}),
      report: {
        ...(userRole === 'CLIENT' ? { clientCode: userClientCode } : {}),
        formType: { in: ['MICRO_MIX', 'MICRO_MIX_WATER', 'STERILITY'] },
      },
      createdAt: { gt: since },
    };

    const chemWhereFinal: any = {
      ...(userRole === 'CLIENT'
        ? { report: { clientCode: userClientCode } }
        : {}),
      createdAt: { gt: since },
    };

    const [microCount, chemCount] = await Promise.all([
      canSeeMicro
        ? this.prisma.attachment.count({ where: microWhereFinal })
        : 0,
      canSeeChem
        ? this.prisma.chemistryAttachment.count({ where: chemWhereFinal })
        : 0,
    ]);

    return { count: microCount + chemCount };
  }

  async markResultsRead(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { resultsLastSeenAt: new Date() },
    });

    return { ok: true };
  }
}
