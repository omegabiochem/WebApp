import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class ESignService {
  constructor(private prisma: PrismaService) {}

  async verifyPassword(userId: string, plaintext: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // console.log("VERIFYING E-SIGN FOR USER:", userId, "FOUND:", !!user);
    if (!user?.passwordHash) {
      throw new BadRequestException('No credentials on file');
    }
    const ok = await bcrypt.compare(plaintext, user.passwordHash);
    if (!ok) throw new BadRequestException('Electronic signature failed');
    return true;
  }
}
