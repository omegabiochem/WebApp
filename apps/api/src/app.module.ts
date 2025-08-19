// import { Module } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { AuthModule } from './auth/auth.module';

// @Module({
//   imports: [AuthModule],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}



import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SamplesModule } from './samples/samples.module';
import { JwtStrategy } from './common/jwt.strategy';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, SamplesModule],
  providers: [JwtStrategy],
})
export class AppModule {}
