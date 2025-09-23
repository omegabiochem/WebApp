// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   await app.listen(process.env.PORT ?? 3000);
// }
// bootstrap();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  //where backend starts
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: ['http://localhost:5173'], credentials: true, exposedHeaders: ['Content-Disposition'], });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
