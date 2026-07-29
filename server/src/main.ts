import 'reflect-metadata';
// Populate `process.env` from `.env` BEFORE the module graph is imported.
// `ConfigModule.forRoot()` also loads it, but that runs at module *init* —
// too late for anything evaluated at import time, such as
// `AuthController`'s `@Throttle(AUTH_THROTTLE)` decorator. Keep this above
// the `AppModule` import.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // `rawBody: true` stashes the pre-JSON-parse request bytes on
  // `req.rawBody` for every route (`req.body` still parses normally) —
  // needed by `PaymentsController.webhook` to verify Razorpay's HMAC
  // signature against the exact bytes it signed, not a re-serialization
  // of the parsed body (see `razorpay-signature.util.ts`).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService<AppConfig, true>);

  app.use(helmet());

  app.enableCors({
    origin: configService.get('clientOrigin', { infer: true }),
    credentials: true,
  });

  // Base path `/api/v1` per docs/API.md's convention — `/health` stays
  // unprefixed since infra/load-balancer health checks conventionally
  // expect it at the root.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/db'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = configService.get('port', { infer: true });
  await app.listen(port);
  console.log(`Homekrafted API listening on :${port} (${configService.get('nodeEnv', { infer: true })})`);
}

bootstrap();
