import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: [
      'http://localhost:5173',
      /\.pages\.dev$/,              // allows Cloudflare Pages previews
      'https://app.yourdomain.com', // your production web domain
    ],
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0'); // 👈 important on Fly
  console.log(`API listening on 0.0.0.0:${port}`);
}
bootstrap();
