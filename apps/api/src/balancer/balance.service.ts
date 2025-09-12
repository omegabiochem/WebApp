import { Injectable } from '@nestjs/common';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { PrismaService } from 'src/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BalanceService {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;

  constructor(private prisma: PrismaService) {
    // We don’t auto-connect here. User will call connect().
  }

  async connect(): Promise<boolean> {
    try {
      if (this.port && this.port.isOpen) {
        console.log("⚡ Already connected");
        return true;
      }

      // 1. If env var is set, use it
      const manualPath = process.env.BALANCE_PORT;
      if (manualPath) {
        console.log(`🔌 Using BALANCE_PORT from env: ${manualPath}`);
        this.port = new SerialPort({
          path: manualPath,
          baudRate: 2400,
          dataBits: 7,
          stopBits: 2,
          parity: 'even',
        });

        await new Promise<void>((resolve, reject) => {
          this.port?.once('open', () => {
            console.log("✅ Serial port opened");
            resolve();
          });
          this.port?.once('error', (err) => reject(err));
        });

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        return true;
      }

      // 2. Auto-detect
      const ports = await SerialPort.list();
      console.log("🔍 Available ports:", ports);

      const balancePort = ports.find(
        (p) =>
          p.manufacturer?.includes("Prolific") ||
          p.vendorId === "067b" ||
          p.path.includes("ttyUSB") ||
          p.path.startsWith("COM")
      );

      if (!balancePort) {
        console.error("⚠️ Balance not detected. Please set BALANCE_PORT manually.");
        return false;
      }

      console.log(`✅ Balance detected at: ${balancePort.path}`);
      this.port = new SerialPort({
        path: balancePort.path,
        baudRate: 2400,
        dataBits: 7,
        stopBits: 2,
        parity: "even",
      });

      await new Promise<void>((resolve, reject) => {
        this.port?.once('open', () => {
          console.log("✅ Serial port opened");
          resolve();
        });
        this.port?.once('error', (err) => reject(err));
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
      return true;
    } catch (err) {
      console.error("❌ Error connecting serial port:", err);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => this.port?.close(() => resolve()));
      console.log("🔌 Balance disconnected");
    }
    this.port = null;
    this.parser = null;
  }

  // private async log(cmd: string, result: string, userId?: string) {
  //   console.log('📥 Logging balance command:');
  //   console.log('   Command   =', cmd);
  //   console.log('   Result    =', result);
  //   console.log('   UserId    =', userId);

  //   await this.prisma.balanceReading.create({
  //     data: { instrument: 'GR-202', command: cmd, result, userId },
  //   });

  //   await this.prisma.auditTrail.create({
  //     data: {
  //       action: 'BALANCE_COMMAND',
  //       details: `Cmd: ${cmd}, Result: ${result}`,
  //        ...(userId ? { user: { connect: { id: userId } } } : {}),
  //     },
  //   });
  // }



  private async log(cmd: string, result: string, userId?: string) {
  const reading = await this.prisma.balanceReading.create({
    data: { instrument: 'GR-202', command: cmd, result, userId },
  });

  const data: Prisma.AuditTrailCreateInput = {
    action: 'BALANCE_COMMAND',
    entity: 'BalanceReading',         // <-- REQUIRED
    entityId: reading.id,             // <-- optional but useful
    details: `Cmd: ${cmd}, Result: ${result}`,
    ...(userId ? { user: { connect: { id: userId } } } : {}),
  };

  await this.prisma.auditTrail.create({ data });
}

  async sendCommand(cmd: string, userId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.parser) {
        return reject('⚠️ Balance not connected');
      }

      // ✅ Remove previous listeners
      this.parser.removeAllListeners('data');

      // ⏱️ Timeout safeguard
      const timeout = setTimeout(() => {
        reject("⏱️ Timeout waiting for balance response");
      }, 5000);

      this.parser.once('data', async (data) => {
        clearTimeout(timeout);
        const result = data.trim();
        await this.log(cmd, result, userId);
        resolve(result);
      });

      this.port.write(cmd + '\r\n');
    });
  }

  async getWeight(userId?: string) {
    return this.sendCommand('S', userId);
  }

  async tare(userId?: string) {
    return this.sendCommand('T', userId);
  }

  async zero(userId?: string) {
    return this.sendCommand('Z', userId);
  }

  isConnected(): boolean {
    return !!(this.port && this.port.isOpen);
  }
}
