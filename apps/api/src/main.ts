import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', true);

  app.use(helmet());
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://www.omegabiochemlab.com',
      'https://lims.omegabiochemlab.com',
      'https://omegabiochemlab.com',
      // 'https://omega-lims.fly.dev',
      // 'https://omega-lims-staging.fly.dev',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  });

  app.use(cookieParser());

  const port = Number(process.env.PORT || 3000);
  console.log('JWT_SECRET present?', !!process.env.JWT_SECRET);
  console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length);

  await app.listen(port, '0.0.0.0'); // 👈 important on Fly
  console.log(`API listening on 0.0.0.0:${port}`);
}
bootstrap();
