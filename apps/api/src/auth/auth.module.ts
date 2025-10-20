// auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from 'src/common/jwt.strategy';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET!, // ⬅ same env var as JwtStrategy
      signOptions: { algorithm: 'HS256' }, // default, but make it explicit
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PrismaService],
  exports: [JwtModule],
})
export class AuthModule {}

// // src/auth/auth.module.ts
// import { Module } from '@nestjs/common';
// import { JwtModule } from '@nestjs/jwt';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { JwtStrategy } from 'src/common/jwt.strategy';
// import { PrismaService } from 'prisma/prisma.service';

// @Module({
//   imports: [JwtModule.register({ secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '1d' } })],
//   providers: [AuthService, JwtStrategy, PrismaService], // 👈 add PrismaService unless global
//   controllers: [AuthController],
//   exports: [AuthService],
// })
// export class AuthModule {}
