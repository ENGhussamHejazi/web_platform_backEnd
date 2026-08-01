import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  // No secret key configured (e.g. local dev) → captcha is not enforced.
  get isEnabled(): boolean {
    return Boolean(this.configService.get('captcha', { infer: true }).turnstileSecretKey);
  }

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    const secretKey = this.configService.get('captcha', { infer: true }).turnstileSecretKey;
    if (!secretKey) return true;
    if (!token) return false;

    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    try {
      const res = await fetch(VERIFY_URL, { method: 'POST', body });
      const data = (await res.json()) as { success: boolean };
      return data.success === true;
    } catch (err) {
      this.logger.error('Turnstile verification request failed', err as Error);
      return false;
    }
  }
}
