import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Without this jsonwebtoken signs with "undefined" and every token still verifies.
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set. See .env.example.');

  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) ?? true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const docs = new DocumentBuilder()
    .setTitle('punchcard')
    .setDescription(
      'Office attendance: location, phone fingerprint key and face, judged on the server.',
    )
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, docs));

  const port = Number(process.env.PORT ?? 3200);
  await app.listen(port, '0.0.0.0');
  console.log(`punchcard api listening on ${port}`);
}

void bootstrap();
