import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/security';
import { randomUUID } from 'node:crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((request: any, response: any, next: () => void) => {
    const requestId = String(request.headers['x-request-id'] || randomUUID()).slice(0, 128);
    const startedAt = Date.now();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => console.log(JSON.stringify({
      event: 'http_request', requestId, method: request.method, path: request.originalUrl,
      status: response.statusCode, durationMs: Date.now() - startedAt,
    })));
    next();
  });
  app.enableCors({ origin: process.env.NODE_ENV === 'production' ? (process.env.CORS_ORIGIN?.split(',') ?? false) : true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(Number(process.env.SERVER_PORT ?? 3000), '0.0.0.0');
}
bootstrap();
