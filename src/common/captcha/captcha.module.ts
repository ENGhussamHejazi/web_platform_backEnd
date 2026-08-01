import { Module } from '@nestjs/common';
import { CaptchaService } from './captcha.service';
import { CaptchaGuard } from './captcha.guard';

@Module({
  providers: [CaptchaService, CaptchaGuard],
  exports: [CaptchaService, CaptchaGuard],
})
export class CaptchaModule {}
