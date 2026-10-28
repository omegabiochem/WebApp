import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Workbook, type Worksheet } from 'exceljs';
import { PrismaService } from 'prisma/prisma.service';

type AuthUser = { userId: string; role: UserRole };
const ZONE = process.env.BILLING_TIME_ZONE || 'America/New_York';
const PRIOR = 'Previous Month Pending: ';
const CUSTOM = 'Custom Charge: ';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Client-facing name only; keep stored legacy IDs for internal tracking. */
function displayPreviousMonthCharge(value: unknown): string {
  const description = String(value ?? '')
    .replace(/^Previous Month Pending:\s*/i, '')
    .trim();

  const oldOutstanding =
    /^Outstanding Invoice \[[^\]]+\]\s+(INV-[A-Za-z0-9-]+)\s*-\s*unpaid balance$/i.exec(
      description,
    );
  if (oldOutstanding) {
    return `Previous Month Outstanding Balance – Invoice ${oldOutstanding[1]}`;
  }

  return description || 'Previous-month pending charge';
}

@Injectable()
export class BillingExcelService {
  constructor(private readonly prisma: PrismaService) {}

  private assertReader(user: AuthUser) {
    if (!['FRONTDESK', 'ADMIN', 'SYSTEMADMIN'].includes(user?.role)) {
      throw new ForbiddenException(
        'You do not have access to billing invoices',
      );
    }
  }

  private date(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? '-'
      : new Intl.DateTimeFormat('en-US', {
          timeZone: ZONE,
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        }).format(d);
  }
  private addDays(value: any, days: number): Date {
    const d = new Date(value);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
  private str(v: any): string {
    return String(v ?? '').trim();
  }
  private num(v: any): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  private uniq(values: any[]): string {
    return [
      ...new Set(
        values
          .flatMap((v) => (Array.isArray(v) ? v : [v]))
          .map((v) => this.str(v))
          .filter(Boolean),
      ),
    ].join(', ');
  }
  private snapshot(line: any): any {
    return line?.sourceSnapshot &&
      typeof line.sourceSnapshot === 'object' &&
      !Array.isArray(line.sourceSnapshot)
      ? line.sourceSnapshot
      : {};
  }
  private sampleTypes(s: any): string {
    const raw = Array.isArray(s.sampleTypes)
      ? s.sampleTypes
      : s.sampleType != null
        ? [s.sampleType]
        : [];
    return this.uniq(
      raw.map((v: any) =>
        typeof v === 'object' && v
          ? (v.sampleType ?? v.name ?? v.label ?? v.value ?? v.type ?? v.key)
          : v,
      ),
    ).replace(/_/g, ' ');
  }
  private lot(s: any): string {
    return this.str(
      s.lotNo ?? s.lotBatchNo ?? s.lotNumber ?? s.batchNo ?? s.batchNumber,
    );
  }
  private desc(s: any): string {
    return this.str(
      s.description ??
        s.sampleDescription ??
        s.productDescription ??
        s.sample_description,
    );
  }
  private safeFile(v: string): string {
    return v.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  }

  private async enrich(lines: any[]) {
    const lacking = lines.filter(
      (l) => !this.sampleTypes(this.snapshot(l)) || !this.lot(this.snapshot(l)),
    );
    const microIds = [
      ...new Set(
        lacking.filter((l) => l.sourceType === 'REPORT').map((l) => l.sourceId),
      ),
    ];
    const chemIds = [
      ...new Set(
        lacking
          .filter((l) => l.sourceType === 'CHEMISTRY_REPORT')
          .map((l) => l.sourceId),
      ),
    ];
    const [micro, chem] = await Promise.all([
      microIds.length
        ? this.prisma.report.findMany({
            where: { id: { in: microIds } },
            include: {
              microMix: true,
              microMixWater: true,
              sterility: true,
              ape: true,
            },
          })
        : Promise.resolve([]),
      chemIds.length
        ? this.prisma.chemistryReport.findMany({
            where: { id: { in: chemIds } },
            include: { chemistryMix: true, coa: true },
          })
        : Promise.resolve([]),
    ]);
    const fallback = new Map<string, any>();
    for (const r of micro as any[]) {
      const d = r.microMix ?? r.microMixWater ?? r.sterility ?? r.ape ?? {};
      fallback.set('REPORT:' + r.id, {
        sampleType: d.sampleType,
        lotNo: d.lotNo,
      });
    }
    for (const r of chem as any[]) {
      const d = r.chemistryMix ?? r.coa ?? {};
      fallback.set('CHEMISTRY_REPORT:' + r.id, {
        sampleTypes: d.sampleTypes,
        lotBatchNo: d.lotBatchNo,
      });
    }
    return lines.map((line) => {
      const s = this.snapshot(line),
        b = fallback.get(line.sourceType + ':' + line.sourceId) ?? {};
      return {
        ...line,
        sourceSnapshot: {
          ...s,
          ...(!this.sampleTypes(s)
            ? { sampleTypes: b.sampleTypes, sampleType: b.sampleType }
            : {}),
          ...(!this.lot(s) ? { lotNo: b.lotNo, lotBatchNo: b.lotBatchNo } : {}),
        },
      };
    });
  }

  private section(ws: Worksheet, title: string, row: number) {
    ws.mergeCells(row, 1, row, 8);
    const cell = ws.getCell(row, 1);
    cell.value = title;
    cell.font = {
      name: 'Aptos',
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17365D' },
    };
    ws.getRow(row).height = 25;
    return row + 1;
  }
  private header(ws: Worksheet, row: number, titles: string[]) {
    titles.forEach((title, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = title;
      c.font = { bold: true, color: { argb: 'FF17365D' }, size: 10 };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDCEAF7' },
      };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: 'FF9CAFC2' } } };
    });
    ws.getRow(row).height = 32;
    return row + 1;
  }
  private addRow(ws: Worksheet, values: any[], bg?: string) {
    const row = ws.addRow(values);
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = 32;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Aptos', size: 10, color: { argb: 'FF243247' } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE3EC' } } };
      if (bg)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bg },
        };
    });
    ws.getCell(row.number, 8).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
    ws.getCell(row.number, 8).alignment = {
      horizontal: 'right',
      vertical: 'top',
    };
    return row;
  }

  async generate(
    user: AuthUser,
    invoiceId: string,
  ): Promise<{ filename: string; content: Buffer; contentType: string }> {
    this.assertReader(user);
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: {
          orderBy: [
            { formNumber: 'asc' },
            { testKey: 'asc' },
            { itemKey: 'asc' },
          ],
        },
        manualLines: { orderBy: { createdAt: 'asc' } },
        extraCharges: {
          orderBy: [{ formNumber: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['CONFIRMED', 'SENT'].includes(invoice.status)) {
      throw new BadRequestException(
        'Confirm the invoice before exporting Excel',
      );
    }
    if (!invoice.invoiceNumber)
      throw new BadRequestException('Invoice number is missing');
    const lines = await this.enrich(invoice.lines as any[]);
    const wb = new Workbook();
    wb.creator = 'OMEGA LIMS';
    wb.created = invoice.confirmedAt ?? invoice.createdAt;
    wb.modified = invoice.confirmedAt ?? invoice.createdAt;
    const ws = wb.addWorksheet('Invoice', {
      views: [{ state: 'frozen', ySplit: 12 }],
    });
    ws.columns = [
      { key: 'form', width: 20 },
      { key: 'date', width: 21 },
      { key: 'description', width: 45 },
      { key: 'test', width: 34 },
      { key: 'sample', width: 23 },
      { key: 'lot', width: 22 },
      { key: 'item', width: 42 },
      { key: 'amount', width: 19 },
    ];
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value =
      process.env.BILLING_COMPANY_NAME || 'OMEGA / BIOCHEM LABORATORIES, INC.';
    ws.getCell('A1').font = {
      name: 'Aptos Display',
      size: 19,
      bold: true,
      color: { argb: 'FF0045B5' },
    };
    ws.getRow(1).height = 36;
    ws.mergeCells('A2:H2');
    ws.getCell('A2').value =
      process.env.BILLING_COMPANY_SUBTITLE || 'FDA REG. | ISO 17025 ACC';
    ws.mergeCells('A3:H3');
    ws.getCell('A3').value =
      process.env.BILLING_COMPANY_ADDRESS ||
      process.env.BILLING_COMPANY_ADDRESS_1 ||
      '56 PARK AVENUE, LYNDHURST, NJ 07071';
    ws.mergeCells('A4:H4');
    ws.getCell('A4').value =
      `Tel: ${process.env.BILLING_COMPANY_PHONE || '(201) 883 1222'}  |  Fax: ${process.env.BILLING_COMPANY_FAX || '(201) 883 0449'}  |  Email: ${process.env.BILLING_COMPANY_EMAIL || 'lab@omegabiochem.com'}`;
    for (let r = 2; r <= 4; r++) {
      ws.getCell(r, 1).alignment = { horizontal: 'center' };
      ws.getCell(r, 1).font = { size: 10, color: { argb: 'FF334155' } };
    }
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A6:D6');
    ws.getCell('A6').value =
      Number(invoice.revisionNumber ?? 0) > 0 ? 'REVISED INVOICE' : 'INVOICE';
    ws.getCell('A6').font = {
      bold: true,
      size: 17,
      color: { argb: 'FF0045B5' },
    };
    ws.mergeCells('E6:H6');
    ws.getCell('E6').value = `INVOICE NO: ${invoice.invoiceNumber}`;
    ws.getCell('E6').font = {
      bold: true,
      size: 12,
      color: { argb: 'FF17365D' },
    };
    ws.getCell('E6').alignment = { horizontal: 'right' };
    ws.mergeCells('A8:D8');
    ws.getCell('A8').value = 'BILL TO';
    ws.getCell('A8').font = { bold: true, color: { argb: 'FF17365D' } };
    ws.mergeCells('E8:H8');
    ws.getCell('E8').value = 'INVOICE DETAILS';
    ws.getCell('E8').font = { bold: true, color: { argb: 'FF17365D' } };
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
    ]
      .filter(Boolean)
      .join(' | ');
    ws.mergeCells('A9:D11');
    ws.getCell('A9').value = billTo;
    ws.getCell('A9').alignment = { vertical: 'top', wrapText: true };
    const end = new Date(new Date(invoice.periodEnd).getTime() - 1);
    const paymentStart =
      invoice.sentAt ??
      invoice.scheduledSendAt ??
      invoice.confirmedAt ??
      invoice.createdAt;
    const details = [
      `Invoice Date: ${this.date(invoice.confirmedAt)}`,
      ...(invoice.invoiceKind === 'REPORT'
        ? [
            `Billing Period: ${this.date(invoice.periodStart)} - ${this.date(end)}`,
          ]
        : []),
      `Due Date: ${this.date(invoice.dueDate ?? this.addDays(paymentStart, 30))}`,
    ];
    ws.mergeCells('E9:H11');
    ws.getCell('E9').value = details.join('\n');
    ws.getCell('E9').alignment = { vertical: 'top', wrapText: true };
    let cursor = 13;
    if (invoice.invoiceKind === 'REPORT') {
      ws.mergeCells(cursor, 1, cursor, 8);
      const c = ws.getCell(cursor, 1);
      c.value =
        'BILLING BASIS NOTICE — Reports are billed based on Result Sent Date within this billing period.';
      c.font = { bold: true, color: { argb: 'FF991B1B' } };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE6E6' },
      };
      ws.getRow(cursor).height = 26;
      cursor += 2;
    }
    const titles = [
      'Form No.',
      'Result Sent Date',
      'Description',
      'Type of Test',
      'Sample Type',
      'Lot No.',
      'Pathogens / Actives / COA',
      'Amount',
    ];
    if (invoice.invoiceKind === 'REPORT') {
      const grouped = new Map<string, any>();
      for (const l of lines) {
        const key = `${l.sourceType}:${l.sourceId}`,
          s = this.snapshot(l);
        if (!grouped.has(key))
          grouped.set(key, {
            form: l.formNumber,
            date: l.resultSentToClientAt,
            department:
              l.sourceType === 'CHEMISTRY_REPORT'
                ? 'CHEMISTRY'
                : 'MICROBIOLOGY',
            description: this.desc(s),
            lot: this.lot(s),
            samples: [],
            tests: [],
            items: [],
            total: 0,
            charges: [],
            override: false,
          });
        const g = grouped.get(key);
        if (!g.description) g.description = this.desc(s);
        if (!g.lot) g.lot = this.lot(s);
        if (!g.date) g.date = l.resultSentToClientAt;
        g.samples.push(this.sampleTypes(s));
        g.tests.push(l.testLabel || String(l.testKey ?? '').replace(/_/g, ' '));
        g.items.push(
          l.itemLabel ||
            (l.itemKey
              ? String(l.itemKey).replace(/_/g, ' ')
              : l.activeCount != null
                ? `${l.activeCount} active(s)`
                : 'Type of Test only'),
        );
        g.total += this.num(l.amount);
        g.override ||= !!l.manualOverride;
      }
      for (const c of invoice.extraCharges as any[]) {
        const g = grouped.get(`${c.sourceType}:${c.sourceId}`);
        if (g) g.charges.push(c);
      }
      for (const dept of ['MICROBIOLOGY', 'CHEMISTRY']) {
        const rows = [...grouped.values()]
          .filter((g) => g.department === dept)
          .sort((a, b) => a.form.localeCompare(b.form));
        if (!rows.length) continue;
        cursor = this.section(ws, dept, cursor);
        cursor = this.header(ws, cursor, titles);
        for (const g of rows) {
          const previous =
            g.date && new Date(g.date) < new Date(invoice.periodStart);
          this.addRow(
            ws,
            [
              `${g.form}${g.override ? ' *' : ''}`,
              `${this.date(g.date)}${previous ? ' (PRIOR MONTH)' : ''}`,
              g.description || '-',
              this.uniq(g.tests) || '-',
              this.uniq(g.samples) || '-',
              g.lot || '-',
              this.uniq(g.items) || '-',
              this.num(g.total),
            ],
            previous ? 'FFFFEFEF' : undefined,
          );
          cursor++;
          for (const c of g.charges) {
            this.addRow(ws, [
              '',
              '',
              'Additional charge: ' + this.str(c.name),
              '',
              '',
              '',
              '',
              this.num(c.amount),
            ]);
            cursor++;
          }
        }
        cursor++;
      }
      const pri = (invoice.manualLines as any[]).filter((x) =>
        this.str(x.description).startsWith(PRIOR),
      );
      const custom = (invoice.manualLines as any[]).filter((x) =>
        this.str(x.description).startsWith(CUSTOM),
      );
      for (const [heading, rows, prefix] of [
        ['LAST MONTH PENDING - MANUAL', pri, PRIOR],
        ['CUSTOM CHARGES', custom, CUSTOM],
      ] as const) {
        if (!rows.length) continue;
        cursor = this.section(ws, heading, cursor);
        for (const m of rows) {
          this.addRow(
            ws,
            [
              '',
              '',
              prefix === PRIOR
                ? displayPreviousMonthCharge(m.description)
                : this.str(m.description).replace(prefix, ''),
              '',
              '',
              '',
              '',
              this.num(m.amount),
            ],
            prefix === PRIOR ? 'FFFFEFEF' : undefined,
          );
          cursor++;
        }
        cursor++;
      }
    } else {
      cursor = this.section(ws, 'MANUAL INVOICE', cursor);
      cursor = this.header(ws, cursor, [
        'Description',
        'Quantity',
        'Unit Price',
        '',
        '',
        '',
        '',
        'Amount',
      ]);
      for (const m of invoice.manualLines as any[]) {
        this.addRow(ws, [
          m.description,
          Number(m.quantity),
          this.num(m.unitPrice),
          '',
          '',
          '',
          '',
          this.num(m.amount),
        ]);
        cursor++;
      }
      cursor++;
    }
    const deptSum = (dept: string) =>
      lines
        .filter(
          (l) =>
            (l.sourceType === 'CHEMISTRY_REPORT'
              ? 'CHEMISTRY'
              : 'MICROBIOLOGY') === dept,
        )
        .reduce((a, l) => a + this.num(l.amount), 0) +
      (invoice.extraCharges as any[])
        .filter(
          (c) =>
            (c.sourceType === 'CHEMISTRY_REPORT'
              ? 'CHEMISTRY'
              : 'MICROBIOLOGY') === dept,
        )
        .reduce((a, c) => a + this.num(c.amount), 0);
    const totals: Array<[string, number]> =
      invoice.invoiceKind === 'REPORT'
        ? [
            ['Microbiology Total', deptSum('MICROBIOLOGY')],
            ['Chemistry Total', deptSum('CHEMISTRY')],
            [
              'Last Month Manual Charges',
              (invoice.manualLines as any[])
                .filter((m) => this.str(m.description).startsWith(PRIOR))
                .reduce((a, m) => a + this.num(m.amount), 0),
            ],
            [
              'Custom Charges',
              (invoice.manualLines as any[])
                .filter((m) => this.str(m.description).startsWith(CUSTOM))
                .reduce((a, m) => a + this.num(m.amount), 0),
            ],
          ]
        : [];
    totals.push(
      ['Subtotal', this.num(invoice.subtotal)],
      ['Adjustment', this.num(invoice.adjustmentAmount)],
      ['TOTAL', this.num(invoice.total)],
    );
    for (const [label, value] of totals) {
      ws.mergeCells(cursor, 5, cursor, 7);
      ws.getCell(cursor, 5).value = label;
      ws.getCell(cursor, 8).value = value;
      ws.getCell(cursor, 8).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
      if (label === 'TOTAL') {
        for (let col = 5; col <= 8; col++) {
          const c = ws.getCell(cursor, col);
          c.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
          c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF17365D' },
          };
        }
        ws.getRow(cursor).height = 30;
      }
      cursor++;
    }
    if (invoice.notes) {
      cursor += 2;
      ws.mergeCells(cursor, 1, cursor, 8);
      ws.getCell(cursor, 1).value = 'Notes: ' + invoice.notes;
      ws.getCell(cursor, 1).alignment = { wrapText: true };
      ws.getRow(cursor).height = 35;
    }
    ws.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    };
    ws.headerFooter.oddFooter = 'OMEGA LIMS | &P of &N';
    const bytes = await wb.xlsx.writeBuffer();
    return {
      filename: `${this.safeFile(invoice.invoiceNumber)}.xlsx`,
      content: Buffer.from(bytes),
      contentType: XLSX_MIME,
    };
  }
}
