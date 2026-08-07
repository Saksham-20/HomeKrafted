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
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // `rawBody: true` stashes the pre-JSON-parse request bytes on
  // `req.rawBody` for every route (`req.body` still parses normally) —
  // needed by `PaymentsController.webhook` to verify Razorpay's HMAC
  // signature against the exact bytes it signed, not a re-serialization
  // of the parsed body (see `razorpay-signature.util.ts`).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService<AppConfig, true>);

  /**
   * Production serves this API through nginx on the same box
   * (`docs/DEPLOY.md`), so without this **every request arrives from
   * `127.0.0.1`** as far as Express is concerned. `req.ip` is what
   * `@nestjs/throttler` keys its buckets on, so the entire internet
   * shared one rate-limit bucket: the first few visitors in a window
   * exhausted it and everybody else — including the OTP and login limits
   * that exist to stop credential stuffing — got a 429 they had done
   * nothing to earn. It also made those auth limits useless in the other
   * direction, since an attacker's requests were indistinguishable from
   * everyone else's.
   *
   * `1`, not `true`. `true` trusts the whole `X-Forwarded-For` chain, so
   * anyone can prepend a forged address and rotate through the limiter
   * at will. One hop is exactly what sits in front of us; if a CDN is
   * ever added, this becomes 2.
   */
  app.set('trust proxy', 1);

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
