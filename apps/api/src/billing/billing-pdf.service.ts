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

type PdfReportRow = {
  key: string;
  formNumber: string;
  reportNumber: string;
  description: string;
  testLabels: string[];
  itemLabels: string[];
  extraChargeLabels: string[];
  amount: number;
  manualOverride: boolean;
};

const BILLING_TIME_ZONE =
  process.env.BILLING_TIME_ZONE ||
  'America/New_York';

/*
 * Invoice letterhead.
 *
 * Defaults match the laboratory report header so local
 * development also renders the correct letterhead.
 *
 * Production can override every value from .env.
 */
const COMPANY_NAME =
  process.env.BILLING_COMPANY_NAME ||
  'OMEGA / BIOCHEM LABORATORIES, INC.';

const COMPANY_SUBTITLE =
  process.env.BILLING_COMPANY_SUBTITLE ||
  'FDA REG. | ISO 17025 ACC';

const COMPANY_ADDRESS =
  process.env.BILLING_COMPANY_ADDRESS ||
  process.env.BILLING_COMPANY_ADDRESS_1 ||
  '56 PARK AVENUE, LYNDHURST, NJ 07071';

const COMPANY_ADDRESS_2 =
  process.env.BILLING_COMPANY_ADDRESS_2 ||
  '';

const COMPANY_PHONE =
  process.env.BILLING_COMPANY_PHONE ||
  '(201) 883 1222';

const COMPANY_FAX =
  process.env.BILLING_COMPANY_FAX ||
  '(201) 883 0449';

const COMPANY_EMAIL =
  process.env.BILLING_COMPANY_EMAIL ||
  'lab@omegabiochem.com';

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
      value instanceof Date
        ? new Date(value.getTime())
        : new Date(value);

    date.setDate(
      date.getDate() + days,
    );

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
  ) {
    const width = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
      x: xRight - width,

      y,
      size,
      font,
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

    const width =
      font.widthOfTextAtSize(
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
    let y =
      PAGE_HEIGHT -
      TOP;

    const brandBlue =
      rgb(0, 0.18, 0.78);

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
      COMPANY_PHONE
        ? `Tel: ${COMPANY_PHONE}`
        : '',

      COMPANY_FAX
        ? `Fax: ${COMPANY_FAX}`
        : '',
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
      const emailLabel =
        `Email: ${COMPANY_EMAIL}`;

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
        x:
          PAGE_WIDTH -
          RIGHT,
        y,
      },

      thickness: 0.7,

      color:
        rgb(
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
    const documentTitle =
      revisionNumber > 0
        ? 'REVISED INVOICE'
        : 'INVOICE';

    page.drawText(
      documentTitle,
      {
        x: LEFT,
        y,
        size: 20,
        font:
          fonts.bold,
        color:
          brandBlue,
      },
    );

    const invoiceText =
      `INVOICE NO: ${invoiceNumber}`;

    this.drawRight(
      page,
      invoiceText,
      PAGE_WIDTH -
        RIGHT,
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
        x:
          PAGE_WIDTH -
          RIGHT,
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
    const groups =
      new Map<string, PdfReportRow & {
        rawItems: string[];
        rawTests: string[];
        rawExtraCharges: string[];
      }>();

    for (const line of lines) {
      const key =
        `${line.sourceType}:${line.sourceId}`;

      let group = groups.get(key);

      if (!group) {
        group = {
          key,

          formNumber:
            String(line.formNumber ?? ''),

          reportNumber:
            String(line.reportNumber ?? ''),

          description:
            this.sourceDescription(
              line.sourceSnapshot,
            ),

          testLabels: [],

          itemLabels: [],

          extraChargeLabels: [],

          rawTests: [],

          rawItems: [],

          rawExtraCharges: [],

          amount: 0,

          manualOverride: false,
        };

        groups.set(key, group);
      }

      if (!group.description) {
        group.description =
          this.sourceDescription(
            line.sourceSnapshot,
          );
      }

      group.rawTests.push(
        String(
          line.testLabel ||
            line.testKey ||
            '',
        ),
      );

      const itemLabel =
        String(
          line.itemLabel ||
            line.itemKey ||
            '',
        ).trim();

      if (itemLabel) {
        group.rawItems.push(
          itemLabel.replace(/_/g, ' '),
        );
      } else if (
        line.activeCount != null
      ) {
        const count =
          Number(line.activeCount);

        group.rawItems.push(
          `${count} active${
            count === 1 ? '' : 's'
          }`,
        );
      }

      group.amount +=
        Number(line.amount ?? 0);

      group.manualOverride =
        group.manualOverride ||
        Boolean(line.manualOverride);
    }

    for (const charge of extraCharges) {
      const key = `${charge.sourceType}:${charge.sourceId}`;
      const group = groups.get(key);

      if (!group) {
        continue;
      }

      const chargeName = String(charge.name ?? '').trim() || 'Additional Charge';
      const chargeAmount = Number(charge.amount ?? 0);

      group.rawExtraCharges.push(
        `${chargeName} (${this.money(chargeAmount)})`,
      );

      group.amount += chargeAmount;
    }

    return [...groups.values()]
      .map((group) => {
        const {
          rawItems,
          rawTests,
          rawExtraCharges,
          ...row
        } = group;

        return {
          ...row,

          testLabels:
            this.uniqueText(rawTests),

          itemLabels:
            this.uniqueText(rawItems),

          extraChargeLabels:
            this.uniqueText(rawExtraCharges),
        };
      })
      .sort((a, b) => {
        const formCompare =
          a.formNumber.localeCompare(
            b.formNumber,
          );

        if (formCompare !== 0) {
          return formCompare;
        }

        return a.reportNumber.localeCompare(
          b.reportNumber,
        );
      });
  }

  /* =========================================================
     TABLE HEADER
  ========================================================= */

  private drawTableHeader(
    page: PDFPage,
    y: number,
    font: PDFFont,
  ) {
    const rowHeight = 22;

    page.drawRectangle({
      x: LEFT,
      y: y - rowHeight + 4,

      width:
        PAGE_WIDTH -
        LEFT -
        RIGHT,

      height:
        rowHeight,

      color:
        rgb(
          0.94,
          0.94,
          0.94,
        ),
    });

    page.drawText('Form No.', {
      x: LEFT + 4,
      y: y - 10,
      size: 7.2,
      font,
    });

    page.drawText('Report No.', {
      x: 112,
      y: y - 10,
      size: 7.2,
      font,
    });

    page.drawText('Description', {
      x: 178,
      y: y - 10,
      size: 7.2,
      font,
    });

    page.drawText('Type of Test', {
      x: 306,
      y: y - 10,
      size: 7.2,
      font,
    });

    page.drawText(
      'Pathogens / Actives / COA',
      {
        x: 390,
        y: y - 10,
        size: 6.7,
        font,
      },
    );

    this.drawRight(
      page,
      'Amount',
      PAGE_WIDTH -
        RIGHT -
        4,
      y - 10,
      7.2,
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

      width:
        PAGE_WIDTH -
        LEFT -
        RIGHT,

      height: rowHeight,

      color:
        rgb(
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
      PAGE_WIDTH -
        RIGHT -
        4,
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

    const sixtyDayDate =
      this.addDays(
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

      [
        'Due Date',
        this.formatDate(exactDueDate),
      ],
    ];

    let detailY = y;

    /*
     * Keep every separator "-" in the exact same vertical column:
     *
     * Invoice No.      -  INV-2026-0003
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

    if (invoice.invoiceKind === 'MANUAL') {
      y = this.drawManualTableHeader(
        page,
        y,
        bold,
      );

      for (const line of invoice.manualLines ?? []) {
        const descriptionLines =
          this.wrapText(
            line.description || '—',
            62,
          );

        const rowHeight =
          Math.max(
            28,
            11 +
              Math.max(
                descriptionLines.length,
                1,
              ) *
                9,
          );

        if (
          y <
          BOTTOM +
            125 +
            rowHeight
        ) {
          page =
            pdf.addPage([
              PAGE_WIDTH,
              PAGE_HEIGHT,
            ]);

          y =
            this.drawHeader(
              page,
              fonts,
              invoice.invoiceNumber,
              invoice.revisionNumber ?? 0,
            );

          y =
            this.drawManualTableHeader(
              page,
              y,
              bold,
            );
        }

        const textTop =
          y - 13;

        descriptionLines.forEach(
          (descriptionLine, index) => {
            page.drawText(
              descriptionLine,
              {
                x: LEFT + 4,

                y:
                  textTop -
                  index * 9,

                size: 7.2,
                font: regular,
              },
            );
          },
        );

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
          this.money(
            Number(line.unitPrice),
          ),
          470,
          textTop,
          7.2,
          regular,
        );

        this.drawRight(
          page,
          this.money(
            Number(line.amount),
          ),
          PAGE_WIDTH -
            RIGHT -
            4,
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
            x:
              PAGE_WIDTH -
              RIGHT,
            y: y - rowHeight,
          },

          thickness: 0.25,

          color:
            rgb(
              0.75,
              0.75,
              0.75,
            ),
        });

        y -= rowHeight;
      }
    } else {
      y =
        this.drawTableHeader(
          page,
          y,
          bold,
        );

    for (const row of reportRows) {
      /*
       * Description is intentionally unlimited.
       *
       * Do not slice/truncate wrapped lines. The invoice row height
       * expands based on the full description so the PDF never
       * silently drops part of the sample/product description.
       */
      const descriptionLines =
        this.wrapText(
          row.description || '—',
          27,
        );

      const testLines =
        row.testLabels.length > 0
          ? row.testLabels.flatMap(
              (label) =>
                this.wrapText(
                  label,
                  17,
                ),
            )
          : ['—'];

      const baseItemLines =
        row.itemLabels.length > 0
          ? row.itemLabels.flatMap(
              (label) =>
                this.wrapText(
                  label,
                  22,
                ),
            )
          : ['Type of Test only'];

      const extraChargeLines =
        row.extraChargeLabels.flatMap(
          (label) =>
            this.wrapText(
              `Additional: ${label}`,
              22,
            ),
        );

      const itemLines = [
        ...baseItemLines,
        ...extraChargeLines,
      ];

      const contentLineCount =
        Math.max(
          descriptionLines.length,
          testLines.length,
          itemLines.length,
          1,
        );

      const rowHeight =
        Math.max(
          28,
          11 +
            contentLineCount *
              9,
        );

      if (
        y <
        BOTTOM +
          125 +
          rowHeight
      ) {
        page =
          pdf.addPage([
            PAGE_WIDTH,
            PAGE_HEIGHT,
          ]);

        y =
          this.drawHeader(
            page,
            fonts,
            invoice.invoiceNumber,
            invoice.revisionNumber ?? 0,
          );

        y =
          this.drawTableHeader(
            page,
            y,
            bold,
          );
      }

      const textTop =
        y - 13;

      const formText =
        row.manualOverride
          ? `${row.formNumber} *`
          : row.formNumber;

      page.drawText(
        this.truncate(
          formText,
          15,
        ),
        {
          x: LEFT + 4,
          y: textTop,
          size: 7.1,
          font: regular,
        },
      );

      page.drawText(
        this.truncate(
          row.reportNumber,
          13,
        ),
        {
          x: 112,
          y: textTop,
          size: 7.1,
          font: regular,
        },
      );

      descriptionLines.forEach(
        (line, index) => {
          page.drawText(line, {
            x: 178,
            y:
              textTop -
              index * 9,
            size: 6.9,
            font: regular,
          });
        },
      );

      testLines.forEach(
        (line, index) => {
          page.drawText(line, {
            x: 306,
            y:
              textTop -
              index * 9,
            size: 6.9,
            font: regular,
          });
        },
      );

      itemLines.forEach(
        (line, index) => {
          page.drawText(
            `- ${line}`,
            {
              x: 390,
              y:
                textTop -
                index * 9,
              size: 6.7,
              font: regular,
            },
          );
        },
      );

      this.drawRight(
        page,
        this.money(
          row.amount,
        ),
        PAGE_WIDTH -
          RIGHT -
          4,
        textTop,
        7.3,
        regular,
      );

      page.drawLine({
        start: {
          x: LEFT,
          y:
            y -
            rowHeight,
        },

        end: {
          x:
            PAGE_WIDTH -
            RIGHT,
          y:
            y -
            rowHeight,
        },

        thickness: 0.25,

        color:
          rgb(
            0.75,
            0.75,
            0.75,
          ),
      });

      y -= rowHeight;
    }
    }

    /* =====================================================
       TOTALS
    ===================================================== */

    if (y < BOTTOM + 150) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

      y = this.drawHeader(
        page,
        fonts,
        invoice.invoiceNumber,
        invoice.revisionNumber ?? 0,
      );
    }

    y -= 18;

    const labelX = 390;

    const amountRight = PAGE_WIDTH - RIGHT;

    const subtotal = Number(invoice.subtotal);

    const adjustment = Number(invoice.adjustmentAmount);

    const total = Number(invoice.total);

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

    y -= 8;

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
      y = this.drawHeader(
        page,
        fonts,
        invoice.invoiceNumber,
        invoice.revisionNumber ?? 0,
      );
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
      page.drawText('Notes', {
        x: LEFT,
        y,
        size: 8.5,
        font: bold,
      });

      y -= 13;

      const notes = String(invoice.notes);

      const noteLines = this.wrapText(notes, 88);

      for (const line of noteLines.slice(0, 8)) {
        page.drawText(line, {
          x: LEFT,
          y,
          size: 8,
          font: regular,
        });

        y -= 11;
      }
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
    const isRegeneration =
      Boolean(
        invoice.pdfStorageKey &&
          invoice.pdfFilename &&
          invoice.pdfChecksum &&
          invoice.pdfCreatedAt,
      );

    /*
     * Never generate an official PDF with
     * unresolved pricing.
     */
    if (
      invoice.invoiceKind ===
        'MANUAL' &&
      invoice.manualLines.length ===
        0
    ) {
      throw new BadRequestException(
        'Manual invoice has no invoice items',
      );
    }

    const unresolved =
      invoice.invoiceKind ===
      'REPORT'
        ? invoice.lines.filter(
            (line) =>
              !!line.pricingIssue ||
              line.unitPrice ==
                null ||
              line.amount ==
                null,
          )
        : [];

    if (unresolved.length) {
      throw new BadRequestException(
        'Invoice contains unresolved pricing and cannot generate PDF',
      );
    }

    const bytes = await this.buildPdf(invoice);

    const checksum = createHash('sha256').update(bytes).digest('hex');

    const year =
      invoice.invoiceNumber.split('-')[1] || String(new Date().getFullYear());

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
       * local/billing/invoices/2026/INV-2026-0001.pdf
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

        regenerated:
          isRegeneration,
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