import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Thin transport wrapper. In local dev (MAIL_DRIVER=log, the default when no
 * SMTP host is configured) it just logs the email instead of sending it, so
 * the app never needs real Gmail credentials to run.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const driver = this.config.get<string>('mail.driver');
    if (driver === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('mail.host'),
        port: this.config.get<number>('mail.port'),
        secure: this.config.get<boolean>('mail.secure'),
        auth: this.config.get<string>('mail.user')
          ? {
              user: this.config.get<string>('mail.user'),
              pass: this.config.get<string>('mail.pass'),
            }
          : undefined,
      });
    }
  }

  async send(input: SendMailInput): Promise<void> {
    const fromAddress = this.config.get<string>('mail.fromAddress');
    const fromName = this.config.get<string>('mail.fromName');

    if (!this.transporter) {
      this.logger.log(
        `[MAIL:log-driver] to=${input.to} subject="${input.subject}" — SMTP not configured, not actually sent\n${input.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
