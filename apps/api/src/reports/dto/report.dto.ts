import { MicroMixReport } from '@prisma/client';

export class ReportDto {
  id: string;
  fullNumber: string;
  client?: string;
  dateSent?: Date;

  constructor(report: MicroMixReport) {
    this.id = report.id;
    this.fullNumber = `${report.prefix}-${String(report.reportNumber).padStart(4, "0")}`;
    this.client = report.client ?? undefined;
    this.dateSent = report.dateSent ?? undefined;
  }
}
