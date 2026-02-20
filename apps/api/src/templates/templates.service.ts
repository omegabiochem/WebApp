import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

import { UpdateTemplateDto } from './dto/update-template.dto';
import { FormType, UserRole } from '@prisma/client';
import { CreateTemplateDto } from './dto/create-template.dto';

type AuthedUser = {
  userId: string;
  role: UserRole;
  clientCode?: string | null;
};

function isAdmin(role: UserRole) {
  return role === 'ADMIN' || role === 'SYSTEMADMIN';
}

function yyyy(d: Date = new Date()): string {
  return String(d.getFullYear());
}
function seqPad(num: number): string {
  const width = Math.max(4, String(num).length);
  return String(num).padStart(width, '0');
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveClientCode(user: AuthedUser, dtoClientCode?: string) {
    // CLIENT must always be scoped to their own clientCode
    if (user.role === 'CLIENT') {
      if (!user.clientCode) {
        throw new ForbiddenException('Client user has no clientCode assigned');
      }
      return user.clientCode;
    }

    // Non-client roles:
    // - allow "global templates" by leaving clientCode null (optional)
    // - or accept dtoClientCode
    return dtoClientCode ?? null;
  }

  async create(user: AuthedUser, dto: CreateTemplateDto) {
    const clientCode = this.resolveClientCode(user, dto.clientCode);

    // Optional safety: prevent duplicate template names per (clientCode + formType)
    // Not required, but very helpful.
    // If you want DB-level enforcement, add @@unique([clientCode, formType, name]) in Prisma.
    const exists = await this.prisma.formTemplate.findFirst({
      where: {
        clientCode,
        formType: dto.formType,
        name: dto.name,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('Template with same name already exists');
    }

    return this.prisma.formTemplate.create({
      data: {
        name: dto.name,
        formType: dto.formType,
        clientCode,
        data: dto.data,
        version: 1,
        createdBy: user.userId,
        updatedBy: user.userId,
      },
    });
  }

  async list(
    user: AuthedUser,
    query: {
      q?: string;
      formType?: FormType;
      clientCode?: string;
      scope?: 'CLIENT' | 'GLOBAL' | 'ALL';
      take?: number;
      skip?: number;
      sort?: 'NEWEST' | 'OLDEST' | 'NAME_AZ' | 'NAME_ZA';
    },
  ) {
    const take = Math.min(Math.max(Number(query.take ?? 50), 1), 200);
    const skip = Math.max(Number(query.skip ?? 0), 0);

    // CLIENT scope is forced
    const forcedClientCode = user.role === 'CLIENT' ? user.clientCode : null;

    const scope = query.scope ?? 'ALL';

    let clientFilter: { clientCode?: string | null } = {};

    if (user.role === 'CLIENT') {
      if (!forcedClientCode) throw new ForbiddenException('Missing clientCode');
      clientFilter = { clientCode: forcedClientCode };
    } else {
      // ADMIN/SYSTEMADMIN/STAFF can view:
      // - CLIENT => templates for a specific client
      // - GLOBAL => clientCode null
      // - ALL => both
      if (scope === 'GLOBAL') clientFilter = { clientCode: null };
      else if (scope === 'CLIENT')
        clientFilter = { clientCode: query.clientCode ?? null };
      else clientFilter = {}; // ALL
    }

    const where: any = {
      ...clientFilter,
      ...(query.formType ? { formType: query.formType } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { clientCode: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy =
      query.sort === 'OLDEST'
        ? { createdAt: 'asc' as const }
        : query.sort === 'NAME_AZ'
          ? { name: 'asc' as const }
          : query.sort === 'NAME_ZA'
            ? { name: 'desc' as const }
            : { createdAt: 'desc' as const };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.formTemplate.findMany({
        where,
        orderBy,
        take,
        skip,
        select: {
          id: true,
          name: true,
          formType: true,
          clientCode: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.formTemplate.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async get(user: AuthedUser, id: string) {
    const t = await this.prisma.formTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');

    // auth scope
    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('Missing clientCode');
      if (t.clientCode !== user.clientCode) {
        throw new ForbiddenException('Not allowed');
      }
    }

    return t;
  }

  async update(user: AuthedUser, id: string, dto: UpdateTemplateDto) {
    const current = await this.prisma.formTemplate.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Template not found');

    // scope rules
    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('Missing clientCode');
      if (current.clientCode !== user.clientCode) {
        throw new ForbiddenException('Not allowed');
      }
    } else {
      // optional: only ADMIN/SYSTEMADMIN can edit GLOBAL templates
      if (current.clientCode === null && !isAdmin(user.role)) {
        throw new ForbiddenException(
          'Only ADMIN/SYSTEMADMIN can edit global templates',
        );
      }
    }

    // optimistic locking: require expectedVersion for non-admin, optional for admin
    if (!isAdmin(user.role) && typeof dto.expectedVersion !== 'number') {
      throw new BadRequestException('expectedVersion is required');
    }

    const { expectedVersion, ...patch } = dto;

    const res = await this.prisma.formTemplate.updateMany({
      where: {
        id,
        ...(typeof expectedVersion === 'number'
          ? { version: expectedVersion }
          : {}),
      },
      data: {
        ...patch,
        updatedBy: user.userId,
        version: { increment: 1 },
      },
    });

    if (typeof expectedVersion === 'number' && res.count === 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          'This template was updated by someone else. Please reload and try again.',
        expectedVersion,
        currentVersion: current.version,
      });
    }

    return this.prisma.formTemplate.findUnique({ where: { id } });
  }

 async remove(user: AuthedUser, id: string, dto?: { expectedVersion?: number }) {
  const current = await this.prisma.formTemplate.findUnique({ where: { id } });
  if (!current) throw new NotFoundException('Template not found');

  // scope rules (same as your code)
  if (user.role === 'CLIENT') {
    if (!user.clientCode) throw new ForbiddenException('Missing clientCode');
    if (current.clientCode !== user.clientCode) {
      throw new ForbiddenException('Not allowed');
    }
  } else {
    if (current.clientCode === null && !isAdmin(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN/SYSTEMADMIN can delete global templates',
      );
    }
  }

  const expectedVersion = dto?.expectedVersion;

  if (!isAdmin(user.role) && typeof expectedVersion !== 'number') {
    throw new BadRequestException('expectedVersion is required');
  }

  const res = await this.prisma.formTemplate.deleteMany({
    where: {
      id,
      ...(typeof expectedVersion === 'number'
        ? { version: expectedVersion }
        : {}),
    },
  });

  if (typeof expectedVersion === 'number' && res.count === 0) {
    throw new ConflictException({
      code: 'CONFLICT',
      message:
        'This template was updated by someone else. Please reload and try again.',
      expectedVersion,
      currentVersion: current.version,
    });
  }

  return { ok: true };
}

  // templates.service.ts
  async createReportFromTemplate(
    user: { userId: string; role: UserRole; clientCode?: string | null },
    templateId: string,
  ) {
    const template = await this.prisma.formTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Template not found');

    // CLIENT safety
    if (user.role === 'CLIENT') {
      if (!user.clientCode) throw new ForbiddenException('Missing clientCode');
      if (template.clientCode !== user.clientCode) {
        throw new ForbiddenException('Not allowed');
      }
    }

    const clientCode = template.clientCode ?? user.clientCode ?? null;
    if (!clientCode) {
      throw new BadRequestException('Client code missing for template/report');
    }

    // ✅ sanitize template.data before nested create
    const clean = this.coerceTemplateDetails(template.formType, template.data);

    // small unique form number helper (you can swap to your clientSequence logic later)
    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    const formNumber = `${clientCode}-${yyyy()}${seqPad(seq.lastNumber)}`;

    // -------------------------
    // ✅ CHEMISTRY: create ChemistryReport
    // -------------------------
    if (template.formType === 'CHEMISTRY_MIX') {
      const created = await this.prisma.chemistryReport.create({
        data: {
          clientCode,
          formType: 'CHEMISTRY_MIX',
          formNumber,
          prefix: 'BC',
          status: 'DRAFT',
          createdBy: user.userId,
          updatedBy: user.userId,
          chemistryMix: {
            create: clean,
          },
        },
        select: { id: true },
      });

      // return route that EXISTS in your frontend
      return { route: `/chemistry-reports/chemistry-mix/${created.id}` };
      // if your real route is `/chemistry-reports/chemistry-mix/${id}`, change it here
    }

    // -------------------------
    // ✅ MICRO/WATER/STERILITY: create Report
    // -------------------------
    const data: any = {
      clientCode,
      formType: template.formType,
      formNumber,
      prefix: 'OM',
      status: 'DRAFT',
      createdBy: user.userId,
      updatedBy: user.userId,
    };

    if (template.formType === 'MICRO_MIX') {
      data.microMix = { create: clean };
    } else if (template.formType === 'MICRO_MIX_WATER') {
      data.microMixWater = { create: clean };
    } else if (template.formType === 'STERILITY') {
      data.sterility = { create: clean };
    } else {
      throw new BadRequestException(
        `Unsupported formType: ${template.formType}`,
      );
    }

    const created = await this.prisma.report.create({
      data,
      select: { id: true, formType: true },
    });

    const route =
      created.formType === 'MICRO_MIX'
        ? `/reports/micro-mix/${created.id}`
        : created.formType === 'MICRO_MIX_WATER'
          ? `/reports/micro-mix-water/${created.id}`
          : `/reports/sterility/${created.id}`;

    return { route };
  }

  // ✅ helper to prevent nested-create crashes
  private coerceTemplateDetails(formType: FormType, data: any) {
    const obj = data && typeof data === 'object' ? { ...(data as any) } : {};

    // remove dangerous keys
    delete obj.id;
    delete obj.reportId;
    delete obj.chemistryId;
    delete obj.createdAt;
    delete obj.updatedAt;
    delete obj.lockedAt;
    delete obj.status;
    delete obj.createdBy;
    delete obj.updatedBy;
    delete obj.version;
    delete obj.corrections;

    // -------- date coercion (MICRO/WATER/STERILITY/ CHEM)
    const dateKeys = [
      'dateSent',
      'manufactureDate',
      'samplingDate',
      'dateTested',
      'preliminaryResultsDate',
      'dateCompleted',
      'testedDate',
      'reviewedDate',
      'dateReceived', // chemistry
    ];

    for (const k of dateKeys) {
      if (!(k in obj)) continue;

      const v = obj[k];

      // treat empty, NA, undefined as null
      if (
        v === '' ||
        v === null ||
        v === undefined ||
        String(v).trim().toUpperCase() === 'NA'
      ) {
        obj[k] = null;
        continue;
      }

      // if "YYYY-MM-DD", convert to ISO DateTime
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        obj[k] = new Date(`${v.trim()}T00:00:00.000Z`);
        continue;
      }

      // if string ISO already, or Date-like, try converting
      if (typeof v === 'string') {
        const d = new Date(v);
        obj[k] = isNaN(d.getTime()) ? null : d;
        continue;
      }

      // if already Date, keep
      if (v instanceof Date) continue;

      // fallback
      const d = new Date(v);
      obj[k] = isNaN(d.getTime()) ? null : d;
    }

    // pathogens: accept array/object OR JSON string
    if ('pathogens' in obj && obj.pathogens != null) {
      if (typeof obj.pathogens === 'string') {
        try {
          obj.pathogens = JSON.parse(obj.pathogens);
        } catch {
          // leave as-is; Prisma Json can accept string but your UI expects array/object
        }
      }
    }

    return obj;
  }
}
