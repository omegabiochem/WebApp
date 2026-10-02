import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, UserRole } from '@prisma/client';

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import { createHash } from 'crypto';

import { writeFile, unlink } from 'fs/promises';

import { tmpdir } from 'os';

import { join } from 'path';

import type { Readable } from 'stream';

import { PrismaService } from 'prisma/prisma.service';

import { StorageService } from '../storage/storage.service';

import { getRequestContext } from '../common/request-context';

type AuthUser = {
  userId: string;

  role: UserRole;
};

type PdfReportDepartment = 'MICROBIOLOGY' | 'CHEMISTRY';

type PdfReportRow = {
  key: string;

  formType: string;

  department: PdfReportDepartment;

  formNumber: string;

  reportNumber: string;

  resultSentToClientAt: Date | string | null;

  lotNo: string;

  description: string;

  sampleTypes: string[];

  testLabels: string[];

  itemLabels: string[];

  extraCharges: Array<{
    name: string;
    amount: number;
  }>;

  baseAmount: number;

  amount: number;

  manualOverride: boolean;
};

const BILLING_TIME_ZONE = process.env.BILLING_TIME_ZONE || 'America/New_York';

const PREVIOUS_MONTH_MANUAL_PREFIX = 'Previous Month Pending: ';

/*

 * Invoice letterhead.

 *

 * Defaults match the laboratory report header so local

 * development also renders the correct letterhead.

 *

 * Production can override every value from .env.

 */

const COMPANY_NAME =
  process.env.BILLING_COMPANY_NAME || 'OMEGA / BIOCHEM LABORATORIES, INC.';

const COMPANY_SUBTITLE =
  process.env.BILLING_COMPANY_SUBTITLE || 'FDA REG. | ISO 17025 ACC';

const COMPANY_ADDRESS =
  process.env.BILLING_COMPANY_ADDRESS ||
  process.env.BILLING_COMPANY_ADDRESS_1 ||
  '56 PARK AVENUE, LYNDHURST, NJ 07071';

const COMPANY_ADDRESS_2 = process.env.BILLING_COMPANY_ADDRESS_2 || '';

const COMPANY_PHONE = process.env.BILLING_COMPANY_PHONE || '(201) 883 1222';

const COMPANY_FAX = process.env.BILLING_COMPANY_FAX || '(201) 883 0449';

const COMPANY_EMAIL =
  process.env.BILLING_COMPANY_EMAIL || 'lab@omegabiochem.com';

const PAGE_WIDTH = 612;

const PAGE_HEIGHT = 792;

const LEFT = 42;

const RIGHT = 42;

const TOP = 44;

const BOTTOM = 44;

@Injectable()
export class BillingPdfService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly storage: StorageService,
  ) {}

  /* =========================================================

     AUTH

  ========================================================= */

  private assertReader(user: AuthUser) {
    if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'You do not have access to billing invoices',
      );
    }
  }

  private assertManager(user: AuthUser) {
    if (!['ADMIN', 'SYSTEMADMIN'].includes(user.role)) {
      throw new ForbiddenException(
        'Only ADMIN or SYSTEMADMIN can generate invoice PDFs',
      );
    }
  }

  /* =========================================================

     FORMATTING

  ========================================================= */

  private money(value: number) {
    return `$${value.toFixed(2)}`;
  }

  private formatDate(value: Date | string | null | undefined) {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('en-US', {
      timeZone: BILLING_TIME_ZONE,

      month: 'short',

      day: '2-digit',

      year: 'numeric',
    }).format(date);
  }

  private addDays(
    value: Date | string,

    days: number,
  ) {
    const date =
      value instanceof Date ? new Date(value.getTime()) : new Date(value);

    date.setDate(date.getDate() + days);

    return date;
  }

  private safeFilename(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  }

  private drawRight(
    page: PDFPage,

    text: string,

    xRight: number,

    y: number,

    size: number,

    font: PDFFont,

    options?: {
      color?: ReturnType<typeof rgb>;
    },
  ) {
    const width = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
      x: xRight - width,

      y,

      size,

      font,
      color: options?.color,
    });
  }

  private drawCentered(
    page: PDFPage,

    text: string,

    y: number,

    size: number,

    font: PDFFont,

    options?: {
      color?: ReturnType<typeof rgb>;
    },
  ) {
    const value = String(text ?? '');

    if (!value) {
      return;
    }

    const width = font.widthOfTextAtSize(
      value,

      size,
    );

    page.drawText(value, {
      x: (PAGE_WIDTH - width) / 2,

      y,

      size,

      font,

      ...(options?.color
        ? {
            color: options.color,
          }
        : {}),
    });
  }

  private truncate(text: string, maxChars: number) {
    const value = String(text ?? '');

    if (value.length <= maxChars) {
      return value;
    }

    return value.slice(0, Math.max(0, maxChars - 3)) + '...';
  }

  /* =========================================================

     PAGE HEADER

  ========================================================= */

  private drawHeader(
    page: PDFPage,

    fonts: {
      regular: PDFFont;

      bold: PDFFont;
    },

    invoiceNumber: string,

    revisionNumber = 0,
  ) {
    let y = PAGE_HEIGHT - TOP;

    const brandBlue = rgb(0, 0.18, 0.78);

    /*

     * Match the laboratory report letterhead:

     *

     * OMEGA / BIOCHEM LABORATORIES, INC.

     * (FDA REG. | ISO 17025 ACC)

     * 56 PARK AVENUE, LYNDHURST, NJ 07071

     * Tel ... | Fax ...

     * Email ...

     */

    this.drawCentered(
      page,

      COMPANY_NAME,

      y,

      17,

      fonts.bold,

      {
        color: brandBlue,
      },
    );

    y -= 17;

    this.drawCentered(
      page,

      `(${COMPANY_SUBTITLE})`,

      y,

      10,

      fonts.bold,

      {
        color: brandBlue,
      },
    );

    y -= 14;

    this.drawCentered(
      page,

      COMPANY_ADDRESS,

      y,

      8.5,

      fonts.regular,
    );

    y -= 11;

    if (COMPANY_ADDRESS_2) {
      this.drawCentered(
        page,

        COMPANY_ADDRESS_2,

        y,

        8.5,

        fonts.regular,
      );

      y -= 11;
    }

    const phoneFaxLine = [
      COMPANY_PHONE ? `Tel: ${COMPANY_PHONE}` : '',

      COMPANY_FAX ? `Fax: ${COMPANY_FAX}` : '',
    ]

      .filter(Boolean)

      .join('  |  ');

    if (phoneFaxLine) {
      this.drawCentered(
        page,

        phoneFaxLine,

        y,

        8.5,

        fonts.regular,
      );

      y -= 11;
    }

    if (COMPANY_EMAIL) {
      const emailLabel = `Email: ${COMPANY_EMAIL}`;

      this.drawCentered(
        page,

        emailLabel,

        y,

        8.5,

        fonts.regular,

        {
          color: brandBlue,
        },
      );

      y -= 13;
    }

    page.drawLine({
      start: {
        x: LEFT,

        y,
      },

      end: {
        x: PAGE_WIDTH - RIGHT,

        y,
      },

      thickness: 0.7,

      color: rgb(
        0.65,

        0.65,

        0.65,
      ),
    });

    y -= 22;

    /*

     * Invoice identity row.

     *

     * Keep this below the common laboratory letterhead so

     * all OMEGA PDFs have the same visual identity while

     * the document type remains immediately obvious.

     */

    const documentTitle = revisionNumber > 0 ? 'REVISED INVOICE' : 'INVOICE';

    page.drawText(
      documentTitle,

      {
        x: LEFT,

        y,

        size: 20,

        font: fonts.bold,

        color: brandBlue,
      },
    );

    const invoiceText = `INVOICE NO: ${invoiceNumber}`;

    this.drawRight(
      page,

      invoiceText,

      PAGE_WIDTH - RIGHT,

      y + 3,

      10,

      fonts.bold,
    );

    y -= 18;

    page.drawLine({
      start: {
        x: LEFT,

        y,
      },

      end: {
        x: PAGE_WIDTH - RIGHT,

        y,
      },

      thickness: 1,
    });

    return y - 22;
  }

  private sourceDescription(snapshot: any) {
    if (!snapshot || typeof snapshot !== 'object') {
      return '';
    }

    return String(
      snapshot.description ??
        snapshot.sampleDescription ??
        snapshot.productDescription ??
        snapshot.sample_description ??
        '',
    ).trim();
  }

  private sourceLotNo(snapshot: any) {
    if (!snapshot || typeof snapshot !== 'object') {
      return '';
    }

    return String(
      snapshot.lotNo ??
        snapshot.lotBatchNo ??
        snapshot.lotNumber ??
        snapshot.batchNo ??
        snapshot.batchNumber ??
        '',
    ).trim();
  }

  private sourceSampleTypes(snapshot: any) {
    if (!snapshot || typeof snapshot !== 'object') {
      return [];
    }

    const rawValues = Array.isArray(snapshot.sampleTypes)
      ? snapshot.sampleTypes
      : snapshot.sampleType != null
        ? [snapshot.sampleType]
        : [];

    return this.uniqueText(
      rawValues.map((value: any) => {
        if (value == null) {
          return '';
        }

        if (typeof value === 'object') {
          return String(
            value.sampleType ??
              value.name ??
              value.label ??
              value.value ??
              value.type ??
              value.key ??
              '',
          )
            .trim()

            .replace(/_/g, ' ');
        }

        return String(value)
          .trim()

          .replace(/_/g, ' ');
      }),
    );
  }

  private reportDepartment(line: any): PdfReportDepartment {
    const sourceType = String(line?.sourceType ?? '').toUpperCase();

    const formType = String(line?.formType ?? '').toUpperCase();

    if (
      sourceType === 'CHEMISTRY_REPORT' ||
      formType === 'CHEMISTRY_MIX' ||
      formType === 'COA'
    ) {
      return 'CHEMISTRY';
    }

    return 'MICROBIOLOGY';
  }

  private async enrichInvoiceLineDisplayFields(lines: any[]) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return lines ?? [];
    }

    const missing = lines.filter(
      (line) =>
        this.sourceSampleTypes(line?.sourceSnapshot).length === 0 ||
        !this.sourceLotNo(line?.sourceSnapshot),
    );

    if (missing.length === 0) {
      return lines;
    }

    const microSourceIds = Array.from(
      new Set(
        missing

          .filter((line) => String(line?.sourceType) === 'REPORT')

          .map((line) => String(line?.sourceId ?? '').trim())

          .filter(Boolean),
      ),
    );

    const chemistrySourceIds = Array.from(
      new Set(
        missing

          .filter((line) => String(line?.sourceType) === 'CHEMISTRY_REPORT')

          .map((line) => String(line?.sourceId ?? '').trim())

          .filter(Boolean),
      ),
    );

    const [microSources, chemistrySources] = await Promise.all([
      microSourceIds.length > 0
        ? this.prisma.report.findMany({
            where: {
              id: {
                in: microSourceIds,
              },
            },

            include: {
              microMix: true,

              microMixWater: true,

              sterility: true,

              ape: true,
            },
          })
        : Promise.resolve([] as any[]),

      chemistrySourceIds.length > 0
        ? this.prisma.chemistryReport.findMany({
            where: {
              id: {
                in: chemistrySourceIds,
              },
            },

            include: {
              chemistryMix: true,

              coa: true,
            },
          })
        : Promise.resolve([] as any[]),
    ]);

    const fallbackBySource = new Map<string, Record<string, any>>();

    for (const source of microSources as any[]) {
      const details =
        source?.microMix ??
        source?.microMixWater ??
        source?.sterility ??
        source?.ape ??
        null;

      const sampleType = String(details?.sampleType ?? '').trim();

      const lotNo = String(details?.lotNo ?? '').trim();

      if (sampleType || lotNo) {
        fallbackBySource.set(`REPORT:${source.id}`, {
          ...(sampleType ? { sampleType } : {}),

          ...(lotNo ? { lotNo } : {}),
        });
      }
    }

    for (const source of chemistrySources as any[]) {
      const details = source?.chemistryMix ?? source?.coa ?? null;

      const sampleTypes = Array.isArray(details?.sampleTypes)
        ? details.sampleTypes
        : [];

      const lotBatchNo = String(details?.lotBatchNo ?? '').trim();

      if (sampleTypes.length > 0 || lotBatchNo) {
        fallbackBySource.set(`CHEMISTRY_REPORT:${source.id}`, {
          ...(sampleTypes.length > 0 ? { sampleTypes } : {}),

          ...(lotBatchNo ? { lotBatchNo } : {}),
        });
      }
    }

    return lines.map((line) => {
      if (
        this.sourceSampleTypes(line?.sourceSnapshot).length > 0 &&
        this.sourceLotNo(line?.sourceSnapshot)
      ) {
        return line;
      }

      const fallback = fallbackBySource.get(
        `${line?.sourceType}:${line?.sourceId}`,
      );

      if (!fallback) {
        return line;
      }

      const currentSnapshot =
        line?.sourceSnapshot &&
        typeof line.sourceSnapshot === 'object' &&
        !Array.isArray(line.sourceSnapshot)
          ? line.sourceSnapshot
          : {};

      const currentSampleTypes = this.sourceSampleTypes(currentSnapshot);

      const currentLotNo = this.sourceLotNo(currentSnapshot);

      return {
        ...line,

        sourceSnapshot: {
          ...currentSnapshot,

          ...(currentSampleTypes.length === 0
            ? {
                ...(fallback.sampleType != null
                  ? { sampleType: fallback.sampleType }
                  : {}),

                ...(fallback.sampleTypes != null
                  ? { sampleTypes: fallback.sampleTypes }
                  : {}),
              }
            : {}),

          ...(!currentLotNo
            ? {
                ...(fallback.lotNo != null ? { lotNo: fallback.lotNo } : {}),

                ...(fallback.lotBatchNo != null
                  ? { lotBatchNo: fallback.lotBatchNo }
                  : {}),
              }
            : {}),
        },
      };
    });
  }

  private uniqueText(values: Array<string | null | undefined>) {
    return Array.from(
      new Set(
        values

          .map((value) => String(value ?? '').trim())

          .filter(Boolean),
      ),
    );
  }

  private groupInvoiceLines(
    lines: any[],

    extraCharges: any[] = [],
  ): PdfReportRow[] {
    const groups = new Map<
      string,
      PdfReportRow & {
        rawSampleTypes: string[];

        rawItems: string[];

        rawTests: string[];

        rawExtraCharges: Array<{
          name: string;
          amount: number;
        }>;
      }
    >();

    for (const line of lines) {
      const key = `${line.sourceType}:${line.sourceId}`;

      let group = groups.get(key);

      if (!group) {
        group = {
          key,

          formType: String(line.formType ?? ''),

          department: this.reportDepartment(line),

          formNumber: String(line.formNumber ?? ''),

          reportNumber: String(line.reportNumber ?? ''),

          resultSentToClientAt: line.resultSentToClientAt ?? null,

          lotNo: this.sourceLotNo(line.sourceSnapshot),

          description: this.sourceDescription(line.sourceSnapshot),

          sampleTypes: [],

          testLabels: [],

          itemLabels: [],

          extraCharges: [],

          baseAmount: 0,

          rawSampleTypes: [],

          rawTests: [],

          rawItems: [],

          rawExtraCharges: [],

          amount: 0,

          manualOverride: false,
        };

        groups.set(key, group);
      }

      if (!group.description) {
        group.description = this.sourceDescription(line.sourceSnapshot);
      }

      if (!group.lotNo) {
        group.lotNo = this.sourceLotNo(line.sourceSnapshot);
      }

      if (!group.resultSentToClientAt && line.resultSentToClientAt) {
        group.resultSentToClientAt = line.resultSentToClientAt;
      }

      group.rawSampleTypes.push(...this.sourceSampleTypes(line.sourceSnapshot));

      group.rawTests.push(String(line.testLabel || line.testKey || ''));

      const itemLabel = String(line.itemLabel || line.itemKey || '').trim();

      if (itemLabel) {
        group.rawItems.push(itemLabel.replace(/_/g, ' '));
      } else if (line.activeCount != null) {
        const count = Number(line.activeCount);

        group.rawItems.push(`${count} active${count === 1 ? '' : 's'}`);
      }

      const lineAmount = Number(line.amount ?? 0);

      group.baseAmount += lineAmount;

      group.amount += lineAmount;

      group.manualOverride =
        group.manualOverride || Boolean(line.manualOverride);
    }

    for (const charge of extraCharges) {
      const key = `${charge.sourceType}:${charge.sourceId}`;

      const group = groups.get(key);

      if (!group) {
        continue;
      }

      const chargeName =
        String(charge.name ?? '').trim() || 'Additional Charge';

      const chargeAmount = Number(charge.amount ?? 0);

      group.rawExtraCharges.push({
        name: chargeName,
        amount: chargeAmount,
      });

      group.amount += chargeAmount;
    }

    return [...groups.values()]

      .map((group) => {
        const {
          rawSampleTypes,

          rawItems,

          rawTests,

          rawExtraCharges,

          ...row
        } = group;

        return {
          ...row,

          sampleTypes: this.uniqueText(rawSampleTypes),

          testLabels: this.uniqueText(rawTests),

          itemLabels: this.uniqueText(rawItems),

          extraCharges: rawExtraCharges,
        };
      })

      .sort((a, b) => {
        const formCompare = a.formNumber.localeCompare(b.formNumber);

        if (formCompare !== 0) {
          return formCompare;
        }

        return a.reportNumber.localeCompare(b.reportNumber);
      });
  }

  /* =========================================================

     TABLE HEADER

  ========================================================= */

  private drawReportSectionHeader(
    page: PDFPage,

    y: number,

    title: string,

    font: PDFFont,
  ) {
    const height = 22;

    page.drawRectangle({
      x: LEFT,

      y: y - height + 4,

      width: PAGE_WIDTH - LEFT - RIGHT,

      height,

      color: rgb(0.88, 0.92, 0.97),
    });

    page.drawText(title, {
      x: LEFT + 6,

      y: y - 10,

      size: 8.2,

      font,

      color: rgb(0.12, 0.24, 0.4),
    });

    return y - height;
  }

  private drawTableHeader(
    page: PDFPage,

    y: number,

    font: PDFFont,
  ) {
    const rowHeight = 22;

    page.drawRectangle({
      x: LEFT,

      y: y - rowHeight + 4,

      width: PAGE_WIDTH - LEFT - RIGHT,

      height: rowHeight,

      color: rgb(
        0.94,

        0.94,

        0.94,
      ),
    });

    page.drawText('Form No.', {
      x: LEFT + 4,

      y: y - 10,

      size: 6.9,

      font,
    });

    page.drawText('Result Sent Date', {
      x: 100,

      y: y - 10,

      size: 5.8,

      font,
    });

    page.drawText('Description', {
      x: 158,

      y: y - 10,

      size: 6.4,

      font,
    });

    page.drawText('Type of Test', {
      x: 286,

      y: y - 10,

      size: 5.9,

      font,
    });

    page.drawText('Sample Type', {
      x: 340,

      y: y - 10,

      size: 5.5,

      font,
    });

    page.drawText('Lot No.', {
      x: 390,

      y: y - 10,

      size: 5.7,

      font,
    });

    page.drawText(
      'Pathogens / Actives / COA',

      {
        x: 422,

        y: y - 10,

        size: 5.25,

        font,
      },
    );

    this.drawRight(
      page,

      'Amount',

      PAGE_WIDTH - RIGHT - 12,

      y - 10,

      6.8,

      font,
    );

    return y - rowHeight;
  }

  private drawManualTableHeader(
    page: PDFPage,

    y: number,

    font: PDFFont,
  ) {
    const rowHeight = 22;

    page.drawRectangle({
      x: LEFT,

      y: y - rowHeight + 4,

      width: PAGE_WIDTH - LEFT - RIGHT,

      height: rowHeight,

      color: rgb(
        0.94,

        0.94,

        0.94,
      ),
    });

    page.drawText('Description', {
      x: LEFT + 4,

      y: y - 10,

      size: 7.2,

      font,
    });

    this.drawRight(
      page,

      'Qty',

      385,

      y - 10,

      7.2,

      font,
    );

    this.drawRight(
      page,

      'Unit Price',

      470,

      y - 10,

      7.2,

      font,
    );

    this.drawRight(
      page,

      'Amount',

      PAGE_WIDTH - RIGHT - 4,

      y - 10,

      7.2,

      font,
    );

    return y - rowHeight;
  }

  /* =========================================================

     BUILD PDF

  ========================================================= */

  private async buildPdf(invoice: any) {
    const pdf = await PDFDocument.create();

    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const fonts = {
      regular,

      bold,
    };

    /*

     * Make regenerated bytes stable relative

     * to the confirmed invoice.

     */

    const documentDate = invoice.confirmedAt ?? invoice.createdAt ?? new Date();

    pdf.setTitle(`Invoice ${invoice.invoiceNumber}`);

    pdf.setAuthor(COMPANY_NAME);

    pdf.setSubject(`Invoice ${invoice.invoiceNumber}`);

    pdf.setCreator('OMEGA LIMS');

    pdf.setProducer('OMEGA LIMS');

    pdf.setCreationDate(documentDate);

    pdf.setModificationDate(documentDate);

    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    let y = this.drawHeader(
      page,

      fonts,

      invoice.invoiceNumber,

      invoice.revisionNumber ?? 0,
    );

    /* =====================================================

       BILL TO / INVOICE INFO

    ===================================================== */

    page.drawText('BILL TO', {
      x: LEFT,

      y,

      size: 9,

      font: bold,
    });

    page.drawText('INVOICE DETAILS', {
      x: 355,

      y,

      size: 9,

      font: bold,
    });

    y -= 16;

    const billTo = [
      invoice.clientLegalName || invoice.clientName || invoice.clientCode,

      invoice.billingContactName,

      invoice.billingAddressLine1,

      invoice.billingAddressLine2,

      [invoice.billingCity, invoice.billingState, invoice.billingPostalCode]

        .filter(Boolean)

        .join(', '),

      invoice.billingCountry,

      invoice.billingEmail,

      invoice.billingPhone,
    ].filter(Boolean);

    let billY = y;

    for (const line of billTo) {
      page.drawText(this.truncate(String(line), 48), {
        x: LEFT,

        y: billY,

        size: 8.5,

        font: regular,
      });

      billY -= 12;
    }

    const endDisplay = new Date(invoice.periodEnd.getTime() - 1);

    /*

     * Use the actual send date when available.

     *

     * For a scheduled invoice, use the scheduled send date.

     * For a CONFIRMED invoice that has not yet been sent/scheduled,

     * use the confirmation date so the PDF still shows an exact date.

     */

    const paymentStartDate =
      invoice.sentAt ??
      invoice.scheduledSendAt ??
      invoice.confirmedAt ??
      invoice.createdAt;

    const exactDueDate =
      invoice.dueDate ??
      this.addDays(
        paymentStartDate,

        30,
      );

    const sixtyDayDate = this.addDays(
      paymentStartDate,

      60,
    );

    const detailRows = [
      ['Invoice No.', invoice.invoiceNumber],

      ['Invoice Date', this.formatDate(invoice.confirmedAt)],

      ...(invoice.invoiceKind === 'REPORT'
        ? [
            [
              'Billing Period',

              `${this.formatDate(invoice.periodStart)} - ${this.formatDate(
                endDisplay,
              )}`,
            ],
          ]
        : []),

      ['Due Date', this.formatDate(exactDueDate)],
    ];

    let detailY = y;

    /*

     * Keep every separator "-" in the exact same vertical column:

     *

     * Invoice No.      -  INV-20260003

     * Invoice Date     -  Aug 19, 2026

     * Billing Period   -  Aug 01, 2026 - Aug 31, 2026

     * Due Date         -  Sep 18, 2026

     */

    const detailLabelX = 355;

    const detailDashX = 421;

    const detailValueX = 432;

    for (const [label, value] of detailRows) {
      page.drawText(label, {
        x: detailLabelX,

        y: detailY,

        size: 8,

        font: bold,
      });

      page.drawText('-', {
        x: detailDashX,

        y: detailY,

        size: 8,

        font: bold,
      });

      page.drawText(this.truncate(String(value), 30), {
        x: detailValueX,

        y: detailY,

        size: 8,

        font: regular,
      });

      detailY -= 13;
    }

    /*

     * Payment notice is shown directly inside INVOICE DETAILS.

     *

     * Requested layout:

     *

     * Notes:   2% additional charge ... (date).

     *          3% additional charge ... (date).

     */

    detailY -= 3;

    const notesLabelX = 355;

    const notesTextX = 390;

    const notesFontSize = 6.8;

    page.drawText('Notes:', {
      x: notesLabelX,

      y: detailY,

      size: 8,

      font: bold,
    });

    const invoiceNoticeLines = [
      `2% additional charge for payment over 30 days (${this.formatDate(
        exactDueDate,
      )}).`,

      `3% additional charge for payment over 60 days (${this.formatDate(
        sixtyDayDate,
      )}).`,
    ];

    for (const notice of invoiceNoticeLines) {
      const wrappedNotice = this.wrapText(notice, 48);

      for (const line of wrappedNotice) {
        page.drawText(line, {
          x: notesTextX,

          y: detailY,

          size: notesFontSize,

          font: regular,
        });

        detailY -= 9;
      }
    }

    y = Math.min(billY, detailY) - 14;

    /* =====================================================
       BILLING BASIS NOTICE - FIRST PAGE ONLY
    ===================================================== */

    if (invoice.invoiceKind === 'REPORT') {
      const noticeHeight = 38;

      const noticeRed = rgb(0.72, 0.08, 0.08);

      const noticeBackground = rgb(1, 0.95, 0.95);

      page.drawRectangle({
        x: LEFT,

        y: y - noticeHeight,

        width: PAGE_WIDTH - LEFT - RIGHT,

        height: noticeHeight,

        color: noticeBackground,

        borderColor: noticeRed,

        borderWidth: 0.7,
      });

      page.drawText('BILLING BASIS NOTICE', {
        x: LEFT + 8,

        y: y - 12,

        size: 7.8,

        font: bold,

        color: noticeRed,
      });

      const billingBasisLines = this.wrapText(
        'The billing reports listed below are billed based on their Result Sent Date within this billing period.',

        92,
      );

      billingBasisLines.slice(0, 2).forEach((line, index) => {
        page.drawText(line, {
          x: LEFT + 8,

          y: y - 24 - index * 9,

          size: 7.2,

          font: regular,

          color: noticeRed,
        });
      });

      y -= noticeHeight + 12;
    }

    page.drawLine({
      start: {
        x: LEFT,

        y,
      },

      end: {
        x: PAGE_WIDTH - RIGHT,

        y,
      },

      thickness: 0.6,
    });

    y -= 14;

    /* =====================================================

       LINES

    ===================================================== */

    const reportRows =
      invoice.invoiceKind === 'REPORT'
        ? this.groupInvoiceLines(
            invoice.lines,

            invoice.extraCharges ?? [],
          )
        : [];

    const previousMonthManualLines =
      invoice.invoiceKind === 'REPORT'
        ? (invoice.manualLines ?? []).filter((line: any) =>
            String(line?.description ?? '').startsWith(
              PREVIOUS_MONTH_MANUAL_PREFIX,
            ),
          )
        : [];

    if (invoice.invoiceKind === 'MANUAL') {
      y = this.drawManualTableHeader(
        page,

        y,

        bold,
      );

      for (const line of invoice.manualLines ?? []) {
        const descriptionLines = this.wrapText(
          line.description || '—',

          62,
        );

        const rowHeight = Math.max(
          28,

          11 +
            Math.max(
              descriptionLines.length,

              1,
            ) *
              9,
        );

        if (y < BOTTOM + 12 + rowHeight) {
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

          // Continuation pages intentionally omit the full invoice header.

          y = PAGE_HEIGHT - TOP;

          y = this.drawManualTableHeader(
            page,

            y,

            bold,
          );
        }

        const textTop = y - 13;

        descriptionLines.forEach((descriptionLine, index) => {
          page.drawText(
            descriptionLine,

            {
              x: LEFT + 4,

              y: textTop - index * 9,

              size: 7.2,

              font: regular,
            },
          );
        });

        this.drawRight(
          page,

          String(line.quantity),

          385,

          textTop,

          7.2,

          regular,
        );

        this.drawRight(
          page,

          this.money(Number(line.unitPrice)),

          470,

          textTop,

          7.2,

          regular,
        );

        this.drawRight(
          page,

          this.money(Number(line.amount)),

          PAGE_WIDTH - RIGHT - 4,

          textTop,

          7.3,

          regular,
        );

        page.drawLine({
          start: {
            x: LEFT,

            y: y - rowHeight,
          },

          end: {
            x: PAGE_WIDTH - RIGHT,

            y: y - rowHeight,
          },

          thickness: 0.25,

          color: rgb(
            0.75,

            0.75,

            0.75,
          ),
        });

        y -= rowHeight;
      }
    } else {
      const reportSections = [
        {
          title: 'MICROBIOLOGY',

          rows: reportRows.filter((row) => row.department === 'MICROBIOLOGY'),
        },

        {
          title: 'CHEMISTRY',

          rows: reportRows.filter((row) => row.department === 'CHEMISTRY'),
        },
      ].filter((section) => section.rows.length > 0);

      for (
        let sectionIndex = 0;
        sectionIndex < reportSections.length;
        sectionIndex += 1
      ) {
        const section = reportSections[sectionIndex];

        /*
         * Keep Microbiology and Chemistry visually separate.
         *
         * When both departments exist on the same invoice, Chemistry
         * always starts on a fresh page even if there is still room
         * below the Microbiology section.
         */
        const startChemistryOnFreshPage =
          section.title === 'CHEMISTRY' && sectionIndex > 0;

        if (startChemistryOnFreshPage || y < BOTTOM + 175) {
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

          // Continuation pages intentionally omit the full invoice header.

          y = PAGE_HEIGHT - TOP;
        }

        y = this.drawReportSectionHeader(
          page,

          y,

          section.title,

          bold,
        );

        y = this.drawTableHeader(
          page,

          y,

          bold,
        );

        for (const row of section.rows) {
          /*

           * Description is intentionally unlimited.

           *

           * Do not slice/truncate wrapped lines. The invoice row height

           * expands based on the full content so the PDF never silently

           * drops the sample type, description, test, or billed item.

           */

          const lotNoLines = this.wrapText(
            row.lotNo || '-',

            5,
          );

          const sampleTypeLines =
            row.sampleTypes.length > 0
              ? row.sampleTypes.flatMap((label) =>
                  this.wrapText(
                    label,

                    7,
                  ),
                )
              : ['-'];

          const descriptionLines = this.wrapText(
            row.description || '-',

            27,
          );

          const testLines =
            row.testLabels.length > 0
              ? row.testLabels.flatMap((label) =>
                  this.wrapText(
                    label,

                    8,
                  ),
                )
              : ['-'];

          const baseItemLines =
            row.itemLabels.length > 0
              ? row.itemLabels.flatMap((label) =>
                  this.wrapText(
                    label,

                    10,
                  ),
                )
              : ['Type of Test only'];

          /*
           * Additional charges are rendered as their own child rows
           * immediately below this form. Keep the normal testing row
           * focused on the actual test/pathogen/active/COA charge.
           */
          const itemLines = baseItemLines;

          const contentLineCount = Math.max(
            lotNoLines.length,

            sampleTypeLines.length,

            descriptionLines.length,

            testLines.length,

            itemLines.length,

            1,
          );

          const rowHeight = Math.max(
            28,

            11 + contentLineCount * 9,
          );

          /*
           * Keep the parent form and its first additional charge together.
           * This prevents an additional charge from starting alone on the
           * next page and looking like a separate form.
           */
          const firstExtraChargeHeight =
            row.extraCharges.length > 0
              ? Math.max(
                  19,
                  9 +
                    Math.max(
                      this.wrapText(
                        row.extraCharges[0].name || 'Additional Charge',
                        38,
                      ).length,
                      1,
                    ) *
                      9,
                )
              : 0;

          /*
           * Fill continuation pages close to the footer. The footer divider
           * is at y=31 and BOTTOM is 44, so 12pt beyond BOTTOM leaves a safe
           * printable gap without wasting roughly 125pt on every page.
           */
          if (y < BOTTOM + 12 + rowHeight + firstExtraChargeHeight) {
            page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

            // Continuation pages intentionally omit the full invoice header.

            y = PAGE_HEIGHT - TOP;

            y = this.drawReportSectionHeader(
              page,

              y,

              `${section.title} (CONTINUED)`,

              bold,
            );

            y = this.drawTableHeader(
              page,

              y,

              bold,
            );
          }

          const textTop = y - 13;

          const formText = row.manualOverride
            ? `${row.formNumber} *`
            : row.formNumber;

          page.drawText(
            this.truncate(
              formText,

              13,
            ),

            {
              x: LEFT + 4,

              y: textTop,

              size: 6.8,

              font: regular,
            },
          );

          page.drawText(
            this.formatDate(row.resultSentToClientAt) || '-',

            {
              x: 100,

              y: textTop,

              size: 5.9,

              font: regular,
            },
          );

          const resultSentTime = row.resultSentToClientAt
            ? new Date(row.resultSentToClientAt).getTime()
            : Number.NaN;
          const isPreviousMonthImported =
            Number.isFinite(resultSentTime) &&
            resultSentTime < new Date(invoice.periodStart).getTime();

          if (isPreviousMonthImported) {
            page.drawText('PRIOR MONTH', {
              x: 100,
              y: textTop - 8,
              size: 4.8,
              font: bold,
              color: rgb(0.72, 0.42, 0.04),
            });
          }

          descriptionLines.forEach((line, index) => {
            page.drawText(line, {
              x: 158,

              y: textTop - index * 9,

              size: 6.2,

              font: regular,
            });
          });

          testLines.forEach((line, index) => {
            page.drawText(line, {
              x: 286,

              y: textTop - index * 9,

              size: 5.9,

              font: regular,
            });
          });

          sampleTypeLines.forEach((line, index) => {
            page.drawText(line, {
              x: 340,

              y: textTop - index * 9,

              size: 5.6,

              font: regular,
            });
          });

          lotNoLines.forEach((line, index) => {
            page.drawText(line, {
              x: 390,

              y: textTop - index * 9,

              size: 5.6,

              font: regular,
            });
          });

          itemLines.forEach((line, index) => {
            page.drawText(
              `- ${line}`,

              {
                x: 422,

                y: textTop - index * 9,

                size: 5.8,

                font: regular,
              },
            );
          });

          const rowAmountRight = PAGE_WIDTH - RIGHT - 12;
          const rowAmountText = this.money(row.baseAmount);

          if (isPreviousMonthImported) {
            const amountWidth = Math.max(
              44,
              bold.widthOfTextAtSize(rowAmountText, 7.0) + 10,
            );

            page.drawRectangle({
              x: rowAmountRight - amountWidth,
              y: textTop - 3,
              width: amountWidth,
              height: 11,
              color: rgb(1, 0.93, 0.93),
              borderColor: rgb(0.82, 0.18, 0.18),
              borderWidth: 0.45,
            });

            this.drawRight(
              page,
              rowAmountText,
              rowAmountRight - 4,
              textTop,
              7.0,
              bold,
              { color: rgb(0.72, 0.08, 0.08) },
            );
          } else {
            this.drawRight(
              page,
              rowAmountText,
              rowAmountRight,
              textTop,
              7.0,
              regular,
            );
          }

          /*
           * Do not draw a divider between a form and its additional
           * charge(s). The whole block should read as one invoice item.
           * If there are no additional charges, close the form normally.
           */
          if (row.extraCharges.length === 0) {
            page.drawLine({
              start: {
                x: LEFT,
                y: y - rowHeight,
              },
              end: {
                x: PAGE_WIDTH - RIGHT,
                y: y - rowHeight,
              },
              thickness: 0.25,
              color: rgb(0.75, 0.75, 0.75),
            });
          }

          y -= rowHeight;

          /* =================================================
             REPORT-LEVEL ADDITIONAL CHARGES
             -------------------------------------------------
             Render every additional charge as a separate,
             clearly identified child row under its form.
             The department totals below still use row.amount,
             which includes these charges exactly once.
          ================================================= */
          for (const extraCharge of row.extraCharges) {
            const chargeNameLines = this.wrapText(
              extraCharge.name || 'Additional Charge',
              38,
            );

            const chargeRowHeight = Math.max(
              19,
              9 + Math.max(chargeNameLines.length, 1) * 9,
            );

            if (y < BOTTOM + 12 + chargeRowHeight) {
              page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

              y = PAGE_HEIGHT - TOP;

              y = this.drawReportSectionHeader(
                page,
                y,
                `${section.title} (CONTINUED)`,
                bold,
              );

              y = this.drawTableHeader(page, y, bold);
            }

            const chargeTop = y - 11;

            /*
             * Keep the charge visually attached to the form above.
             *
             * Do NOT render a full-width shaded/table row because that
             * makes the charge look like another report/form. Instead,
             * leave the Form No./Result Date columns empty and indent a
             * compact child line beneath the parent form.
             */
            const childLeft = 202;
            const childBottom = y - chargeRowHeight;

            // Small connector showing this line belongs to the form above.
            page.drawLine({
              start: { x: childLeft, y: y + 1 },
              end: { x: childLeft, y: chargeTop - 1 },
              thickness: 0.55,
              color: rgb(0.72, 0.76, 0.82),
            });

            page.drawLine({
              start: { x: childLeft, y: chargeTop - 1 },
              end: { x: childLeft + 8, y: chargeTop - 1 },
              thickness: 0.55,
              color: rgb(0.72, 0.76, 0.82),
            });

            page.drawText('Additional charge:', {
              x: childLeft + 12,
              y: chargeTop,
              size: 6.3,
              font: bold,
              color: rgb(0.28, 0.36, 0.48),
            });

            chargeNameLines.forEach((line, index) => {
              page.drawText(line, {
                x: 270,
                y: chargeTop - index * 9,
                size: 6.5,
                font: regular,
              });
            });

            this.drawRight(
              page,
              `+${this.money(Number(extraCharge.amount ?? 0))}`,
              PAGE_WIDTH - RIGHT - 12,
              chargeTop,
              6.9,
              bold,
            );

            // No divider between the parent form and child charges, or
            // between multiple child charges. They remain one visual block.
            y -= chargeRowHeight;
          }

          /*
           * Draw one divider only after the final additional charge so the
           * parent form + all of its charges are visually grouped together.
           */
          if (row.extraCharges.length > 0) {
            page.drawLine({
              start: {
                x: LEFT,
                y,
              },
              end: {
                x: PAGE_WIDTH - RIGHT,
                y,
              },
              thickness: 0.25,
              color: rgb(0.75, 0.75, 0.75),
            });
          }
        }

        y -= 10;
      }

      if (previousMonthManualLines.length > 0) {
        if (y < BOTTOM + 90) {
          page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - TOP;
        }

        y = this.drawReportSectionHeader(
          page,
          y,
          'LAST MONTH PENDING - MANUAL',
          bold,
        );

        page.drawText('Charge Name', {
          x: LEFT + 6,
          y: y - 11,
          size: 6.8,
          font: bold,
          color: rgb(0.32, 0.36, 0.42),
        });
        this.drawRight(
          page,
          'Amount',
          PAGE_WIDTH - RIGHT - 8,
          y - 11,
          6.8,
          bold,
        );
        y -= 22;

        for (const line of previousMonthManualLines) {
          const description =
            String(line.description ?? '')
              .replace(PREVIOUS_MONTH_MANUAL_PREFIX, '')
              .trim() || 'Previous-month pending charge';
          const descriptionLines = this.wrapText(description, 70);
          const rowHeight = Math.max(22, 9 + descriptionLines.length * 9);

          if (y < BOTTOM + 12 + rowHeight) {
            page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            y = PAGE_HEIGHT - TOP;
            y = this.drawReportSectionHeader(
              page,
              y,
              'LAST MONTH PENDING - MANUAL (CONTINUED)',
              bold,
            );
          }

          const textTop = y - 11;
          descriptionLines.forEach((descriptionLine, index) => {
            page.drawText(descriptionLine, {
              x: LEFT + 8,
              y: textTop - index * 9,
              size: 7.0,
              font: regular,
            });
          });

          const manualLastMonthAmount = this.money(Number(line.amount ?? 0));
          const manualLastMonthAmountRight = PAGE_WIDTH - RIGHT - 8;
          const manualLastMonthAmountWidth = Math.max(
            48,
            bold.widthOfTextAtSize(manualLastMonthAmount, 7.2) + 10,
          );

          page.drawRectangle({
            x: manualLastMonthAmountRight - manualLastMonthAmountWidth,
            y: textTop - 3,
            width: manualLastMonthAmountWidth,
            height: 11,
            color: rgb(1, 0.93, 0.93),
            borderColor: rgb(0.82, 0.18, 0.18),
            borderWidth: 0.45,
          });

          this.drawRight(
            page,
            manualLastMonthAmount,
            manualLastMonthAmountRight - 4,
            textTop,
            7.2,
            bold,
            { color: rgb(0.72, 0.08, 0.08) },
          );

          page.drawLine({
            start: { x: LEFT, y: y - rowHeight },
            end: { x: PAGE_WIDTH - RIGHT, y: y - rowHeight },
            thickness: 0.25,
            color: rgb(0.78, 0.78, 0.78),
          });

          y -= rowHeight;
        }

        y -= 10;
      }
    }

    /* =====================================================

       TOTALS

    ===================================================== */

    if (y < BOTTOM + 170) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

      // Continuation pages intentionally omit the full invoice header.

      y = PAGE_HEIGHT - TOP;
    }

    y -= 18;

    const labelX = 390;

    const amountRight = PAGE_WIDTH - RIGHT;

    const subtotal = Number(invoice.subtotal);

    const adjustment = Number(invoice.adjustmentAmount);

    const total = Number(invoice.total);

    if (invoice.invoiceKind === 'REPORT') {
      /*
       * Department totals are calculated from the grouped PDF rows.
       * Each grouped row already includes its report-level additional
       * charges, so these totals reconcile to the report subtotal.
       */
      const microbiologyTotal = reportRows
        .filter((row) => row.department === 'MICROBIOLOGY')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

      const chemistryTotal = reportRows
        .filter((row) => row.department === 'CHEMISTRY')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

      page.drawText('Microbiology Total', {
        x: labelX,

        y,

        size: 9,

        font: regular,
      });

      this.drawRight(
        page,
        this.money(microbiologyTotal),
        amountRight,
        y,
        9,
        regular,
      );

      y -= 17;

      page.drawText('Chemistry Total', {
        x: labelX,

        y,

        size: 9,

        font: regular,
      });

      this.drawRight(
        page,
        this.money(chemistryTotal),
        amountRight,
        y,
        9,
        regular,
      );

      y -= 17;

      const previousMonthManualTotal = previousMonthManualLines.reduce(
        (sum: number, line: any) => sum + Number(line.amount ?? 0),
        0,
      );

      if (previousMonthManualTotal !== 0) {
        page.drawRectangle({
          x: labelX - 5,
          y: y - 4,
          width: amountRight - labelX + 7,
          height: 15,
          color: rgb(1, 0.93, 0.93),
          borderColor: rgb(0.82, 0.18, 0.18),
          borderWidth: 0.45,
        });

        page.drawText('Last Month Pending Charges', {
          x: labelX,
          y,
          size: 9,
          font: bold,
          color: rgb(0.72, 0.08, 0.08),
        });

        this.drawRight(
          page,
          this.money(previousMonthManualTotal),
          amountRight - 3,
          y,
          9,
          bold,
          { color: rgb(0.72, 0.08, 0.08) },
        );

        y -= 17;
      }

      /*
       * Keep the invoice-level adjustment visible when it changes
       * the final amount. It is not a fourth department total; it
       * simply explains the difference between department totals
       * and the final invoice TOTAL.
       */
      if (adjustment !== 0) {
        page.drawText('Adjustment', {
          x: labelX,

          y,

          size: 9,

          font: regular,
        });

        const adjustmentText =
          adjustment < 0
            ? `-${this.money(Math.abs(adjustment))}`
            : this.money(adjustment);

        this.drawRight(page, adjustmentText, amountRight, y, 9, regular);

        y -= 17;
      }
    } else {
      /*
       * Manual invoices do not have Microbiology/Chemistry
       * report sections, so retain the original subtotal layout.
       */
      page.drawText('Subtotal', {
        x: labelX,

        y,

        size: 9,

        font: regular,
      });

      this.drawRight(page, this.money(subtotal), amountRight, y, 9, regular);

      y -= 17;

      page.drawText('Adjustment', {
        x: labelX,

        y,

        size: 9,

        font: regular,
      });

      const adjustmentText =
        adjustment < 0
          ? `-${this.money(Math.abs(adjustment))}`
          : this.money(adjustment);

      this.drawRight(page, adjustmentText, amountRight, y, 9, regular);

      y -= 17;
    }

    page.drawLine({
      start: {
        x: labelX,

        y,
      },

      end: {
        x: amountRight,

        y,
      },

      thickness: 0.8,
    });

    y -= 18;

    page.drawText('TOTAL', {
      x: labelX,

      y,

      size: 11,

      font: bold,
    });

    this.drawRight(page, this.money(total), amountRight, y, 11, bold);

    /* =====================================================

       NOTES

    ===================================================== */

    y -= 40;

    if (y < BOTTOM + 120) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

      // Continuation pages intentionally omit the full invoice header.

      y = PAGE_HEIGHT - TOP;
    }

    if (reportRows.some((row) => row.manualOverride)) {
      page.drawText(
        '* Price manually overridden and recorded in the invoice audit trail.',

        {
          x: LEFT,

          y,

          size: 7.5,

          font: regular,
        },
      );

      y -= 16;
    }

    if (invoice.notes) {
      const notes = String(invoice.notes);
      const noteLines = this.wrapText(notes, 84).slice(0, 8);
      const notesBoxHeight = 25 + noteLines.length * 11;

      if (y - notesBoxHeight < BOTTOM + 8) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - TOP;
      }

      page.drawRectangle({
        x: LEFT,
        y: y - notesBoxHeight + 7,
        width: PAGE_WIDTH - LEFT - RIGHT,
        height: notesBoxHeight,
        color: rgb(1, 0.94, 0.94),
        borderColor: rgb(0.78, 0.08, 0.08),
        borderWidth: 0.9,
      });

      page.drawText('IMPORTANT NOTES', {
        x: LEFT + 8,
        y: y - 7,
        size: 8.5,
        font: bold,
        color: rgb(0.72, 0.08, 0.08),
      });

      let noteY = y - 21;
      for (const line of noteLines) {
        page.drawText(line, {
          x: LEFT + 8,
          y: noteY,
          size: 8,
          font: regular,
          color: rgb(0.72, 0.08, 0.08),
        });
        noteY -= 11;
      }

      y -= notesBoxHeight + 6;
    }

    /* =====================================================

       FOOTERS

    ===================================================== */

    const pages = pdf.getPages();

    pages.forEach((currentPage, index) => {
      currentPage.drawLine({
        start: {
          x: LEFT,

          y: 31,
        },

        end: {
          x: PAGE_WIDTH - RIGHT,

          y: 31,
        },

        thickness: 0.4,

        color: rgb(0.75, 0.75, 0.75),
      });

      currentPage.drawText(`Invoice ${invoice.invoiceNumber}`, {
        x: LEFT,

        y: 18,

        size: 7,

        font: regular,
      });

      this.drawRight(
        currentPage,

        `Page ${index + 1} of ${pages.length}`,

        PAGE_WIDTH - RIGHT,

        18,

        7,

        regular,
      );
    });

    const bytes = await pdf.save();

    return Buffer.from(bytes);
  }

  private wrapText(text: string, maxChars: number) {
    const words = String(text ?? '')
      .trim()

      .split(/\s+/)

      .filter(Boolean);

    if (!words.length) {
      return [];
    }

    const result: string[] = [];

    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;

      if (next.length > maxChars && current) {
        result.push(current);

        current = word;
      } else {
        current = next;
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  /* =========================================================

     AUDIT

  ========================================================= */

  private async audit(
    user: AuthUser,

    invoice: {
      id: string;

      clientCode: string;

      invoiceNumber: string | null;
    },

    changes: Record<string, any>,

    isRegeneration = false,
  ) {
    const ctx = getRequestContext();

    await this.prisma.auditTrail.create({
      data: {
        action: 'INVOICE_PDF_GENERATED',

        entity: 'BILLING_INVOICE',

        entityId: invoice.id,

        userId: user.userId,

        role: user.role,

        ipAddress: ctx?.ip ?? null,

        clientCode: invoice.clientCode,

        details: `${
          isRegeneration ? 'Regenerated' : 'Generated'
        } PDF for ${invoice.invoiceNumber}`,

        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  /* =========================================================

     GENERATE + STORE

  ========================================================= */

  async generate(user: AuthUser, invoiceId: string) {
    this.assertManager(user);

    return this.generateInternal(user, invoiceId);
  }

  async generateForDelivery(user: AuthUser, invoiceId: string) {
    this.assertReader(user);

    return this.generateInternal(user, invoiceId);
  }

  private async generateInternal(user: AuthUser, invoiceId: string) {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        id: invoiceId,
      },

      include: {
        lines: {
          orderBy: [
            {
              formNumber: 'asc',
            },

            {
              testKey: 'asc',
            },

            {
              itemKey: 'asc',
            },
          ],
        },

        manualLines: {
          orderBy: {
            createdAt: 'asc',
          },
        },

        extraCharges: {
          orderBy: [
            {
              formNumber: 'asc',
            },

            {
              createdAt: 'asc',
            },
          ],
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    /*

     * Official PDF lifecycle:

     *

     * CONFIRMED -> PDF may be generated or regenerated.

     * SENT      -> PDF is frozen and cannot be regenerated.

     *

     * This guarantees that the PDF attached/sent to the client

     * remains the permanent historical version after delivery.

     */

    if (invoice.status !== 'CONFIRMED') {
      throw new BadRequestException(
        invoice.status === 'SENT'
          ? 'Sent invoice PDF is final and cannot be regenerated'
          : 'Invoice PDF can only be generated after confirmation',
      );
    }

    if (!invoice.invoiceNumber) {
      throw new BadRequestException(
        'Confirmed invoice is missing invoiceNumber',
      );
    }

    /*

     * While CONFIRMED, an existing PDF is intentionally

     * replaceable. We rebuild it from the current confirmed

     * invoice data and store the new checksum/timestamp.

     *

     * Once the invoice becomes SENT, the status guard above

     * freezes the PDF permanently.

     */

    const isRegeneration = Boolean(
      invoice.pdfStorageKey &&
        invoice.pdfFilename &&
        invoice.pdfChecksum &&
        invoice.pdfCreatedAt,
    );

    /*

     * Never generate an official PDF with

     * unresolved pricing.

     */

    if (invoice.invoiceKind === 'MANUAL' && invoice.manualLines.length === 0) {
      throw new BadRequestException('Manual invoice has no invoice items');
    }

    const unresolved =
      invoice.invoiceKind === 'REPORT'
        ? invoice.lines.filter(
            (line) =>
              !!line.pricingIssue ||
              line.unitPrice == null ||
              line.amount == null,
          )
        : [];

    if (unresolved.length) {
      throw new BadRequestException(
        'Invoice contains unresolved pricing and cannot generate PDF',
      );
    }

    const pdfLines =
      invoice.invoiceKind === 'REPORT'
        ? await this.enrichInvoiceLineDisplayFields(invoice.lines)
        : invoice.lines;

    const bytes = await this.buildPdf({
      ...invoice,

      lines: pdfLines,
    });

    const checksum = createHash('sha256').update(bytes).digest('hex');

    /*
     * Invoice numbers now use INV-YYYYNNNN, for example:
     *
     *   INV-20260003
     *   INV-20260003-R1
     *
     * Keep PDF storage grouped by the four-digit invoice year.
     * Also retain compatibility with older INV-YYYY-NNNN invoices.
     */
    const invoiceYearMatch = /^INV-(\d{4})(?:\d{4}|-\d{4})(?:-R\d+)?$/i.exec(
      String(invoice.invoiceNumber ?? ''),
    );

    const year = invoiceYearMatch?.[1] || String(new Date().getFullYear());

    const filename = this.safeFilename(`${invoice.invoiceNumber}.pdf`);

    const subdir = `billing/invoices/${year}`;

    const tempPath = join(tmpdir(), `${invoice.id}-${Date.now()}-${filename}`);

    try {
      await writeFile(tempPath, bytes);

      /*

       * IMPORTANT:

       * StorageService.put() returns the REAL stored key.

       *

       * In S3 mode this may contain S3_PREFIX, for example:

       *

       * local/billing/invoices/2026/INV-20260001.pdf

       *

       * Never reconstruct the storage key ourselves.

       */

      const storageKey = await this.storage.put({
        filePath: tempPath,

        filename,

        subdir,
      });

      const now = new Date();

      const updated = await this.prisma.billingInvoice.update({
        where: {
          id: invoice.id,
        },

        data: {
          pdfFilename: filename,

          pdfStorageKey: storageKey,

          /*

           * Leave null for local storage.

           * Set S3_BUCKET in production if you want

           * the bucket recorded on the invoice.

           */

          pdfStorageBucket:
            process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || null,

          pdfChecksum: checksum,

          pdfCreatedAt: now,

          updatedBy: user.userId,
        },
      });

      await this.audit(
        user,

        invoice,

        {
          filename,

          storageKey,

          checksum,

          regenerated: isRegeneration,
        },

        isRegeneration,
      );

      return {
        invoiceId: updated.id,

        invoiceNumber: updated.invoiceNumber,

        filename: updated.pdfFilename,

        storageKey: updated.pdfStorageKey,

        storageBucket: updated.pdfStorageBucket,

        checksum: updated.pdfChecksum,

        createdAt: updated.pdfCreatedAt,

        alreadyExists: false,

        regenerated: isRegeneration,
      };
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  }

  /* =========================================================

     READ STORED PDF

  ========================================================= */

  async getStoredPdf(
    user: AuthUser,

    invoiceId: string,
  ): Promise<{
    filename: string;

    checksum: string | null;

    size: number | null;

    stream: Readable;
  }> {
    this.assertReader(user);

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        id: invoiceId,
      },

      select: {
        id: true,

        invoiceNumber: true,

        pdfFilename: true,

        pdfStorageKey: true,

        pdfChecksum: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!invoice.pdfFilename || !invoice.pdfStorageKey) {
      throw new NotFoundException('Invoice PDF has not been generated');
    }

    console.log('📄 Billing PDF read:', {
      invoiceId: invoice.id,

      invoiceNumber: invoice.invoiceNumber,

      storageKey: invoice.pdfStorageKey,
    });

    try {
      /*

       * IMPORTANT:

       *

       * Do NOT call storage.stat() first.

       *

       * Different storage implementations can return

       * different stat shapes, and we don't need stat

       * in order to stream the PDF.

       */

      const opened: any = await this.storage.createReadStream(
        invoice.pdfStorageKey,
      );

      /*

       * Support BOTH possible StorageService styles:

       *

       * 1.

       * createReadStream() → Readable

       *

       * 2.

       * createReadStream() →

       * {

       *   stream: Readable,

       *   size / contentLength / ContentLength

       * }

       */

      const stream = (opened?.stream ?? opened) as Readable;

      if (!stream || typeof (stream as any).pipe !== 'function') {
        console.error('❌ Invalid StorageService stream result:', opened);

        throw new Error('StorageService did not return a readable stream');
      }

      const rawSize =
        opened?.size ?? opened?.contentLength ?? opened?.ContentLength ?? null;

      const size =
        rawSize != null && Number.isFinite(Number(rawSize))
          ? Number(rawSize)
          : null;

      console.log('✅ Billing PDF stream opened:', {
        storageKey: invoice.pdfStorageKey,

        size,
      });

      return {
        filename: invoice.pdfFilename,

        checksum: invoice.pdfChecksum,

        size,

        stream,
      };
    } catch (error: any) {
      console.error('❌ Billing PDF storage read failed:', {
        invoiceId: invoice.id,

        invoiceNumber: invoice.invoiceNumber,

        storageKey: invoice.pdfStorageKey,

        errorName: error?.name,

        errorMessage: error?.message,

        errorCode: error?.Code ?? error?.code,

        metadata: error?.$metadata,
      });

      throw error;
    }
  }
}
