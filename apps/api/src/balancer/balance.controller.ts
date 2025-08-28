import { Controller, Get, Req, Res } from '@nestjs/common';
import { BalanceService } from './balance.service';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { PrismaService } from 'src/prisma.service';

@Controller('balance')
export class BalanceController {
  constructor(
    private balanceService: BalanceService,
    private prisma: PrismaService,
  ) {}

  @Get('connect')
  async connect() {
    const ok = await this.balanceService.connect();
    return { connected: ok };
  }

  @Get('disconnect')
  disconnect() {
    this.balanceService.disconnect();
    return { connected: false };
  }

  @Get('status')
  async status() {
    return { connected: this.balanceService.isConnected() };
  }

  @Get('weight')
  async weight(@Req() req: any) {
    console.log('🔑 req.user =', req.user);
    const userId = req.user.email; // from JWT
    return { weight: await this.balanceService.getWeight(userId) };
  }

  @Get('tare')
  async tare(@Req() req: any) {
    const userId = req.user.sub;
    return { result: await this.balanceService.tare(userId) };
  }

  @Get('zero')
  async zero(@Req() req: any) {
    const userId = req.user.sub;
    return { result: await this.balanceService.zero(userId) };
  }

  // ✅ list readings (frontend can show in a table)
  @Get('readings')
  async readings() {
    return this.prisma.balanceReading.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ✅ export readings with user info
  @Get('export-readings')
  async exportReadings(@Res() res: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Balance Readings');

    sheet.columns = [
      // { header: 'ID', key: 'id', width: 36 },
      { header: 'Instrument', key: 'instrument', width: 20 },
      // { header: 'Command', key: 'command', width: 10 },
      { header: 'Result', key: 'result', width: 15 },
      { header: 'Timestamp', key: 'createdAt', width: 25 },
      { header: 'User ID', key: 'userId', width: 20 },
      // { header: 'User Name', key: 'userName', width: 20 },
      // { header: 'User Email', key: 'userEmail', width: 30 },
    ];

    const data = await this.prisma.balanceReading.findMany({
      include: { user: { select: { name: true, email: true } } },
    });

    const rows = data.map((r) => ({
      id: r.id,
      instrument: r.instrument,
      command: r.command,
      result: r.result,
      createdAt: r.createdAt,
      userId: r.userId,
      userName: r.user?.name || '-',
      userEmail: r.user?.email || '-',
    }));

    sheet.addRows(rows);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=balance_readings.xlsx',
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  // ✅ export audit with user info
  @Get('export-audit')
  async exportAudit(@Res() res: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Audit Trail');

    sheet.columns = [
      // { header: 'ID', key: 'id', width: 36 },
      // { header: 'Action', key: 'action', width: 20 },
      { header: 'Details', key: 'details', width: 50 },
      { header: 'Timestamp', key: 'createdAt', width: 25 },
      { header: 'User ID', key: 'userId', width: 20 },
      // { header: 'User Name', key: 'userName', width: 20 },
      // { header: 'User Email', key: 'userEmail', width: 30 },
    ];

    const data = await this.prisma.auditTrail.findMany({
      include: { user: { select: { name: true, email: true } } },
    });

    const rows = data.map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      createdAt: r.createdAt,
      userId: r.userId,
      userName: r.user?.name || '-',
      userEmail: r.user?.email || '-',
    }));

    sheet.addRows(rows);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=audit_trail.xlsx',
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}
