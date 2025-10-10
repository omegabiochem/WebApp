import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://webapp-aog.pages.dev',
      'https://app.yourdomain.com', // your production web domain
      'https://www.omegabiochemlab.com',
      'https://omega-lims.fly.dev',
      'https://omega-lims-staging.fly.dev',
    ],
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  });

  const port = Number(process.env.PORT) || 3000 || 4000;
  await app.listen(port, '0.0.0.0'); // 👈 important on Fly
  console.log(`API listening on 0.0.0.0:${port}`);
}
bootstrap();
