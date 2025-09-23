// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from 'src/common/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '1d' } })],
  providers: [AuthService, JwtStrategy, PrismaService], // 👈 add PrismaService unless global
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}





// import { Module } from '@nestjs/common';
// import { JwtModule } from '@nestjs/jwt';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { JwtStrategy } from 'src/common/jwt.strategy';

// @Module({
//   imports: [JwtModule.register({ secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '1d' } })],
//   providers: [AuthService,JwtStrategy],
//   controllers: [AuthController],
//   exports: [AuthService],
// })
// export class AuthModule {}
