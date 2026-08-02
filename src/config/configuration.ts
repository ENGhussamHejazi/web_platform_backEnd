export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  storage: {
    driver: string;
    uploadDir: string;
    publicBaseUrl: string;
    cloudinary: {
      cloudName?: string;
      apiKey?: string;
      apiSecret?: string;
      folder: string;
    };
  };
  sms: {
    driver: string;
    senderId: string;
    apiKey?: string;
    apiUrl?: string;
  };
  payments: {
    providers: string[];
  };
  superAdmin: {
    email: string;
    password: string;
    name: string;
  };
  mail: {
    driver: string;
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    brevoApiKey?: string;
    fromAddress: string;
    fromName: string;
  };
  frontendBaseUrl: string;
  monitoring: {
    dbStorageLimitMb?: number;
  };
  captcha: {
    // Cloudflare Turnstile secret key. Guest-order captcha verification is
    // skipped entirely when unset, so local/dev environments work without
    // provisioning a Turnstile site — set this in production.
    turnstileSecretKey?: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      folder: process.env.CLOUDINARY_FOLDER ?? 'souq-syria',
    },
  },
  sms: {
    driver: process.env.SMS_DRIVER ?? 'log',
    senderId: process.env.SMS_SENDER_ID ?? 'SouqSyria',
    apiKey: process.env.SMS_API_KEY,
    apiUrl: process.env.SMS_API_URL,
  },
  payments: {
    providers: (process.env.PAYMENT_PROVIDERS ?? 'cod')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL ?? 'admin@souq-syria.com',
    password: process.env.SUPER_ADMIN_PASSWORD ?? 'Admin@12345',
    name: process.env.SUPER_ADMIN_NAME ?? 'مدير المنصة',
  },
  mail: {
    // MAIL_DRIVER: log | smtp | brevo-api  ("log" prints emails to the console;
    // used by default in local dev when SMTP credentials aren't configured).
    // "brevo-api" sends over HTTPS via Brevo's transactional email API instead
    // of raw SMTP — needed on hosts (e.g. Render) that block outbound SMTP ports.
    driver:
      process.env.MAIL_DRIVER ??
      (process.env.BREVO_API_KEY ? 'brevo-api' : process.env.MAIL_HOST ? 'smtp' : 'log'),
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    brevoApiKey: process.env.BREVO_API_KEY,
    fromAddress: process.env.MAIL_FROM_ADDRESS ?? 'HUSSA.HEJAZI17@GMAIL.COM',
    fromName: process.env.MAIL_FROM_NAME ?? 'Souq Syria — Store Applications',
  },
  frontendBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:5173',
  monitoring: {
    dbStorageLimitMb: process.env.DB_STORAGE_LIMIT_MB
      ? parseInt(process.env.DB_STORAGE_LIMIT_MB, 10)
      : undefined,
  },
  captcha: {
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
  },
});
