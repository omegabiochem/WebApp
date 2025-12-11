import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { FormType, User, UserRole } from '@prisma/client';
import { copy } from 'fs-extra';
import { PrismaService } from 'prisma/prisma.service';

// Micro & Chem department code for reportNumber
function getDeptLetterForForm(formType: FormType) {
  return formType.startsWith('MICRO') ? 'OM' : 'BC';
}

type ChemistryFormType = Extract<FormType, 'CHEMISTRY_MIX'>;

const DETAILS_RELATIONS: Record<ChemistryFormType, 'chemistryMix'> = {
  CHEMISTRY_MIX: 'chemistryMix',
};

const BASE_FIELDS = new Set([
  'formNumber',
  'reportNumber',
  'prefix',
  'status',
  'lockedAt',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'formType',
]);

// to pick existed related report
function pickDetails(r: any) {
  return r.chemistryMix ?? null;
}

function flattenReport(r: any) {
  const { chemistryMix, ...base } = r;

  const dRaw = pickDetails(r) || {};

  const d = Object.fromEntries(
    Object.entries(dRaw).filter(([k]) => !BASE_FIELDS.has(k)),
  );
  return { ...base, ...d };
}

@Injectable()
export class ChemistryReportsService {
  // Service methods would go here
  constructor(private readonly prisma: PrismaService) {}

  async createChemistryReportDraft(
    user: { userId: string; role: UserRole; clientCode?: string },
    body: any,
  ) {
    if (!['ADMIN', 'SYSTEMADMIN', 'CLIENT'].includes(user.role)) {
      throw new ForbiddenException('Not allowed to create report');
    }

    const formType: FormType = body?.formType;
    if (!formType) throw new BadRequestException('formType is required');

    const relationKey = DETAILS_RELATIONS[formType as ChemistryFormType];
    if (!relationKey) {
      throw new BadRequestException(`Unsupported formType: ${formType}`);
    }

    const clientCode = user.clientCode ?? body.clientCode;
    if (!clientCode) {
      throw new BadRequestException(
        'Client code is required to create a report',
      );
    }

    function yyyy(d: Date = new Date()): string {
      const yyyy = String(d.getFullYear());
      return yyyy;
    }

    function seqPad(num: number): string {
      const width = Math.max(4, String(num).length);
      return String(num).padStart(width, '0');
    }

    const seq = await this.prisma.clientSequence.upsert({
      where: { clientCode },
      update: { lastNumber: { increment: 1 } },
      create: { clientCode, lastNumber: 1 },
    });

    const n = seqPad(seq.lastNumber);
    const formNumber = `${clientCode}-${yyyy()}${n}`;
    const prefix = getDeptLetterForForm(formType);

    // remove non-details keys from body that would collide with Report fields
    const { formType: _ft, clientCode: _cc, ...rest } = body;

    const created = await this.prisma.chemistryReport.create({
      data: {
        formType,
        formNumber,
        prefix,
        status: 'DRAFT',
        createdBy: user.userId,
        updatedBy: user.userId,
        [relationKey]: {
          create: this._coerce(rest),
        },
      },
    });
    return flattenReport(created);
  }

  private _coerce(obj: any) {
    const copy = { ...obj };

    const dateKeys = [
      'dateSent',
      'manufactureDate',
      'testedDate',
      'reviewedDate',
    ];

    for (const k of dateKeys) {
      if (!(k in copy)) continue;

      if (copy[k] === '' || copy[k] === null) {
        copy[k] = null;
      } else if (typeof copy[k] === 'string') {
        const d = new Date(copy[k]);
        copy[k] = isNaN(d.getTime()) ? null : d;
      }
    }
    return copy;
  }

  // TO get list of reports

  async findAll() {
    const reports = await this.prisma.chemistryReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        chemistryMix: true,
      },
    });
    return reports.map(flattenReport);
  }
}
