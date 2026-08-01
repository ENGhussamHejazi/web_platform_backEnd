import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CaptchaService } from './captcha.service';

// Verifies the Cloudflare Turnstile token sent as `captchaToken` in the
// request body. A no-op when TURNSTILE_SECRET_KEY isn't set (local/dev),
// so this can sit in front of any public write endpoint without extra config.
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(private readonly captchaService: CaptchaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.captchaService.isEnabled) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = (req.body as { captchaToken?: string })?.captchaToken;
    const valid = await this.captchaService.verify(token, req.ip);
    if (!valid) {
      throw new ForbiddenException('فشل التحقق الأمني (كابتشا). حاول مرة أخرى.');
    }
    return true;
  }
}
