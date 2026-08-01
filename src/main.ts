import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

// Known dev/placeholder values from configuration.ts's fallbacks and
// .env.example. Silently running production on one of these means the JWT
// secret is sitting in public source history — refuse to start instead.
const UNSAFE_PRODUCTION_VALUES = new Set([
  'dev-access-secret',
  'dev-refresh-secret',
  'change-me-access-secret',
  'change-me-refresh-secret',
  'Admin@12345',
]);

function assertProductionSecretsAreSafe(config: ConfigService) {
  if (config.get<string>('nodeEnv') !== 'production') return;

  const checks: [string, string | undefined][] = [
    ['jwt.accessSecret', config.get<string>('jwt.accessSecret')],
    ['jwt.refreshSecret', config.get<string>('jwt.refreshSecret')],
    ['superAdmin.password', config.get<string>('superAdmin.password')],
  ];
  const unsafe = checks.filter(
    ([, value]) => !value || UNSAFE_PRODUCTION_VALUES.has(value),
  );
  if (unsafe.length > 0) {
    throw new Error(
      `تشغيل غير آمن: القيم التالية لا تزال افتراضية/تجريبية في بيئة الإنتاج: ${unsafe
        .map(([key]) => key)
        .join(', ')}. عيّن متغيرات البيئة المطلوبة قبل التشغيل.`,
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  assertProductionSecretsAreSafe(config);

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      // Product/store images are fetched cross-origin by the frontend (a
      // separate origin in both dev and prod) — the default same-origin
      // resource policy would silently block every <img>.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Pure JSON API + static image server, no HTML views of our own to
      // protect with a page-oriented CSP.
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
  });

  // Serve locally-uploaded images at /uploads/*
  const uploadDir = config.get<string>('storage.uploadDir') ?? 'uploads';
  app.useStaticAssets(join(process.cwd(), uploadDir), { prefix: '/uploads/' });

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);

  console.log(`سوق سوريا API يعمل على المنفذ ${port}`);
}
bootstrap();
