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
 * the app never needs real mail credentials to run.
 *
 * MAIL_DRIVER=brevo-api sends over HTTPS via Brevo's transactional email API
 * rather than raw SMTP, since some hosts (e.g. Render) block outbound SMTP
 * ports entirely, which raw nodemailer/SMTP has no way around.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly driver: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<string>('mail.driver');
    if (this.driver === 'smtp') {
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

    if (this.driver === 'brevo-api') {
      const apiKey = this.config.get<string>('mail.brevoApiKey');
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey ?? '',
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromAddress },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
          textContent: input.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Brevo API send failed: ${response.status} ${body}`);
      }
      return;
    }

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
